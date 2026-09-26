import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { InstallProgress, PackView } from '../protocol.ts'
import { createSelection, toggleComponent } from '../core/selection.ts'
import { component, pack } from '../core/test-fixtures.ts'
import { buildPackCard, buildPackCards, categoryLabel, installStateLabel, packCardSubtitle } from './view-model.ts'

function progress(overrides: Partial<InstallProgress> = {}): InstallProgress {
  return {
    requestId: 'pack-install-1',
    packId: 'dev.example.pack',
    state: 'running',
    startedAt: 0,
    finishedAt: null,
    error: null,
    steps: [],
    ...overrides
  }
}

test('categoryLabel names the three Mojobox pack categories', () => {
  assert.equal(categoryLabel('appearance'), '皮肤外观')
  assert.equal(categoryLabel('function'), '功能增强')
  assert.equal(categoryLabel('workflow'), '工作流')
})

test('buildPackCard renders one row per component with its tier label and source note', () => {
  const target = pack()
  const card = buildPackCard(target, createSelection(target), null)

  assert.equal(card.id, 'dev.example.pack')
  assert.equal(card.categoryLabel, '功能增强')
  assert.equal(card.rows.length, 4)

  const recommended = card.rows.find((row) => row.id === 'dev.example.recommended')
  assert.equal(recommended?.tierLabel, '可选')
  assert.equal(recommended?.selected, true)
  assert.equal(recommended?.selectable, true)
  assert.equal(recommended?.installable, true)

  const pending = card.rows.find((row) => row.id === 'dev.example.pending')
  assert.equal(pending?.installable, false)
  assert.equal(pending?.selectable, false)
  assert.equal(pending?.reason, '尚未发布制品')
})

test('buildPackCard marks an L1 row as non-deselectable and an L3 row as opt-in', () => {
  const target = pack()
  const card = buildPackCard(target, createSelection(target), null)

  assert.equal(card.rows.find((row) => row.id === 'dev.example.builtin')?.selectable, false)
  const external = card.rows.find((row) => row.id === 'dev.example.external')
  assert.equal(external?.selected, false)
  assert.equal(external?.selectable, true)
  assert.equal(external?.enableAfterInstall, false)
})

test('buildPackCard reflects a toggled selection', () => {
  const target = pack()
  const state = toggleComponent(createSelection(target), target, 'dev.example.external')
  const card = buildPackCard(target, state, null)

  assert.equal(card.rows.find((row) => row.id === 'dev.example.external')?.selected, true)
  assert.equal(card.summary.selected, 3)
})

test('buildPackCard labels a derived pack as derived and an unlocked pack as unlocked', () => {
  const derived = pack({
    id: 'dev.dsh-eac.skins.v1',
    provenance: { kind: 'snapshot-derived', locked: false, reason: '由真实目录记录派生', sources: ['a'] }
  })
  const card = buildPackCard(derived, createSelection(derived), null)

  assert.match(card.provenanceLabel, /派生/)
  assert.equal(card.locked, false)
  assert.match(card.lockedLabel, /未锁定|draft/)
})

test('buildPackCard overlays live step states from a running installation', () => {
  const target = pack()
  const card = buildPackCard(target, createSelection(target), progress({
    steps: [
      {
        componentId: 'dev.example.builtin',
        name: 'x',
        installSpec: 'x@1.0.0',
        state: 'enabled',
        tier: 'L1',
        enableRequested: true,
        enabled: true,
        message: null
      }
    ]
  }))

  assert.equal(card.rows.find((row) => row.id === 'dev.example.builtin')?.state, 'enabled')
  assert.equal(card.rows.find((row) => row.id === 'dev.example.recommended')?.state, null)
})

test('buildPackCards returns one card per pack in catalog order', () => {
  const snapshot = {
    apiVersion: 'catalog.mojobox.dev/v1alpha1',
    generatedAt: 'now',
    packs: [
      pack({ id: 'dev.example.one', name: '一' }),
      pack({ id: 'dev.example.two', name: '二', components: [component({ id: 'dev.example.only', tier: 'L2' })] })
    ]
  }
  const cards = buildPackCards(snapshot, {}, null)

  assert.deepEqual(
    cards.map((card) => card.id),
    ['dev.example.one', 'dev.example.two']
  )
  assert.equal(cards[0]?.rows.length, 4)
  assert.equal(cards[1]?.rows.length, 1)
})

test('buildPackCards uses a default selection for a pack the user has not opened', () => {
  const target = pack()
  const snapshot = { apiVersion: 'x', generatedAt: 'now', packs: [target] }
  const cards = buildPackCards(snapshot, {}, null)

  assert.equal(cards[0]?.summary.selected, 2)
})

test('installStateLabel covers idle, running, completed, failed and cancelled', () => {
  assert.deepEqual(installStateLabel(null).state, 'idle')
  assert.equal(installStateLabel(progress({ state: 'running' })).state, 'running')
  assert.match(installStateLabel(progress({ state: 'running' })).detail, /安装中|正在/)

  const completed = installStateLabel(progress({ state: 'completed', finishedAt: 5 }))
  assert.equal(completed.state, 'completed')
  assert.match(completed.label, /完成/)

  const failed = installStateLabel(progress({ state: 'failed', error: 'dev.example.builtin: pnpm 退出码 1' }))
  assert.equal(failed.state, 'failed')
  assert.match(failed.detail, /pnpm 退出码 1/)

  assert.equal(installStateLabel(progress({ state: 'cancelled' })).state, 'cancelled')
})

test('packCardSubtitle summarises members and the recommended count', () => {
  const target = pack()
  const card = buildPackCard(target, createSelection(target), null)
  const subtitle = packCardSubtitle(card)

  assert.match(subtitle, /4 个组件/)
  assert.match(subtitle, /2 个建议/)
})

test('a pack view with no component is rendered without inventing rows', () => {
  const empty: PackView = pack({ components: [] })
  const card = buildPackCard(empty, createSelection(empty), null)
  assert.deepEqual(card.rows, [])
  assert.match(packCardSubtitle(card), /0 个组件/)
})
