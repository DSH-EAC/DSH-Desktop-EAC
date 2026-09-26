import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { CatalogParseError } from './catalog.ts'
import { loadCatalog, type CatalogSourcePort } from './catalog-source.ts'

const EMBEDDED = {
  apiVersion: 'catalog.mojobox.dev/v1alpha1',
  plugins: [{ id: 'dev.example.alpha', name: '@example/alpha', version: '1.2.3' }],
  packs: [
    {
      metadata: { id: 'dev.example.pack', version: '0.1.0', name: '内嵌包', description: '内嵌快照', category: 'function' },
      components: [{ id: 'dev.example.alpha', version: '1.2.3', required: false }]
    }
  ]
}

const ONLINE = {
  apiVersion: 'catalog.mojobox.dev/v1alpha1',
  plugins: [{ id: 'dev.example.alpha', name: '@example/alpha', version: '9.9.9' }],
  packs: [
    {
      metadata: { id: 'dev.example.pack', version: '0.2.0', name: '在线包', description: '在线目录', category: 'function' },
      components: [{ id: 'dev.example.alpha', version: '9.9.9', required: false }]
    }
  ]
}

function portReturning(value: unknown): CatalogSourcePort {
  return { async fetchOnline() { return value } }
}

test('loadCatalog prefers the online read when it answers with a usable catalog', async () => {
  const result = await loadCatalog({ embedded: EMBEDDED, port: portReturning(ONLINE), generatedAt: '2026-09-26T00:00:00Z' })

  assert.equal(result.source, 'online')
  assert.equal(result.degraded, false)
  assert.deepEqual(result.warnings, [])
  assert.equal(result.snapshot.packs[0]?.name, '在线包')
})

test('loadCatalog falls back to the embedded snapshot when the online read throws', async () => {
  const port: CatalogSourcePort = {
    async fetchOnline() {
      throw new Error('fetch failed: ENOTFOUND mojobox.dev')
    }
  }
  const result = await loadCatalog({ embedded: EMBEDDED, port, generatedAt: '2026-09-26T00:00:00Z' })

  assert.equal(result.source, 'snapshot')
  assert.equal(result.degraded, true)
  assert.match(result.warnings.join('\n'), /ENOTFOUND/)
  assert.equal(result.snapshot.packs[0]?.name, '内嵌包')
})

test('loadCatalog falls back to the embedded snapshot when the online catalog is malformed', async () => {
  const result = await loadCatalog({ embedded: EMBEDDED, port: portReturning({ apiVersion: 'catalog.other/v9' }) })

  assert.equal(result.source, 'snapshot')
  assert.equal(result.degraded, true)
  assert.match(result.warnings.join('\n'), /apiVersion/)
  assert.equal(result.snapshot.packs[0]?.name, '内嵌包')
})

test('loadCatalog falls back when the online catalog carries no pack at all', async () => {
  const empty = { apiVersion: 'catalog.mojobox.dev/v1alpha1', plugins: [], packs: [] }
  const result = await loadCatalog({ embedded: EMBEDDED, port: portReturning(empty) })

  assert.equal(result.source, 'snapshot')
  assert.equal(result.degraded, true)
  assert.match(result.warnings.join('\n'), /没有任何 Pack/)
})

test('loadCatalog falls back when the online read exceeds its deadline', async () => {
  const port: CatalogSourcePort = {
    fetchOnline(signal) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }
  }
  const result = await loadCatalog({ embedded: EMBEDDED, port, timeoutMs: 5 })

  assert.equal(result.source, 'snapshot')
  assert.equal(result.degraded, true)
  assert.match(result.warnings.join('\n'), /超时|timeout/i)
})

test('loadCatalog uses the snapshot without a degraded warning when the online path is disabled', async () => {
  const result = await loadCatalog({ embedded: EMBEDDED, port: portReturning(ONLINE), enabled: false, generatedAt: '2026-09-26T00:00:00Z' })

  assert.equal(result.source, 'snapshot')
  assert.equal(result.degraded, false)
  assert.match(result.warnings.join('\n'), /离线/)
  assert.equal(result.snapshot.generatedAt, '2026-09-26T00:00:00Z')
})

test('loadCatalog uses the snapshot when no online transport exists at all', async () => {
  const result = await loadCatalog({ embedded: EMBEDDED, port: null })

  assert.equal(result.source, 'snapshot')
  assert.equal(result.degraded, false)
  assert.equal(result.snapshot.packs.length, 1)
})

test('a broken embedded snapshot is fatal: there is nothing left to fall back to', async () => {
  await assert.rejects(() => loadCatalog({ embedded: { apiVersion: 'nope' }, port: null }), CatalogParseError)
})

test('an online result that fails to parse still leaves the snapshot fully usable', async () => {
  const result = await loadCatalog({
    embedded: EMBEDDED,
    port: portReturning({ apiVersion: 'catalog.mojobox.dev/v1alpha1', plugins: [], packs: [{ metadata: {} }] })
  })

  assert.equal(result.snapshot.packs.length, 1)
  assert.equal(result.snapshot.packs[0]?.components[0]?.installSpec, null)
})
