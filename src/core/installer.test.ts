import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { InstallProgress } from '../protocol.ts'
import { startInstall, type EnableResult, type InstallerPort, type PortComponent, type PortResult } from './installer.ts'
import { createSelection, toInstallRequest } from './selection.ts'
import { pack } from './test-fixtures.ts'

interface Call {
  readonly kind: 'install' | 'enable'
  readonly id: string
  readonly spec?: string
  readonly activate?: boolean
  readonly enabled?: boolean
}

function fakePort(
  options: { fail?: string[]; failEnable?: string[]; enabledAfter?: Record<string, boolean>; opaqueEnablement?: boolean } = {}
): { port: InstallerPort; calls: Call[] } {
  const calls: Call[] = []
  const port: InstallerPort = {
    async install(spec: string, context): Promise<PortResult> {
      calls.push({ kind: 'install', id: context.componentId, spec, activate: context.activate })
      if (options.fail?.includes(context.componentId) === true) return { ok: false, message: 'pnpm 退出码 1' }
      // A manager-backed port reads activation back; the CLI-backed port cannot.
      return options.opaqueEnablement === true
        ? { ok: true, message: null, enabled: null }
        : { ok: true, message: null, enabled: context.activate }
    },
    async setEnabled(component: PortComponent, enabled: boolean): Promise<EnableResult> {
      calls.push({ kind: 'enable', id: component.componentId, enabled })
      if (options.failEnable?.includes(component.componentId) === true) return { ok: false, enabled: false, message: '重启后生效' }
      return { ok: true, enabled: options.enabledAfter?.[component.componentId] ?? enabled, message: null }
    }
  }
  return { port, calls }
}

test('startInstall installs the selected components in pack order with their resolved specs', async () => {
  const { port, calls } = fakePort()
  const target = pack()
  const handle = startInstall({ request: toInstallRequest(target, createSelection(target)), pack: target, port })

  const progress = await handle.done

  assert.equal(progress.state, 'completed')
  assert.deepEqual(
    calls.filter((call) => call.kind === 'install'),
    [
      { kind: 'install', id: 'dev.example.builtin', spec: '@example/dev.example.builtin@1.0.0', activate: true },
      { kind: 'install', id: 'dev.example.recommended', spec: '@example/dev.example.recommended@1.0.0', activate: true }
    ]
  )
})

test('the enable decision follows the tier: L1 enables, L2 enables only with consent, L3 is never enabled', async () => {
  const target = pack()
  const state = createSelection(target)
  // Add the L3 row to the request by hand: the selection model never consents it.
  const request = { ...toInstallRequest(target, state), componentIds: [...toInstallRequest(target, state).componentIds, 'dev.example.external'] }

  const { port, calls } = fakePort()
  const progress = await startInstall({ request, pack: target, port }).done

  assert.deepEqual(calls.filter((call) => call.kind === 'enable'), [
    { kind: 'enable', id: 'dev.example.builtin', enabled: true },
    { kind: 'enable', id: 'dev.example.recommended', enabled: true }
  ])
  const external = progress.steps.find((step) => step.componentId === 'dev.example.external')
  assert.equal(external?.state, 'disabled')
  assert.equal(external?.enableRequested, false)
  assert.equal(external?.enabled, false)
  assert.match(external?.message ?? '', /L3/)
})

test('an L3 row is installed with activation off, never enabled afterwards', async () => {
  const target = pack()
  const request = { packId: target.id, componentIds: ['dev.example.external'], enableComponentIds: [] }
  const { port, calls } = fakePort()

  const progress = await startInstall({ request, pack: target, port }).done

  assert.deepEqual(calls, [{ kind: 'install', id: 'dev.example.external', spec: '@example/dev.example.external@1.0.0', activate: false }])
  assert.equal(progress.steps[0]?.state, 'disabled')
})

test('an opaque transport leaves enablement unknown instead of claiming disabled', async () => {
  const target = pack()
  const request = { packId: target.id, componentIds: ['dev.example.external'], enableComponentIds: [] }
  const { port } = fakePort({ opaqueEnablement: true })

  const progress = await startInstall({ request, pack: target, port }).done

  assert.equal(progress.steps[0]?.state, 'installed')
  assert.equal(progress.steps[0]?.enabled, null)
})

