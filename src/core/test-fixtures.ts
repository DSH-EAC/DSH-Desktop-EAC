/**
 * Shared fixtures for the core unit tests. Not a test file: the `test` script
 * only picks up `*.test.ts`, so this module is imported, never executed alone.
 *
 * @module core/test-fixtures
 */

import type { PackComponent, PackView } from '../protocol.ts'

export function component(overrides: Partial<PackComponent> & Pick<PackComponent, 'id' | 'tier'>): PackComponent {
  return {
    name: `@example/${overrides.id}`,
    version: '1.0.0',
    installSpec: `@example/${overrides.id}@1.0.0`,
    artifactUrl: null,
    artifactDigest: null,
    distributionClass: null,
    tierSource: 'unmapped',
    required: false,
    sourcePending: false,
    reason: null,
    ...overrides
  }
}

export function pack(overrides: Partial<PackView> = {}): PackView {
  return {
    id: 'dev.example.pack',
    version: '0.1.0',
    name: '示例包',
    description: '示例说明',
    category: 'function',
    provenance: { kind: 'mojobox-pack', locked: true, reason: '来自 Mojobox Pack 与 Pack Lock', sources: [] },
    components: [
      component({ id: 'dev.example.builtin', tier: 'L1', distributionClass: 'builtin', tierSource: 'desktop-sync', required: true }),
      component({ id: 'dev.example.recommended', tier: 'L2', distributionClass: 'recommended', tierSource: 'desktop-sync' }),
      component({ id: 'dev.example.external', tier: 'L3', distributionClass: 'external', tierSource: 'desktop-sync' }),
      component({ id: 'dev.example.pending', tier: 'L3', installSpec: null, sourcePending: true, reason: '尚未发布制品' })
    ],
    ...overrides
  }
}
