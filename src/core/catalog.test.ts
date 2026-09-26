import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { CatalogParseError, parseCatalog, findPack } from './catalog.ts'

const PLUGINS = [
  {
    id: 'dev.example.alpha',
    name: '@example/alpha',
    version: '1.2.3',
    artifact: { digest: 'sha256:aa', path: 'https://registry.npmjs.org/@example/alpha/-/alpha-1.2.3.tgz' }
  },
  {
    id: 'dev.example.beta',
    name: 'beta-plugin',
    version: '0.4.0',
    artifact: { digest: 'sha256:bb', path: 'https://github.com/example/beta/releases/download/v0.4.0/beta-0.4.0.tgz' }
  },
  {
    id: 'dev.example.gamma',
    name: 'gamma-plugin',
    version: '2.0.0',
    artifact: { digest: 'sha256:cc', path: 'https://github.com/example/gamma/releases/download/v2.0.0/gamma-2.0.0.tgz' },
    'x-mojobox-distribution': { distributionClass: 'recommended' }
  }
]

function catalog(packs: unknown[], plugins: unknown[] = PLUGINS): unknown {
  return { apiVersion: 'catalog.mojobox.dev/v1alpha1', plugins, packs }
}

function pack(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    metadata: { id: 'dev.example.pack', version: '0.1.0', name: '示例包', description: '示例', category: 'function' },
    components: [
      { id: 'dev.example.alpha', version: '1.2.3', required: false },
      { id: 'dev.example.beta', version: '0.4.0', required: true }
    ],
    ...overrides
  }
}

test('parseCatalog resolves a lock npm source into a pnpm registry spec', () => {
  const snapshot = parseCatalog(
    catalog([
      pack({
        lock: {
          components: [
            { id: 'dev.example.alpha', source: 'npm:@example/alpha@1.2.3' },
            { id: 'dev.example.beta', source: 'npm:beta-plugin@0.4.0' }
          ]
        }
      })
    ])
  )

  const parsed = findPack(snapshot, 'dev.example.pack')
  assert.ok(parsed)
  assert.equal(parsed.provenance.locked, true)
  assert.equal(parsed.components[0]?.installSpec, '@example/alpha@1.2.3')
  assert.equal(parsed.components[1]?.installSpec, 'beta-plugin@0.4.0')
  assert.equal(parsed.components[0]?.sourcePending, false)
  assert.equal(parsed.components[1]?.required, true)
})

test('parseCatalog falls back to a tarball URL for a component without a lock and marks it unlocked', () => {
  const snapshot = parseCatalog(
    catalog([
      pack({
        components: [
          { id: 'dev.example.alpha', version: '1.2.3', required: false },
          { id: 'dev.example.beta', version: '0.4.0', required: false }
        ]
      })
    ])
  )

  const parsed = findPack(snapshot, 'dev.example.pack')
  assert.ok(parsed)
  assert.equal(parsed.provenance.locked, false)
  assert.match(parsed.provenance.reason, /Pack Lock/)
  assert.equal(parsed.components[1]?.installSpec, 'https://github.com/example/beta/releases/download/v0.4.0/beta-0.4.0.tgz')
})

test('parseCatalog marks a component with no distributable artifact as source-pending', () => {
  const plugins = [
    {
      id: 'dev.example.delta',
      name: 'delta-plugin',
      version: '3.0.0',
      'x-mojobox-maintenance': { source: 'registry-maintained', reason: '未发布任何制品' }
    }
  ]
  const snapshot = parseCatalog(
    catalog([pack({ components: [{ id: 'dev.example.delta', version: '3.0.0', required: false }] })], plugins)
  )

  const component = findPack(snapshot, 'dev.example.pack')?.components[0]
  assert.ok(component)
  assert.equal(component.installSpec, null)
  assert.equal(component.sourcePending, true)
  assert.equal(component.reason, '未发布任何制品')
})

test('parseCatalog reads the distribution class and derives the tier', () => {
  const snapshot = parseCatalog(
    catalog([pack({ components: [{ id: 'dev.example.gamma', version: '2.0.0', required: false }] })])
  )

  const component = findPack(snapshot, 'dev.example.pack')?.components[0]
  assert.ok(component)
  assert.equal(component.distributionClass, 'recommended')
  assert.equal(component.tier, 'L2')
  assert.equal(component.tierSource, 'desktop-sync')
})

test('parseCatalog fails safe to L3 for a component nothing classifies', () => {
  const snapshot = parseCatalog(
    catalog([pack({ components: [{ id: 'dev.example.alpha', version: '1.2.3', required: false }] })])
  )

  const component = findPack(snapshot, 'dev.example.pack')?.components[0]
  assert.ok(component)
  assert.equal(component.distributionClass, null)
  assert.equal(component.tier, 'L3')
  assert.equal(component.tierSource, 'unmapped')
})

test('parseCatalog reads an explicit derived-pack provenance', () => {
  const snapshot = parseCatalog(
    catalog([
      pack({
        'x-dsh-eac-provenance': {
          kind: 'snapshot-derived',
          reason: '由真实目录记录派生',
          sources: ['dev.example.alpha']
        }
      })
    ])
  )

  const parsed = findPack(snapshot, 'dev.example.pack')
  assert.ok(parsed)
  assert.equal(parsed.provenance.kind, 'snapshot-derived')
  assert.deepEqual(parsed.provenance.sources, ['dev.example.alpha'])
})

test('parseCatalog refuses a pack naming an unknown plugin record', () => {
  assert.throws(
    () => parseCatalog(catalog([pack({ components: [{ id: 'dev.example.missing', version: '1.0.0', required: false }] })])),
    (error: unknown) => error instanceof CatalogParseError && /no catalog plugin record/.test(error.message)
  )
})

test('parseCatalog refuses a foreign apiVersion', () => {
  assert.throws(
    () => parseCatalog({ apiVersion: 'catalog.other/v9', plugins: [], packs: [] }),
    (error: unknown) => error instanceof CatalogParseError && /apiVersion/.test(error.message)
  )
})

test('parseCatalog refuses an unknown distribution class instead of downgrading it', () => {
  const plugins = [
    { id: 'dev.example.alpha', name: '@example/alpha', version: '1.2.3', 'x-mojobox-distribution': { distributionClass: 'core' } }
  ]
  assert.throws(
    () => parseCatalog(catalog([pack({ components: [{ id: 'dev.example.alpha', version: '1.2.3', required: false }] })], plugins)),
    (error: unknown) => error instanceof CatalogParseError && /distributionClass/.test(error.message)
  )
})

test('parseCatalog refuses a non-npm lock source rather than mistyping it into pnpm', () => {
  assert.throws(
    () =>
      parseCatalog(
        catalog([
          pack({
            lock: { components: [{ id: 'dev.example.alpha', source: 'github:example/alpha@1.2.3' }] }
          })
        ])
      ),
    (error: unknown) => error instanceof CatalogParseError && /unsupported lock source/.test(error.message)
  )
})

test('parseCatalog refuses a non-object document and a missing plugin array', () => {
  assert.throws(() => parseCatalog(null), CatalogParseError)
  assert.throws(() => parseCatalog({ apiVersion: 'catalog.mojobox.dev/v1alpha1', packs: [] }), /plugins/)
  assert.throws(() => parseCatalog({ apiVersion: 'catalog.mojobox.dev/v1alpha1', plugins: [] }), /packs/)
})
