/**
 * Round-trip check of the hand-written Remote marker against the real protocol
 * package. This is the guard that keeps {@link markRemoteMethods} honest: if
 * upstream changes the descriptor shape, this test fails before the plugin
 * silently stops exposing any Remote method.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'

import { REMOTE_METHOD_DESCRIPTOR, markRemoteMethods } from './remote-marker.ts'

class Sample {
  catalog(): string {
    return 'catalog'
  }

  install(): string {
    return 'install'
  }

  notRemote(): string {
    return 'notRemote'
  }
}

markRemoteMethods(Sample.prototype, ['catalog', 'install'])

test('remoteMethods reads back exactly the methods that were marked, in order', () => {
  const marked = remoteMethods(new Sample())

  assert.deepEqual(
    marked.map((entry) => entry.method),
    ['catalog', 'install']
  )
  for (const entry of marked) assert.deepEqual(entry.invocation, { kind: 'direct' })
})

test('the descriptor carries the protocol version the reader requires', () => {
  const descriptor = (Sample.prototype as unknown as Record<string, unknown>)[REMOTE_METHOD_DESCRIPTOR]
  assert.ok(descriptor)
  assert.equal((descriptor as { version: number }).version, 1)
  assert.equal(Object.isFrozen(descriptor), true)
})

test('marking is idempotent for the same method list and refuses a bad segment', () => {
  markRemoteMethods(Sample.prototype, ['catalog', 'install'])
  assert.equal(remoteMethods(new Sample()).length, 2)
  assert.throws(() => markRemoteMethods(class {}.prototype, ['not a segment']), TypeError)
})

test('the marker does not leak onto instances or onto unmarked methods', () => {
  const instance = new Sample()
  assert.equal(Object.hasOwn(instance, REMOTE_METHOD_DESCRIPTOR), false)
  assert.equal(remoteMethods(instance).some((entry) => entry.method === 'notRemote'), false)
})
