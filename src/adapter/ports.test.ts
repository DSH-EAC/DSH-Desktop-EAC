import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { createCliPort, createManagerPort, findEntryId, selectPort, type CliRunner, type ManagerLike } from './ports.ts'

const ARCHIFY = { componentId: 'dev.tt-a1i.archify-dsh', name: '@tt-a1i/archify-dsh' }

function manager(overrides: Partial<ManagerLike> = {}): { manager: ManagerLike; calls: unknown[] } {
  const calls: unknown[] = []
  const base: ManagerLike = {
    async installBundle(spec, options) {
      calls.push({ kind: 'installBundle', spec, options })
      return { changed: true, application: 'applied', enabled: options?.enabled ?? true }
    },
    async setPluginEnabled(id, enabled) {
      calls.push({ kind: 'setPluginEnabled', id, enabled })
      return { changed: true, application: 'applied', enabled }
    },
    async listPlugins() {
      return [{ id: 'archify-dsh', name: '@tt-a1i/archify-dsh' }]
    }
  }
  return { manager: { ...base, ...overrides }, calls }
}

test('the manager port installs through pluginManager with the tier’s activation', async () => {
  const { manager: subject, calls } = manager()
  const port = createManagerPort(subject)

  const result = await port.install('@tt-a1i/archify-dsh@0.1.0', {
    requestId: 'pack-install-1',
    componentId: ARCHIFY.componentId,
    name: ARCHIFY.name,
    activate: false
  })

  assert.deepEqual(result, { ok: true, message: null, enabled: false })
  assert.deepEqual(calls, [
    { kind: 'installBundle', spec: '@tt-a1i/archify-dsh@0.1.0', options: { enabled: false, requestId: 'pack-install-1' } }
  ])
})

test('the manager port reports a failed application with the manager’s own diagnostic', async () => {
  const { manager: subject } = manager({
    async installBundle() {
      return { changed: false, application: 'failed', error: { code: 'operation-error', diagnostic: 'pnpm 退出码 1' } }
    }
  })

  const result = await createManagerPort(subject).install('@tt-a1i/archify-dsh@0.1.0', {
    requestId: 'pack-install-1',
    componentId: ARCHIFY.componentId,
    name: ARCHIFY.name,
    activate: true
  })

  assert.equal(result.ok, false)
  assert.equal(result.message, 'pnpm 退出码 1')
})

test('a cancelled manager run is not reported as installed', async () => {
  const { manager: subject } = manager({
    async installBundle() {
      return { changed: false, application: 'cancelled' }
    }
  })

  const result = await createManagerPort(subject).install('@tt-a1i/archify-dsh@0.1.0', {
    requestId: 'pack-install-1',
    componentId: ARCHIFY.componentId,
    name: ARCHIFY.name,
    activate: true
  })

  assert.equal(result.ok, false)
  assert.match(result.message ?? '', /cancelled/)
})

test('a restart-required manager run counts as installed and says a restart is needed', async () => {
  const { manager: subject } = manager({
    async installBundle() {
      return { changed: true, application: 'restart-required', enabled: true }
    }
  })

  const result = await createManagerPort(subject).install('@tt-a1i/archify-dsh@0.1.0', {
    requestId: 'pack-install-1',
    componentId: ARCHIFY.componentId,
    name: ARCHIFY.name,
    activate: true
  })

  assert.equal(result.ok, true)
  assert.match(result.message ?? '', /重启/)
})

test('the manager port throws nothing: a transport fault becomes a failed step', async () => {
  const { manager: subject } = manager({
    async installBundle() {
      throw new Error('profile 被另一个进程锁定')
    }
  })

  const result = await createManagerPort(subject).install('x@1.0.0', {
    requestId: 'pack-install-1',
    componentId: ARCHIFY.componentId,
    name: ARCHIFY.name,
    activate: true
  })

  assert.deepEqual(result, { ok: false, message: 'profile 被另一个进程锁定' })
})

test('the manager port enables by looking the package up in the loader tree', async () => {
  const { manager: subject, calls } = manager()
  const result = await createManagerPort(subject).setEnabled(ARCHIFY, true)

  assert.deepEqual(result, { ok: true, enabled: true, message: null })
  assert.deepEqual(calls, [{ kind: 'setPluginEnabled', id: 'archify-dsh', enabled: true }])
})

test('enabling a package that is not in the profile fails instead of silently doing nothing', async () => {
  const { manager: subject } = manager({ async listPlugins() { return [] } })
  const result = await createManagerPort(subject).setEnabled(ARCHIFY, true)

  assert.equal(result.ok, false)
  assert.match(result.message ?? '', /找不到/)
})

test('findEntryId matches on package name, not on catalog id', async () => {
  const { manager: subject } = manager()
  assert.equal(await findEntryId(subject, ARCHIFY), 'archify-dsh')
  assert.equal(await findEntryId(subject, { componentId: 'dev.example.other', name: 'other' }), null)
})

test('the CLI port runs `dsh plugin --profile <name> add <spec>`', async () => {
  const calls: unknown[] = []
  const runner: CliRunner = {
    async run(command, args) {
      calls.push({ command, args })
      return { exitCode: 0, output: 'Progress: resolved 1, reused 1, downloaded 0' }
    }
  }
  const result = await createCliPort({ profile: 'web', dshCommand: 'dsh', runner }).install('@tt-a1i/archify-dsh@0.1.0', {
    requestId: 'pack-install-1',
    componentId: ARCHIFY.componentId,
    name: ARCHIFY.name,
    activate: false
  })

  assert.deepEqual(calls, [{ command: 'dsh', args: ['plugin', '--profile', 'web', 'add', '@tt-a1i/archify-dsh@0.1.0'] }])
  assert.equal(result.ok, true)
  assert.equal(result.enabled, null, 'the CLI cannot report enablement, so it must not claim any')
  assert.match(result.message ?? '', /无法报告启用状态/)
})

test('the CLI port surfaces a nonzero exit code with the tail of the output', async () => {
  const runner: CliRunner = {
    async run() {
      return { exitCode: 1, output: 'ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/x: Not Found' }
    }
  }
  const result = await createCliPort({ profile: 'web', runner }).install('x@1.0.0', {
    requestId: 'pack-install-1',
    componentId: ARCHIFY.componentId,
    name: ARCHIFY.name,
    activate: true
  })

  assert.equal(result.ok, false)
  assert.match(result.message ?? '', /退出码 1/)
  assert.match(result.message ?? '', /ERR_PNPM_FETCH_404/)
})

test('the CLI port refuses to pretend it can toggle enablement', async () => {
  const runner: CliRunner = {
    async run() {
      return { exitCode: 0, output: '' }
    }
  }
  const result = await createCliPort({ profile: 'web', runner }).setEnabled(ARCHIFY, false)

  assert.equal(result.ok, false)
  assert.equal(result.enabled, null)
  assert.match(result.message ?? '', /插件.*设置/)
})

test('selectPort prefers the manager and falls back to the CLI', () => {
  const cli = createCliPort({ profile: 'web', runner: { async run() { return { exitCode: 0, output: '' } } } })
  const { manager: subject } = manager()

  assert.equal(selectPort(undefined, cli), cli)
  assert.notEqual(selectPort(subject, cli), cli)
})
