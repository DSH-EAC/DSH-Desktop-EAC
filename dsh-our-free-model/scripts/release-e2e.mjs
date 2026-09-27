/**
 * Does the release this repository actually describes install cleanly?
 *
 * `updater-test.mjs` verifies the upgrade *mechanism* against synthetic fixtures.
 * This asks the narrower and nastier question about the real `feed/manifest.json`
 * and the real files it names, because that pairing is the publisher's promise to
 * every installed user: a manifest whose byte count or digest disagrees with the
 * tree makes the in-app upgrade fail verification for all of them at once, and
 * nothing else in the build notices (issue #1).
 *
 * The negative control is what makes the pass mean something: a manifest that
 * lies about one file's size has to be refused, so a check that only ever
 * "verifies" nothing cannot slip through here.
 *
 * Local HTTP only — no network, no free-lane quota.
 *
 * Run: node scripts/release-e2e.mjs
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { publishedBytes } from './lib/published-bytes.mjs'
import { PluginUpdater } from '../src/updater.js'

const repo = fileURLToPath(new URL('..', import.meta.url))
const PREVIOUS = '1.2.1'
const manifestRaw = fs.readFileSync(path.join(repo, 'feed/manifest.json'))
const manifest = JSON.parse(manifestRaw.toString('utf8'))

let failures = 0
const check = async (name, fn) => {
  try { await fn(); console.log(`ok   ${name}`) }
  catch (error) { failures++; console.log(`FAIL ${name} — ${error.message}`) }
}
const assert = (cond, message) => { if (!cond) throw new Error(message) }
const sha = body => crypto.createHash('sha256').update(body).digest('hex')
const CRLF_MARK = Buffer.from('\r\n')

/** A stand-in for the installed copy: one release behind, with a stale file. */
function installedPackage(dir) {
  for (const item of ['index.js', 'client.js', 'package.json', 'icon.svg', 'src', 'locale']) {
    fs.cpSync(path.join(repo, item), path.join(dir, item), { recursive: true })
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.version = PREVIOUS
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  fs.writeFileSync(path.join(dir, 'client.js'), 'stale installed copy\n')
  return dir
}

/** Serve the repository the way GitHub does, so file URLs resolve beside it. */
let tampered = null
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(String(req.url ?? '').split('?')[0])
  if (url === '/feed/manifest.json') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(tampered ?? manifestRaw)
    return
  }
  const file = path.resolve(repo, `.${url}`)
  if (!file.startsWith(path.resolve(repo)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
    return
  }
  res.writeHead(200, { 'content-type': 'application/octet-stream' })
  // What GitHub hands out is the blob, and the blob is LF: serve the same, or the
  // test would be downloading something no user ever does.
  res.end(publishedBytes(fs.readFileSync(file)))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
server.unref()
const base = `http://127.0.0.1:${server.address().port}`

function updaterFor(pkgDir, dataDir) {
  fs.mkdirSync(dataDir, { recursive: true })
  return new PluginUpdater({
    pkgDir, dataDir,
    settings: () => ({ feedUrl: `${base}/feed/announcements.json` }),
    fetchImpl: fetch,
    // The published CDN sources stay out of a test run: only this server.
    defaultSources: [],
    log: () => {},
  })
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-release-'))
console.log(`manifest: version=${manifest.version}, ${manifest.files.length} files, ${manifest.files.reduce((sum, row) => sum + row.size, 0)} bytes`)

await check('the manifest describes the tree it lives in', () => {
  const drifted = manifest.files.filter(row => {
    const file = path.join(repo, row.path)
    if (!fs.existsSync(file)) return true
    const body = publishedBytes(fs.readFileSync(file))
    return body.length !== row.size || sha(body) !== row.sha256
  })
  assert(drifted.length === 0, `drifted: ${drifted.map(row => row.path).join(', ')} — run: node scripts/build-manifest.mjs`)
})

await check('every file the package ships is named by the manifest, however deep', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
  const shipped = []
  const walk = rel => {
    const absolute = path.join(repo, rel)
    const stat = fs.statSync(absolute)
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        walk(path.join(rel, entry.name))
      }
    } else if (stat.isFile()) shipped.push(rel.replace(/\\/g, '/'))
  }
  for (const rel of ['package.json', ...(pkg.files ?? [])]) walk(rel)
  const named = new Set(manifest.files.map(row => row.path))
  const missing = shipped.filter(item => !named.has(item))
  // Not just "installed unverified", which is the mirror image of issue #1:
  // `installStaged` sweeps whatever the manifest does not name out of the
  // installed package, so one nested file the builder failed to list is deleted
  // from every user's copy while the digest check still passes.
  assert(missing.length === 0, `not covered: ${missing.join(', ')}`)
})

