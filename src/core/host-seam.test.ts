import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { describeHostSeam, postInstallSteps, surfaceOf, type HostSeamFacts } from './host-seam.ts'

const FULL: HostSeamFacts = {
  managerMounted: true,
  accountMounted: true
}

test('the seam reuses the official settings shell, install UI and account surface', () => {
  const seam = describeHostSeam(FULL)

  assert.equal(seam.settingsShell, 'settings.section')
  assert.equal(seam.installUi, 'official-plugin-manager')
  assert.equal(seam.account, 'account')
  assert.equal(seam.accountSection, 'account')
  assert.equal(seam.manager, 'pluginManager')
})

test('credentials are always owned by the official account surface, never by this plugin', () => {
  for (const facts of [FULL, { ...FULL, accountMounted: false }, { ...FULL, managerMounted: false }]) {
    assert.equal(describeHostSeam(facts).credentials, 'official-account-remote')
  }
})

test('an unmounted account surface reads as absent, never as signed in', () => {
  const seam = describeHostSeam({ managerMounted: false, accountMounted: false })

  assert.equal(seam.manager, 'cli-fallback')
  assert.equal(seam.account, null)
  // The settings shell and install UI stay declared reuse targets: they are
  // construction-time decisions, not runtime probes.
  assert.equal(seam.settingsShell, 'settings.section')
  assert.equal(seam.installUi, 'official-plugin-manager')
})

test('the section carries a small text wordmark rather than a collected asset', () => {
  const seam = describeHostSeam(FULL)
  assert.equal(seam.wordmark, 'DSH·EAC')
  assert.ok(seam.wordmark.length <= 12)
})

test('a signed-out account ends the install at the official sign-in surface', () => {
  const steps = postInstallSteps({
    installedCount: 3,
    enabledCount: 3,
    unknownEnablementCount: 0,
    restartRequired: false,
    account: 'signed-out'
  })

  assert.equal(steps.length, 1)
  assert.equal(steps[0]?.kind, 'sign-in')
  assert.equal(surfaceOf(steps[0]!), 'official-account-settings')
  assert.match(steps[0]?.detail ?? '', /无需填写 API Key|无需 API Key/)
})

test('the sign-in step never offers a plugin-owned credential form', () => {
  const steps = postInstallSteps({
    installedCount: 1,
    enabledCount: 1,
    unknownEnablementCount: 0,
    restartRequired: false,
    account: 'signed-out'
  })

  const detail = steps.map((step) => step.detail).join('\n')
  assert.doesNotMatch(detail, /api[\s_-]?key\s*[:：]|粘贴|输入密钥/)
  assert.match(detail, /本插件不接触任何密钥/)
})

test('an unreadable account state asks the user to confirm, not to sign in again blindly', () => {
  const steps = postInstallSteps({
    installedCount: 1,
    enabledCount: 1,
    unknownEnablementCount: 0,
    restartRequired: false,
    account: 'unknown'
  })

  assert.equal(steps[0]?.kind, 'sign-in')
  assert.match(steps[0]?.label ?? '', /确认/)
})

test('a fully signed-in, fully enabled install needs no follow-up step', () => {
  const steps = postInstallSteps({
    installedCount: 2,
    enabledCount: 2,
    unknownEnablementCount: 0,
    restartRequired: false,
    account: 'signed-in'
  })

  assert.equal(steps.length, 1)
  assert.equal(steps[0]?.kind, 'done')
  assert.equal(steps[0]?.target, null)
})

test('unknown enablement and a pending restart are reported before sign-in', () => {
  const steps = postInstallSteps({
    installedCount: 2,
    enabledCount: 1,
    unknownEnablementCount: 1,
    restartRequired: true,
    account: 'signed-out'
  })

  assert.deepEqual(
    steps.map((step) => step.kind),
    ['enable-plugins', 'restart', 'sign-in']
  )
  assert.equal(surfaceOf(steps[0]!), 'official-plugin-settings')
  assert.equal(surfaceOf(steps[1]!), 'official-restart')
  assert.equal(surfaceOf(steps[2]!), 'official-account-settings')
})

test('an install that changed nothing says so instead of inventing follow-up work', () => {
  const steps = postInstallSteps({
    installedCount: 0,
    enabledCount: 0,
    unknownEnablementCount: 0,
    restartRequired: false,
    account: 'signed-out'
  })

  assert.deepEqual(
    steps.map((step) => step.kind),
    ['done']
  )
})
