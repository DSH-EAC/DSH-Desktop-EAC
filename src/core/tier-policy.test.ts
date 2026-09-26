import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { decideEnable, defaultSelected, selectable, tierLabel, tierOf, tierSourceLabel } from './tier-policy.ts'

test('distributionClass maps to the plan’s L1/L2/L3 tiers', () => {
  assert.equal(tierOf('builtin'), 'L1')
  assert.equal(tierOf('recommended'), 'L2')
  assert.equal(tierOf('external'), 'L3')
})

test('an unknown class fails safe to L3', () => {
  assert.equal(tierOf(null), 'L3')
})

test('L1 enables, L2 follows the user, L3 never auto-enables', () => {
  assert.equal(decideEnable('L1', false).action, 'enable')
  assert.equal(decideEnable('L2', true).action, 'enable')
  assert.equal(decideEnable('L2', false).action, 'leave-disabled')
  assert.equal(decideEnable('L3', true).action, 'leave-disabled')
})

test('L3 stays disabled even when the user ticks enable, and says why', () => {
  const decision = decideEnable('L3', true)
  assert.equal(decision.action, 'leave-disabled')
  assert.match(decision.reason, /L3/)
})

test('L1 and L2 start selected, L3 starts cleared', () => {
  assert.equal(defaultSelected('L1'), true)
  assert.equal(defaultSelected('L2'), true)
  assert.equal(defaultSelected('L3'), false)
})

test('a required row and an L1 row are not user-deselectable', () => {
  assert.equal(selectable('L1', false), false)
  assert.equal(selectable('L2', true), false)
  assert.equal(selectable('L2', false), true)
  assert.equal(selectable('L3', false), true)
})

test('labels are stable and non-empty', () => {
  assert.equal(tierLabel('L1'), '建议安装')
  assert.equal(tierLabel('L2'), '可选')
  assert.equal(tierLabel('L3'), '不推荐')
  assert.match(tierSourceLabel('desktop-sync'), /分级注册表/)
  assert.match(tierSourceLabel('unmapped'), /L3/)
})