test('an L2 row without consent is installed but left disabled', async () => {
  const target = pack()
  const request = { packId: target.id, componentIds: ['dev.example.recommended'], enableComponentIds: [] }
  const { port, calls } = fakePort()

  const progress = await startInstall({ request, pack: target, port }).done

  assert.deepEqual(calls, [
    { kind: 'install', id: 'dev.example.recommended', spec: '@example/dev.example.recommended@1.0.0', activate: false }
  ])
  assert.equal(progress.steps[0]?.state, 'disabled')
  assert.equal(progress.steps[0]?.enabled, false)
})

test('a failed install marks the run failed and skips the remaining steps', async () => {
  const target = pack()
  const request = toInstallRequest(target, createSelection(target))
  const { port, calls } = fakePort({ fail: ['dev.example.builtin'] })

  const progress = await startInstall({ request, pack: target, port }).done

  assert.equal(progress.state, 'failed')
  assert.equal(progress.steps[0]?.state, 'failed')
  assert.match(progress.steps[0]?.message ?? '', /pnpm 退出码 1/)
  assert.equal(progress.steps[1]?.state, 'skipped')
  assert.deepEqual(calls.filter((call) => call.kind === 'install').length, 1)
})

test('an enable failure keeps the step installed and reports the reason', async () => {
  const target = pack()
  const request = toInstallRequest(target, createSelection(target))
  const { port } = fakePort({ failEnable: ['dev.example.recommended'] })

  const progress = await startInstall({ request, pack: target, port }).done

  assert.equal(progress.state, 'completed')
  const recommended = progress.steps.find((step) => step.componentId === 'dev.example.recommended')
  assert.equal(recommended?.state, 'installed')
  assert.equal(recommended?.enabled, false)
  assert.match(recommended?.message ?? '', /重启后生效/)
})

test('cancel stops before the next step and reports cancelled', async () => {
  const target = pack()
  const request = toInstallRequest(target, createSelection(target))
  const { port, calls } = fakePort()
  const handle = startInstall({ request, pack: target, port })
  handle.cancel()

  const progress = await handle.done

  assert.equal(progress.state, 'cancelled')
  assert.deepEqual(calls, [])
  assert.equal(progress.steps[0]?.state, 'skipped')
})

test('a request naming an unknown component is refused before anything is installed', () => {
  const target = pack()
  const { port, calls } = fakePort()
  assert.throws(
    () => startInstall({ request: { packId: target.id, componentIds: ['dev.example.nope'], enableComponentIds: [] }, pack: target, port }),
    /unknown component/
  )
  assert.deepEqual(calls, [])
})

test('a request naming a source-pending component is refused', () => {
  const target = pack()
  const { port } = fakePort()
  assert.throws(
    () => startInstall({ request: { packId: target.id, componentIds: ['dev.example.pending'], enableComponentIds: [] }, pack: target, port }),
    /no install spec/
  )
})

test('progress snapshots are pushed to the observer and never mutate in place', async () => {
  const target = pack()
  const request = toInstallRequest(target, createSelection(target))
  const seen: InstallProgress[] = []
  const progress = await startInstall({ request, pack: target, port: fakePort().port, onProgress: (value) => seen.push(value) }).done

  assert.ok(seen.length >= 3)
  assert.equal(seen[0]?.steps[0]?.state, 'pending')
  assert.equal(seen.at(-1)?.state, 'completed')
  assert.equal(seen[0]?.state, 'running')
  assert.notEqual(seen[0], progress)
  assert.equal(seen[0]?.steps[0]?.state, 'pending')
})

test('the run records injected timestamps so progress is deterministic', async () => {
  let tick = 500
  const target = pack()
  const request = toInstallRequest(target, createSelection(target))
  const progress = await startInstall({ request, pack: target, port: fakePort().port, now: () => (tick += 10) }).done

  assert.equal(progress.startedAt, 510)
  assert.equal(typeof progress.finishedAt, 'number')
  assert.ok((progress.finishedAt ?? 0) > progress.startedAt)
  assert.match(progress.requestId, /^pack-install-/)
})
