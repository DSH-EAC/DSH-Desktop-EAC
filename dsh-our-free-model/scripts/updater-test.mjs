/**
 * End-to-end tests for the in-app upgrader, against a local HTTP server that
 * stands in for the repository.
 *
 * Covers: version comparison, manifest validation, download + SHA-256 staging,
 * staged verification, backup/restore, the install swap (including cleanup of
 * dropped files and Windows-safe rename), history, and the failure paths — a
 * corrupted download must leave the installed package untouched.
 *
 * Run: node scripts/updater-test.mjs
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { parseVersion, compareVersions, parseManifest, fileUrlOf, PluginUpdater, stageRelease, verifyStaged, backupPackage, restoreBackup, installStaged, verifyInstalled } from '../src/updater.js'
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
const sha = body => crypto.createHash('sha256').update(body).digest('hex')

// ── version comparison ───────────────────────────────────────────────────────
check('parseVersion accepts semver and pre-release', () => {
  assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3, pre: null })
  assert.deepEqual(parseVersion('1.2.3-rc.1'), { major: 1, minor: 2, patch: 3, pre: ['rc', '1'] })
  assert.equal(parseVersion('1.2'), null)
  assert.equal(parseVersion('banana'), null)
})
check('compareVersions ordering', () => {
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('1.1.0', '1.0.9'), 1)
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0'), -1)
  assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.1'), 1)
  assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.10'), -1, 'numeric pre parts compare numerically')
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1)
})

// ── manifest validation ──────────────────────────────────────────────────────
const manifestOf = overrides => ({
  version: '1.1.0', base: '../', files: [
    { path: 'index.js', sha256: 'a'.repeat(64), size: 10 },
    { path: 'package.json', sha256: 'b'.repeat(64), size: 10 },
  ], ...overrides,
})
check('manifest requires package.json', () => {
  assert.throws(() => parseManifest(manifestOf({ files: [{ path: 'index.js', sha256: 'a'.repeat(64), size: 1 }] })), /package\.json/)
})
check('manifest rejects path escapes and duplicates', () => {
  assert.throws(() => parseManifest(manifestOf({ files: [{ path: '../escape.js', sha256: 'a'.repeat(64), size: 1 }] })))
  assert.throws(() => parseManifest(manifestOf({ files: [{ path: '/abs.js', sha256: 'a'.repeat(64), size: 1 }] })))
  assert.throws(() => parseManifest(manifestOf({ files: [{ path: 'index.js', sha256: 'a'.repeat(64), size: 1 }, { path: 'index.js', sha256: 'b'.repeat(64), size: 1 }] })))
})
check('manifest rejects missing or malformed hashes', () => {
  assert.throws(() => parseManifest(manifestOf({ files: [{ path: 'index.js', sha256: 'nope', size: 1 }] })))
  assert.throws(() => parseManifest(manifestOf({ files: [{ path: 'index.js', sha256: 'a'.repeat(64), size: -5 }] })))
})
check('fileUrlOf joins base and encodes segments', () => {
  const url = fileUrlOf('https://raw.example/main/feed/manifest.json', parseManifest(manifestOf()), 'src/adapter.js')
  assert.equal(url, 'https://raw.example/main/src/adapter.js')
})

// ── the fake repository ──────────────────────────────────────────────────────
const OLD = '1.0.0'
const NEW = '1.1.0'
const oldFiles = { 'index.js': "export const v = '1.0.0'\n", 'package.json': JSON.stringify({ name: 'fake', version: OLD }), 'client.js': '// old client\n' }
const newFiles = { 'index.js': "export const v = '1.1.0'\n", 'package.json': JSON.stringify({ name: 'fake', version: NEW }), 'client.js': '// new client\n', 'src/new-deep.js': 'export const deep = true\n' }

function serveFrom(files) {
  // Keys are repo-root-relative ("index.js"); the manifest resolves
  // <base>/index.js against /repo/feed/manifest.json -> /repo/index.js.
  const stripped = {}
  for (const [key, body] of Object.entries(files)) stripped[key.replace(/^repo\//, '')] = body
  return http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.replace(/^\/repo\//, ''))
    const body = stripped[rel]
    if (body === undefined) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': 'application/octet-stream' })
    res.end(body)
  })
}
const manifestFor = files => ({
  version: NEW, base: '../', publishedAt: '2026-09-25T00:00:00Z', notes: '<p>fresh</p>',
  files: Object.entries(files).map(([rel, body]) => ({ path: rel, size: Buffer.byteLength(body), sha256: sha(body) })),
})
const newManifest = manifestFor(newFiles)
// The manifest hashes the real release; the corrupt server serves different
// bytes for index.js, so the staged copy can never hash-verify.
const corruptManifest = manifestFor(newFiles)

const server = serveFrom({ 'repo/feed/manifest.json': JSON.stringify(newManifest), 'repo/index.js': newFiles['index.js'], 'repo/package.json': newFiles['package.json'], 'repo/client.js': newFiles['client.js'], 'repo/src/new-deep.js': newFiles['src/new-deep.js'] })
const corruptServer = serveFrom({ 'repo/feed/manifest.json': JSON.stringify(corruptManifest), 'repo/index.js': 'tampered\n', 'repo/package.json': newFiles['package.json'], 'repo/client.js': newFiles['client.js'], 'repo/src/new-deep.js': newFiles['src/new-deep.js'] })
const badManifestServer = serveFrom({ 'repo/feed/manifest.json': '{"version": "oops"}' })
await Promise.all([server, corruptServer, badManifestServer].map(s => new Promise(resolve => s.listen(0, '127.0.0.1', resolve))))
const [base, corruptBase, badBase] = [server, corruptServer, badManifestServer].map(s => `http://127.0.0.1:${s.address().port}`)

function makePackage(version) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-pkg-'))
  for (const [rel, body] of Object.entries(version === OLD ? oldFiles : newFiles)) {
    const target = path.join(dir, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, body)
  }
  return dir
}
function makeDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-data-'))
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
const updaterVersion = pkg => JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version

await checkAsync('stageRelease downloads and verifies', async () => {
  const data = makeDataDir()
  const manifest = parseManifest(newManifest)
  const stats = await stageRelease({ manifest, manifestUrl: `${base}/repo/feed/manifest.json`, stageDir: path.join(data, 'stage'), fetchImpl: fetch })
  assert.equal(stats.files, 4)
  verifyStaged(path.join(data, 'stage'), manifest)
  fs.rmSync(data, { recursive: true, force: true })
})
await checkAsync('a hash mismatch aborts staging', async () => {
  const data = makeDataDir()
  const manifest = parseManifest(corruptManifest)
  await assert.rejects(() => stageRelease({ manifest, manifestUrl: `${corruptBase}/repo/feed/manifest.json`, stageDir: path.join(data, 'stage'), fetchImpl: fetch }), /sha256 mismatch|staging failed/)
  assert.equal(fs.existsSync(path.join(data, 'stage')), false, 'the bad staging copy is removed')
  fs.rmSync(data, { recursive: true, force: true })
})
await checkAsync('PluginUpdater.check detects the newer version', async () => {
  const pkg = makePackage(OLD)
  const data = makeDataDir()
  const updater = new PluginUpdater({ pkgDir: pkg, dataDir: data, settings: () => ({ feedUrl: `${base}/repo/feed/announcements.json` }), fetchImpl: fetch, defaultSources: CONTROLLED_DEFAULTS })
  const status = await updater.check()
  assert.deepEqual(status, { available: true, current: OLD, latest: NEW })
  fs.rmSync(pkg, { recursive: true, force: true })
  fs.rmSync(data, { recursive: true, force: true })
})
await checkAsync('PluginUpdater rejects an unparsable manifest', async () => {
  const pkg = makePackage(OLD)
  const data = makeDataDir()
  const updater = new PluginUpdater({ pkgDir: pkg, dataDir: data, settings: () => ({ feedUrl: `${badBase}/repo/feed/announcements.json` }), fetchImpl: fetch, defaultSources: CONTROLLED_DEFAULTS })
  await assert.rejects(() => updater.check())
  fs.rmSync(pkg, { recursive: true, force: true })
  fs.rmSync(data, { recursive: true, force: true })
})
await checkAsync('apply() upgrades the package in place and records history', async () => {
  const pkg = makePackage(OLD)
  const data = makeDataDir()
  const updater = new PluginUpdater({ pkgDir: pkg, dataDir: data, settings: () => ({ feedUrl: `${base}/repo/feed/announcements.json` }), fetchImpl: fetch, defaultSources: CONTROLLED_DEFAULTS })
  const phases = []
  const result = await updater.apply({ onProgress: progress => { if (progress?.phase !== undefined) phases.push(progress.phase) } })
  assert.deepEqual(result, { version: NEW, previous: OLD, files: 4, bytes: Object.values(newFiles).reduce((sum, body) => sum + Buffer.byteLength(body), 0) })
  assert.equal(updater.currentVersion(), NEW)
  assert.equal(JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version, NEW)
  assert.equal(fs.readFileSync(path.join(pkg, 'index.js'), 'utf8'), newFiles['index.js'])
  assert.ok(fs.existsSync(path.join(pkg, 'src', 'new-deep.js')), 'newly added files land')
  assert.deepEqual(phases, ['download', 'install'])
  // the backup holds the previous version
  assert.equal(JSON.parse(fs.readFileSync(path.join(updater.backupDir, 'package.json'), 'utf8')).version, OLD)
  // history is durable
  assert.equal(updater.history.at(-1).ok, true)
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'updates.json'), 'utf8')).applied.at(-1).to, NEW)
  // and the status flips to up-to-date
  assert.equal(updater.status().available, false)
  fs.rmSync(pkg, { recursive: true, force: true })
  fs.rmSync(data, { recursive: true, force: true })
})
await checkAsync('apply() drops files the new release removed', async () => {
  const pkg = makePackage(OLD)
  fs.writeFileSync(path.join(pkg, 'obsolete.js'), 'gone soon\n')
  // A development install *is* the git working tree, so the repository's own
  // scaffolding sits beside the shipped files: it is not part of any release,
  // and the sweep that drops obsolete files must not eat the test suite or the
  // history directory. The backup must not copy it either.
  fs.mkdirSync(path.join(pkg, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(pkg, 'scripts', 'picker-test.mjs'), 'kept\n')
  fs.mkdirSync(path.join(pkg, 'feed'), { recursive: true })
  fs.writeFileSync(path.join(pkg, 'feed', 'manifest.json'), '{}\n')
  fs.mkdirSync(path.join(pkg, '.git'), { recursive: true })
  fs.writeFileSync(path.join(pkg, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  const data = makeDataDir()
  const updater = new PluginUpdater({ pkgDir: pkg, dataDir: data, settings: () => ({ feedUrl: `${base}/repo/feed/announcements.json` }), fetchImpl: fetch, defaultSources: CONTROLLED_DEFAULTS })
  await updater.apply({})
  assert.equal(fs.existsSync(path.join(pkg, 'obsolete.js')), false, 'a file absent from the manifest is removed')
  assert.equal(fs.existsSync(path.join(pkg, 'scripts', 'picker-test.mjs')), true, 'the development scaffolding survives')
  assert.equal(fs.existsSync(path.join(pkg, 'feed', 'manifest.json')), true, 'including the feed the manifest is published from')
  assert.equal(fs.existsSync(path.join(pkg, '.git', 'HEAD')), true, 'and the git history')
  assert.equal(fs.existsSync(path.join(updater.backupDir, '.git', 'HEAD')), false, 'the rollback copy holds the package, not the repository')
  fs.rmSync(pkg, { recursive: true, force: true })
  fs.rmSync(data, { recursive: true, force: true })
})
await checkAsync('a failed apply leaves the installed package and history consistent', async () => {
  const pkg = makePackage(OLD)
  const data = makeDataDir()
  // The corrupt server's bytes never hash-verify, so staging aborts before the
  // installed package is touched; the failure lands in the history log.
  const updater = new PluginUpdater({ pkgDir: pkg, dataDir: data, settings: () => ({ feedUrl: `${corruptBase}/repo/feed/announcements.json` }), fetchImpl: fetch, defaultSources: CONTROLLED_DEFAULTS })
  await assert.rejects(() => updater.apply({}), /staging failed/)
  assert.equal(updater.currentVersion(), OLD)
  assert.equal(fs.readFileSync(path.join(pkg, 'index.js'), 'utf8'), oldFiles['index.js'])
  assert.equal(updater.history.at(-1).ok, false)
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'updates.json'), 'utf8')).applied.at(-1).ok, false)
  assert.equal(fs.existsSync(path.join(data, 'upgrade-stage')), false, 'the rejected staging copy is cleaned up')
  fs.rmSync(pkg, { recursive: true, force: true })
  fs.rmSync(data, { recursive: true, force: true })
})
await checkAsync('restoreBackup recovers a mixed install state', async () => {
  const pkg = makePackage(OLD)
  const data = makeDataDir()
  const backupDir = path.join(data, 'rollback')
  backupPackage(pkg, backupDir)
  // Simulate a swap that got half-way: some new files in, one overwritten.
  fs.writeFileSync(path.join(pkg, 'index.js'), newFiles['index.js'])
  fs.mkdirSync(path.join(pkg, 'src'), { recursive: true })
  fs.writeFileSync(path.join(pkg, 'src', 'new-deep.js'), newFiles['src/new-deep.js'])
  restoreBackup(backupDir, pkg)
  assert.equal(updaterVersion(pkg), OLD)
  assert.equal(fs.readFileSync(path.join(pkg, 'index.js'), 'utf8'), oldFiles['index.js'])
  assert.equal(fs.readFileSync(path.join(pkg, 'client.js'), 'utf8'), oldFiles['client.js'])
  assert.equal(fs.existsSync(path.join(pkg, 'src', 'new-deep.js')), false, 'files the old version never had are gone')
  fs.rmSync(pkg, { recursive: true, force: true })
  fs.rmSync(data, { recursive: true, force: true })
})
await checkAsync('installStaged + verifyInstalled accept a good stage', async () => {
  const pkg = makePackage(OLD)
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-stage-'))
  for (const [rel, body] of Object.entries(newFiles)) {
    const target = path.join(stage, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, body)
  }
  const manifest = parseManifest(newManifest)
  await installStaged(stage, pkg, manifest.files.map(file => file.path))
  verifyInstalled(pkg, manifest)
  fs.rmSync(pkg, { recursive: true, force: true })
  fs.rmSync(stage, { recursive: true, force: true })
})

for (const closer of [server, corruptServer, badManifestServer]) closer.close()
if (failures === 0) console.log('updater-test: OK')
else { console.error(`updater-test: ${failures} failure(s)`); process.exit(1) }
