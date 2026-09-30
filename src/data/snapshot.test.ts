/**
 * Contract of the embedded offline snapshot.
 *
 * These assertions are the guard rail on `scripts/build-snapshot.mjs`: they
 * fail if the snapshot stops being real data (a pack loses its lock source, a
 * member loses its artifact, the derived skin view loses its provenance label).
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { findPack, parseCatalog } from '../core/catalog.ts'
import { SNAPSHOT_GENERATED_AT, snapshotDocument } from './snapshot.ts'

const snapshot = parseCatalog(snapshotDocument, { generatedAt: SNAPSHOT_GENERATED_AT })

test('the embedded snapshot parses and carries a build timestamp', () => {
  assert.ok(snapshot.packs.length >= 5)
  assert.match(SNAPSHOT_GENERATED_AT, /^\d{4}-\d{2}-\d{2}T/)
})

test('the embedded snapshot carries the real Mojobox packs', () => {
  for (const id of [
    'dev.dsh-eac.recommended.v1',
    'dev.mojobox.focus-kit',
    'dev.mojobox.windows-operator',
    'dev.aio.appearance',
    'dev.aio.function'
  ]) {
    assert.ok(findPack(snapshot, id), `snapshot is missing pack ${id}`)
  }
})

test('a locked pack resolves its members to real npm registry specs', () => {
  const recommended = findPack(snapshot, 'dev.dsh-eac.recommended.v1')
  assert.ok(recommended)
  assert.equal(recommended.provenance.kind, 'mojobox-pack')
  assert.equal(recommended.provenance.locked, true)

  const archify = recommended.components.find((component) => component.id === 'dev.tt-a1i.archify-dsh')
  assert.ok(archify)
  assert.equal(archify.installSpec, '@tt-a1i/archify-dsh@0.1.0')
  assert.equal(archify.sourcePending, false)
  assert.match(archify.artifactDigest ?? '', /^sha256:[a-f0-9]{64}$/)
})

test('EAC-CORE-SHELL-01: the derived skin pack is gone; skins remain catalog index records only', () => {
  // 皮肤平台随 EAC-CORE-SHELL-01 外迁：安装器不再派生 `dev.dsh-eac.skins.v1`
  // 外观包，也不为皮肤链钉任何分级。皮肤仍在 Mojobox 目录中作为索引记录
  // 存在（Market Core 按需安装），但不再由本安装器预置或强推。
  assert.equal(findPack(snapshot, 'dev.dsh-eac.skins.v1'), undefined,
    '派生的皮肤包必须随外迁移除');
  const rawPlugins = (snapshotDocument as { plugins?: { id?: string; 'x-mojobox-distribution'?: { distributionClass?: string; source?: string } }[] }).plugins ?? []
  const skinRecords = rawPlugins.filter((record) => (record.id ?? '').startsWith('dev.eac.skin-')
    || record.id === 'dev.eac.ui-skin-loader')
  assert.ok(skinRecords.length >= 14, `皮肤索引记录仍应留在目录中（实际 ${skinRecords.length}）`);
  for (const record of skinRecords) {
    assert.notEqual(record['x-mojobox-distribution']?.distributionClass, 'recommended',
      `${record.id} 不得再被安装器策略钉成 recommended`);
    assert.notEqual(record['x-mojobox-distribution']?.source, 'installer-policy',
      `${record.id} 不得再声明 installer-policy 分级来源`);
  }
})

test('every snapshot component carries a real artifact and none is silently uninstallable', () => {
  for (const pack of snapshot.packs) {
    const installable = pack.components.filter((component) => component.installSpec !== null)
    assert.ok(installable.length > 0, `${pack.id} has no installable component`)
    for (const component of pack.components) {
      assert.match(component.artifactDigest ?? '', /^sha256:[a-f0-9]{64}$/, `${component.id} has no artifact digest`)
      if (component.sourcePending) assert.ok(component.reason, `${component.id} is source-pending without a reason`)
    }
  }
})

test('the snapshot inherits the EAC desktop distribution classes where the registry classifies a package', () => {
  const recommended = findPack(snapshot, 'dev.dsh-eac.recommended.v1')
  const meow = recommended?.components.find((component) => component.id === 'dev.phant0meow.meow-smooth')
  assert.ok(meow)
  assert.equal(meow.distributionClass, 'external')
  assert.equal(meow.tier, 'L3')
  assert.equal(meow.tierSource, 'desktop-sync')

  const focusKit = findPack(snapshot, 'dev.mojobox.focus-kit')
  const sidebar = focusKit?.components.find((component) => component.id === 'dev.omdsh.dsh-better-sidebar')
  assert.ok(sidebar)
  assert.equal(sidebar.distributionClass, 'recommended')
  assert.equal(sidebar.tier, 'L2')
})

test('an unclassified component fails safe to L3/unmapped rather than being promoted', () => {
  const recommended = findPack(snapshot, 'dev.dsh-eac.recommended.v1')
  const archify = recommended?.components.find((component) => component.id === 'dev.tt-a1i.archify-dsh')
  assert.ok(archify)
  assert.equal(archify.distributionClass, null)
  assert.equal(archify.tier, 'L3')
  assert.equal(archify.tierSource, 'unmapped')
})

