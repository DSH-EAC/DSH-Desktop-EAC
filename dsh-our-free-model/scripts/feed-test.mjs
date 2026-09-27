/**
 * End-to-end tests for the announcement feed, against a local HTTP server that
 * stands in for the repository (so the test never touches the network).
 *
 * Covers: parsing and validation, expired/pinned handling, source failover,
 * cached-copy survival on failure, arrival detection (only genuinely new items
 * fire `onArrival`, and a fresh install stays silent), ack bookkeeping, and the
 * owner's feedUrl override.
 *
 * Run: node scripts/feed-test.mjs
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { parseFeed, fetchFeed, sortItems, AnnouncementFeed, DEFAULT_FEED_SOURCES } from '../src/feed.js'
// Controlled stand-ins for the shipped defaults: the suite must never reach
// the real GitHub sources (they answer 200 now that the repository is public).
const CONTROLLED_DEFAULTS = ['http://127.0.0.1:1/never.json']

let failures = 0
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`) }
  catch (error) { failures += 1; console.error(`FAIL  ${name} — ${error.message}`) }
}
const checkAsync = async (name, fn) => {
  try { await fn(); console.log(`  ok  ${name}`) }
  catch (error) { failures += 1; console.error(`FAIL  ${name} — ${error.message}`) }
}

const NOW = Date.parse('2026-09-25T12:00:00Z')
const item = overrides => ({ id: 'a-1', title: 'Hello', level: 'info', html: '<p>hi</p>', createdAt: '2026-09-25T00:00:00Z', ...overrides })

// ── parsing ──────────────────────────────────────────────────────────────────
check('valid feed parses', () => {
  const feed = parseFeed({ announcements: [item(), item({ id: 'a-2', level: 'urgent', pinned: true })] }, NOW)
  assert.equal(feed.announcements.length, 2)
  assert.equal(feed.announcements[0].id, 'a-2', 'pinned must sort first')
})
check('pinned beats recency, recency beats order', () => {
  const rows = parseFeed({ announcements: [item({ id: 'old', createdAt: '2026-01-01T00:00:00Z' }), item({ id: 'new', createdAt: '2026-09-24T00:00:00Z' })] }, NOW).announcements
  assert.equal(sortItems(rows)[0].id, 'new')
})
check('malformed documents rejected as a whole', () => {
  assert.throws(() => parseFeed(null, NOW))
  assert.throws(() => parseFeed([], NOW))
  assert.throws(() => parseFeed({ announcements: 'no' }, NOW))
})
check('bad rows skipped, good rows kept', () => {
  const feed = parseFeed({ announcements: [null, 'x', item({ id: '' }), item({ title: '' }), item(), item({ id: 'dup' }), item({ id: 'dup', title: 'again' })] }, NOW)
  assert.equal(feed.announcements.length, 2, 'one good + one dup')
})
check('expired items are dropped', () => {
  const feed = parseFeed({ announcements: [item({ expiresAt: '2026-09-20T00:00:00Z' }), item({ id: 'live', expiresAt: '2026-10-01T00:00:00Z' })] }, NOW)
  assert.deepEqual(feed.announcements.map(row => row.id), ['live'])
})
check('unknown level falls back to info; overlong html row dropped', () => {
  const feed = parseFeed({ announcements: [item({ level: 'shout' })] }, NOW)
  assert.equal(feed.announcements[0].level, 'info')
  const dropped = parseFeed({ announcements: [{ id: 'x', title: 't', html: '<p>' + 'y'.repeat(200 * 1024) + '</p>' }] }, NOW)
  assert.equal(dropped.announcements.length, 0)
})
check('link objects must be http(s)', () => {
  const feed = parseFeed({ announcements: [item({ link: { url: 'javascript:alert(1)' } }), item({ id: 'b', link: { url: 'https://ok.example/x', label: 'doc' } })] }, NOW)
  const withLink = feed.announcements.filter(row => row.link !== undefined)
  assert.equal(withLink.length, 1)
  assert.equal(withLink[0].link.label, 'doc')
})

// ── transport: a local "repository" ─────────────────────────────────────────
const goodFeed = JSON.stringify({ announcements: [item({ id: 'one', pinned: true }), item({ id: 'two' })] })
const newerFeed = JSON.stringify({ announcements: [...JSON.parse(goodFeed).announcements, item({ id: 'fresh', title: 'New!' })] })
const badFeed = '{"announcements": "not an array"}'
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/good.json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(goodFeed); return }
  if (url.pathname === '/newer.json') { res.writeHead(200); res.end(newerFeed); return }
  if (url.pathname === '/bad.json') { res.writeHead(200); res.end(badFeed); return }
  if (url.pathname === '/boom.json') { res.writeHead(500); res.end('no'); return }
  if (url.pathname === '/slow.json') { setTimeout(() => { res.writeHead(200); res.end(goodFeed) }, 3000); return }
  res.writeHead(404); res.end()
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

await checkAsync('fetchFeed tries sources in order', async () => {
  const { feed, source } = await fetchFeed([`${base}/boom.json`, `${base}/good.json`])
  assert.equal(source, `${base}/good.json`)
  assert.equal(feed.announcements.length, 2)
})
await checkAsync('fetchFeed throws when every source fails', async () => {
  await assert.rejects(() => fetchFeed([`${base}/boom.json`, `${base}/nope.json`]))
})
await checkAsync('a malformed feed is not accepted, next source wins', async () => {
  const { feed } = await fetchFeed([`${base}/bad.json`, `${base}/good.json`])
  assert.equal(feed.announcements.length, 2)
})

await checkAsync('watcher: first poll on a fresh install stays silent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-feed-'))
  const arrivals = []
  const feedStore = new AnnouncementFeed({
    settings: () => ({ feedUrl: `${base}/good.json` }),
    cacheFile: path.join(dir, 'feed.json'),
    onArrival: items => arrivals.push(...items),
    defaultSources: CONTROLLED_DEFAULTS,
  })
  feedStore.load()
  assert.equal(feedStore.neverFetched, true)
  await feedStore.poll()
  assert.equal(arrivals.length, 0, 'fresh install must not toast the whole backlog')
  assert.equal(feedStore.view({}).items.length, 2)
  fs.rmSync(dir, { recursive: true, force: true })
})
await checkAsync('watcher: only genuinely new items arrive', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-feed-'))
  const arrivals = []
  const feedStore = new AnnouncementFeed({
    settings: () => ({ feedUrl: `${base}/good.json` }),
    cacheFile: path.join(dir, 'feed.json'),
    onArrival: items => arrivals.push(...items),
    defaultSources: CONTROLLED_DEFAULTS,
  })
  feedStore.load()
  await feedStore.poll()
  assert.equal(arrivals.length, 0)
  // the repository published a new announcement
  feedStore.deps.settings = () => ({ feedUrl: `${base}/newer.json` })
  await feedStore.poll()
  assert.deepEqual(arrivals.map(row => row.id), ['fresh'])
  assert.equal(feedStore.view({}).unread, 3)
  assert.equal(feedStore.view({ ackedIds: ['fresh', 'one', 'two'] }).unread, 0)
  fs.rmSync(dir, { recursive: true, force: true })
})
await checkAsync('watcher: cache survives a failed poll', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-feed-'))
  const cacheFile = path.join(dir, 'feed.json')
  const feedStore = new AnnouncementFeed({
    settings: () => ({ feedUrl: `${base}/good.json` }),
    cacheFile,
    onArrival: () => {},
    defaultSources: CONTROLLED_DEFAULTS,
  })
  feedStore.load()
  await feedStore.poll()
  feedStore.deps.settings = () => ({ feedUrl: `${base}/boom.json` })
  await feedStore.poll()
  assert.equal(feedStore.view({}).items.length, 2, 'cached items still served')
  assert.ok(feedStore.view({}).error !== '', 'the failure is surfaced')
  // and the cache was persisted, so a restart keeps serving it
  const reborn = new AnnouncementFeed({ settings: () => ({}), cacheFile, onArrival: () => {} })
  reborn.load()
  assert.equal(reborn.view({}).items.length, 2)
  assert.equal(reborn.view({}).source, `${base}/good.json`)
  fs.rmSync(dir, { recursive: true, force: true })
})
await checkAsync('watcher: concurrent polls share one request', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-feed-'))
  const feedStore = new AnnouncementFeed({ settings: () => ({ feedUrl: `${base}/good.json` }), cacheFile: path.join(dir, 'f.json'), onArrival: () => {}, defaultSources: CONTROLLED_DEFAULTS })
  feedStore.load()
  const [a, b] = await Promise.all([feedStore.poll(), feedStore.poll()])
  assert.equal(a, b, 'same in-flight promise')
  fs.rmSync(dir, { recursive: true, force: true })
})
check('owner override is consulted first, {repo} expands', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-feed-'))
  const store = new AnnouncementFeed({ settings: () => ({ feedUrl: 'https://my.example/{repo}/feed.json' }), cacheFile: path.join(dir, 'f.json'), onArrival: () => {} })
  const sources = store.sources()
  assert.equal(sources[0], 'https://my.example/zouyuxuan122/dsh-our-free-model/feed.json')
  assert.ok(DEFAULT_FEED_SOURCES.every(source => sources.includes(source)), 'defaults stay as fallback')
  fs.rmSync(dir, { recursive: true, force: true })
})

server.close()
if (failures === 0) console.log('feed-test: OK')
else { console.error(`feed-test: ${failures} failure(s)`); process.exit(1) }
