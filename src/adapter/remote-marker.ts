/**
 * Hand-written Remote method markers.
 *
 * `@deepseek-ai/dsh-typert-protocol` records Remote methods as a versioned
 * descriptor on the owning class prototype, and reads them back through
 * `remoteMethods(service)` — that is the contract the Gateway's source-mode
 * discovery uses (`dsh-api-gateway/lib/index.js`: it walks `ctx.reflect.props`,
 * finds services whose binding carries a `namespace`, and calls
 * `remoteMethods(original)`).
 *
 * Upstream produces that descriptor with the `@Remote` decorator emitted by
 * `@deepseek-ai/dsh-typert-generator`, which is not published for third-party
 * packages. Rather than depend on a code generator we cannot run, this module
 * writes the same, version-checked descriptor directly:
 *
 *   { version: 1, methods: [ { method, invocation: { kind: 'direct' } }, … ] }
 *
 * That is byte-for-byte the shape `mark()` builds for a plain `@Remote` method
 * with no export alias and no stream mode (see the protocol's `mark` and
 * `readRemoteMethodDescriptor`), and `remoteMethods` validates it on read.
 * `src/adapter/remote-marker.test.ts` asserts the round trip against the real
 * protocol package.
 *
 * @module adapter/remote-marker
 */

/** Property key of the versioned Remote descriptor (protocol constant). */
export const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/**
 * Mark public instance methods of one class prototype as direct Remote calls.
 *
 * @param prototype - the class prototype to mark, e.g. `Service.prototype`.
 * @param methods - method names, in declaration order.
 * @throws {TypeError} when a name is not a usable Remote endpoint segment.
 */
export function markRemoteMethods(prototype: object, methods: readonly string[]): void {
  const marked = methods.map((method) => {
    if (!/^[A-Za-z0-9_$.-]+$/.test(method) || method === '.' || method === '..') {
      throw new TypeError(`remote-marker: ${JSON.stringify(method)} is not a usable Remote endpoint segment`)
    }
    return Object.freeze({ method, invocation: Object.freeze({ kind: 'direct' as const }) })
  })

  Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    writable: false,
    value: Object.freeze({ version: 1, methods: Object.freeze(marked) })
  })
}
