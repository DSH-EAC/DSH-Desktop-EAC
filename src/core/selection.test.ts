import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { createSelection, enableIds, selectedIds, selectionSummary, toInstallRequest, toggleComponent } from './selection.ts'
import { pack } from './test-fixtures.ts'

test('createSelection preselects L1 and L2, clears L3, and blocks a source-pending row', () => {
  const state = createSelection(pack())

  assert.deepEqual(selectedIds(state), ['dev.example.builtin', 'dev.example.recommended'])
  // L1 is required-and-builtin: enabled by policy, no consent asked.
  assert.deepEqual(enableIds(state), ['dev.example.recommended'])
})

test('an installed component is not preselected again', () => {
  const state = createSelection(pack(), { installed: ['dev.example.recommended'] })

  assert.deepEqual(selectedIds(state), ['dev.example.builtin'])
})

test('toggleComponent refuses a required row and refuses to select a source-pending row', () => {
  const initial = createSelection(pack())
  assert.equal(toggleComponent(initial, pack(), 'dev.example.builtin'), initial)
  assert.equal(toggleComponent(initial, pack(), 'dev.example.pending'), initial)
})

test('toggleComponent flips an optional row on and off and drops its consent when cleared', () => {
  const initial = createSelection(pack())
  const off = toggleComponent(initial, pack(), 'dev.example.recommended')
  assert.deepEqual(selectedIds(off), ['dev.example.builtin'])
  assert.deepEqual(enableIds(off), [])

  const on = toggleComponent(off, pack(), 'dev.example.recommended')
  assert.deepEqual(selectedIds(on), ['dev.example.builtin', 'dev.example.recommended'])
  assert.deepEqual(enableIds(on), ['dev.example.recommended'])
})

test('toggleComponent never grants enable consent to an L3 row', () => {
  const state = toggleComponent(createSelection(pack()), pack(), 'dev.example.external')
  assert.deepEqual(selectedIds(state), ['dev.example.builtin', 'dev.example.recommended', 'dev.example.external'])
  assert.deepEqual(enableIds(state), ['dev.example.recommended'])
})

test('toggleComponent ignores an unknown component id', () => {
  const initial = createSelection(pack())
  assert.equal(toggleComponent(initial, pack(), 'dev.example.nope'), initial)
})

test('selectionSummary counts selectable, installable and blocked rows', () => {
  const summary = selectionSummary(pack(), createSelection(pack()))
  assert.deepEqual(summary, { total: 4, selectable: 2, selected: 2, installable: 2, blocked: 1 })
})

test('toInstallRequest turns a selection into the wire request', () => {
  const request = toInstallRequest(pack(), createSelection(pack()))
  assert.equal(request.packId, 'dev.example.pack')
  assert.deepEqual(request.componentIds, ['dev.example.builtin', 'dev.example.recommended'])
  assert.deepEqual(request.enableComponentIds, ['dev.example.recommended'])
})

test('toInstallRequest refuses an empty selection instead of installing nothing silently', () => {
  const empty = createSelection(pack(), { installed: ['dev.example.builtin', 'dev.example.recommended'] })
  assert.throws(() => toInstallRequest(pack(), empty), /selection\/empty|至少选择一个/)
})