await check('a CRLF working tree describes the same release', () => {
  // The exact shape issue #1 came back in: an editor leaves the tree CRLF, `git
  // status` stays clean because `.gitattributes` normalises on checkin, and a
  // manifest built from those bytes promises a longer file than the LF blob that
  // actually downloads. The builder normalises now, so the two agree either way —
  // which only a CRLF tree can demonstrate.
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-crlf-'))
  fs.cpSync(repo, path.join(copy, 'repo'), {
    recursive: true,
    filter: source => !/[\\/](node_modules|\.git|\.verify)([\\/]|$)/.test(source),
  })
  const root = path.join(copy, 'repo')
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const targets = []
  const collect = rel => {
    const absolute = path.join(root, rel)
    if (fs.statSync(absolute).isDirectory()) {
      for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        collect(path.join(rel, entry.name))
      }
    } else targets.push(absolute)
  }
  for (const rel of ['package.json', ...(pkg.files ?? [])]) collect(rel)
  for (const file of targets) {
    const body = fs.readFileSync(file)
    if (body.includes(0)) continue
    fs.writeFileSync(file, Buffer.from(body.toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8'))
  }
  const grown = targets.filter(file => {
    const body = fs.readFileSync(file)
    return body.includes(CRLF_MARK)
  })
  assert(grown.length > 3, `the fixture did not actually become CRLF (${grown.length} files)`)
  const run = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-manifest.mjs'), '--check'], { encoding: 'utf8' })
  assert(run.status === 0, `--check failed on a CRLF tree: ${(run.stderr ?? '').trim().split('\n').slice(0, 3).join(' / ')}`)
  fs.rmSync(copy, { recursive: true, force: true })
  console.log(`     ${grown.length} files held at CRLF and the manifest still matched the blob`)
})

await check('an older installed copy is offered this release', async () => {
  const pkgDir = installedPackage(path.join(scratch, 'a', 'node_modules', 'dsh-our-free-model'))
  const status = await updaterFor(pkgDir, path.join(scratch, 'a', 'dsh-home')).check()
  assert(status.available === true, `not offered: ${JSON.stringify(status)}`)
  assert(status.latest === manifest.version, `latest ${status.latest} != ${manifest.version}`)
  assert(status.current === PREVIOUS, `current read as ${status.current}`)
})

await check('applying it installs every real file and the digests match', async () => {
  const pkgDir = installedPackage(path.join(scratch, 'b', 'node_modules', 'dsh-our-free-model'))
  const dataDir = path.join(scratch, 'b', 'dsh-home')
  await updaterFor(pkgDir, dataDir).apply({ version: manifest.version })
  const installed = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
  assert(installed.version === manifest.version, `installed ${installed.version}, wanted ${manifest.version}`)
  assert(fs.readFileSync(path.join(pkgDir, 'client.js'), 'utf8').length > 1000, 'the stale file was not replaced')
  for (const row of manifest.files) {
    const file = path.join(pkgDir, row.path)
    assert(fs.existsSync(file), `${row.path} did not arrive`)
    const body = fs.readFileSync(file)
    assert(body.length === row.size, `${row.path}: ${body.length} bytes installed, manifest promised ${row.size}`)
    assert(sha(body) === row.sha256, `${row.path}: installed digest differs from the manifest`)
  }
  const history = JSON.parse(fs.readFileSync(path.join(dataDir, 'updates.json'), 'utf8'))
  const rows = Array.isArray(history) ? history : (history.applied ?? [])
  assert(rows.length > 0 && JSON.stringify(rows.at(-1)).includes(manifest.version), 'the upgrade was not recorded in updates.json')
  console.log(`     ${manifest.files.length} files re-hashed off disk and matched`)
})

await check('NEGATIVE CONTROL: a manifest that lies about one byte is refused', async () => {
  const bad = JSON.parse(manifestRaw.toString('utf8'))
  bad.version = '9.9.9'
  bad.files[0] = { ...bad.files[0], size: bad.files[0].size + 1 }
  const pkgDir = installedPackage(path.join(scratch, 'c', 'node_modules', 'dsh-our-free-model'))
  const dataDir = path.join(scratch, 'c', 'dsh-home')
  tampered = Buffer.from(JSON.stringify(bad))
  let error
  try { await updaterFor(pkgDir, dataDir).apply({ version: '9.9.9' }) } catch (reason) { error = reason }
  tampered = null
  assert(error !== undefined, 'the upgrade SUCCEEDED against a lying manifest — verification is not happening')
  assert(/size \d+ != manifest \d+/.test(String(error?.message)), `refused for the wrong reason: ${error?.message}`)
  const after = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
  assert(after.version === PREVIOUS, `the bad release was installed anyway (${after.version})`)
  console.log(`     refused as designed: ${String(error.message).slice(0, 74)}…`)
})

server.close()
fs.rmSync(scratch, { recursive: true, force: true })
console.log(failures === 0
  ? '\nrelease-e2e: this repository would upgrade an installed user cleanly'
  : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
