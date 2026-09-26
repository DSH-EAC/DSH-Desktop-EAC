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

test('the derived skin pack is present, labelled as derived, and carries the full v1.1.0 chain', () => {
  const skins = findPack(snapshot, 'dev.dsh-eac.skins.v1')
  assert.ok(skins)
  assert.equal(skins.provenance.kind, 'snapshot-derived')
  assert.match(skins.provenance.reason, /M4|source-pending/)
  assert.equal(skins.version, '1.1.0')
  assert.deepEqual(skins.components.map((component) => component.id), [
    'dev.eac.ui-skin-loader',
    'dev.eac.skin-aurora',
    'dev.eac.skin-blue-fantasy',
    'dev.eac.skin-deep-whale-day-night',
    'dev.eac.skin-dragon-heir',
    'dev.eac.skin-inkwash',
    'dev.eac.skin-maid-atelier',
    'dev.eac.skin-miku',
    'dev.eac.skin-minecraft',
    'dev.eac.skin-qq98',
    'dev.eac.skin-ths',
    'dev.eac.skin-trading',
    'dev.eac.skin-whale-song',
    'dev.eac.skin-xp'
  ])
  assert.deepEqual(skins.provenance.sources, skins.components.map((component) => component.id))

  const loader = skins.components.find((component) => component.id === 'dev.eac.ui-skin-loader')
  assert.ok(loader)
  assert.equal(loader.required, true)
  assert.match(loader.installSpec ?? '', /^https:\/\/github\.com\/DSH-EAC\/dsh-ui-skin-loader\/releases\/download\/v1\.1\.0\//)
})

test('every skin-chain member keeps the v1.1.0 release URL that matches its own version and digest', () => {
  const skins = findPack(snapshot, 'dev.dsh-eac.skins.v1')
  assert.ok(skins)
  for (const component of skins.components) {
    assert.equal(component.version, '1.1.0', `${component.id} is not on the v1.1.0 chain`)
    assert.match(component.artifactUrl ?? '', new RegExp(`/releases/download/v1\\.1\\.0/${component.name.replace('@dsh-eac/', 'dsh-eac-')}-1\\.1\\.0\\.tgz$`))
    // Offline installability is the whole point of the embedded snapshot: a
    // member whose release URL did not become an install spec would be a
    // silently uninstallable row.
    assert.equal(component.installSpec, component.artifactUrl)
    assert.equal(component.sourcePending, false)
    assert.match(component.artifactDigest ?? '', /^sha256:[a-f0-9]{64}$/)
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

test('the derived skin chain records its tier as an installer policy, not as an upstream class', () => {
  const skins = findPack(snapshot, 'dev.dsh-eac.skins.v1')
  assert.ok(skins)
  for (const component of skins.components) {
    assert.equal(component.distributionClass, 'recommended')
    assert.equal(component.tier, 'L2')
    assert.equal(component.tierSource, 'installer-policy')
  }
})
