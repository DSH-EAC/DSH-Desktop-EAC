/**
 * In-app plugin upgrade.
 *
 * The plugin updates itself from the same place the owner publishes it: a
 * manifest in the repository listing every file of the release with its size
 * and SHA-256. Applying an update is download → verify → stage → backup →
 * replace → verify → reload, and every step is built to leave either the old
 * version or the new one intact — never a mixture:
 *
 * - downloads land in a staging directory under the plugin's data dir and are
 *   hash-checked before anything on the installed copy is touched;
 * - the running process keeps executing from its in-memory module graph, so
 *   replacing files on disk cannot disturb a live request;
 * - the installed package is backed up first, a failed verification restores
 *   it, and a failed reload rolls the package back before re-registering;
 * - replacements are written as `<file>.ofm-new` beside their target and
 *   renamed over it, so a crash mid-swap cannot truncate a file that the next
 *   boot will import (transient Windows EPERM from indexers is retried).
 *
 * The EAC profile gate forbids symlinks and junctions under the profile; this
 * module only ever copies plain files inside the plugin's own directory and
 * data dir, which keeps the gate's answer unchanged.
 *
 * @module src/updater.js
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const REPO = 'zouyuxuan122/dsh-our-free-model'

/** Manifest locations, in preference order — jsDelivr first, for the same
 *  reachability reason as the feed (see src/feed.js): raw.githubusercontent.com
 *  is TLS-interfered on the networks this plugin most serves. */
export const DEFAULT_MANIFEST_SOURCES = [
  `https://raw.githubusercontent.com/${REPO}/main/feed/manifest.json`,
  `https://cdn.jsdelivr.net/gh/${REPO}@main/feed/manifest.json`,
  `https://raw.githubusercontent.com/${REPO}/master/feed/manifest.json`,
]

/** Mirror of the feed's cache-buster: a minute-stamp keeps upgrades fresh. */
export function bustCdnCache(url, now = Date.now()) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.endsWith('.jsdelivr.net')) {
      parsed.searchParams.set('ofm', Math.floor(now / 60_000).toString())
      return parsed.href
    }
  } catch { /* malformed URL: let fetch report it */ }
  return url
}

const MAX_MANIFEST_BYTES = 256 * 1024
const MAX_FILE_BYTES = 4 * 1024 * 1024
const MAX_FILES = 80
const SHA_RE = /^[0-9a-f]{64}$/

/** Parse `1.2.3` / `1.2.3-rc.4` into a comparable tuple; `null` when malformed. */
export function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$/.exec(String(value ?? '').trim())
  if (match === null) return null
  const pre = match[4] === undefined ? null : match[4].split('.')
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre }
}

/** -1 | 0 | 1 in semver precedence; a pre-release sorts before its release. */
export function compareVersions(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (left === null || right === null) return a === b ? 0 : a > b ? 1 : -1
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  if (left.pre === null && right.pre === null) return 0
  if (left.pre === null) return 1
  if (right.pre === null) return -1
  const width = Math.max(left.pre.length, right.pre.length)
  for (let i = 0; i < width; i += 1) {
    const x = left.pre[i]
    const y = right.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn && Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
    if (xn !== yn) return xn ? -1 : 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * Validate the manifest document.
 * @param {unknown} payload
 * @returns {object} {version, notes, publishedAt, base, files}
 * @throws {Error} with a reason the settings page can show
 */
export function parseManifest(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('manifest must be a JSON object')
  }
  const version = typeof payload.version === 'string' ? payload.version.trim() : ''
  if (parseVersion(version) === null) throw new Error(`manifest version "${version}" is not a valid semver`)
  const base = typeof payload.base === 'string' && payload.base !== '' ? payload.base : '../'
  const rows = payload.files
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('manifest carries no file list')
  if (rows.length > MAX_FILES) throw new Error(`manifest lists ${rows.length} files, above the ${MAX_FILES} cap`)
  const files = []
  const seen = new Set()
  for (const row of rows) {
    const file = parseFileEntry(row)
    if (seen.has(file.path)) throw new Error(`manifest lists ${file.path} twice`)
    seen.add(file.path)
    files.push(file)
  }
  if (!seen.has('package.json')) throw new Error('manifest must include package.json')
  return {
    version,
    base,
    files,
    notes: typeof payload.notes === 'string' ? payload.notes.slice(0, 32 * 1024) : '',
    publishedAt: timestampOf(payload.publishedAt) ?? 0,
    ...typeof payload.minSupported === 'string' ? { minSupported: payload.minSupported } : {},
  }
}

function parseFileEntry(row) {
  const rel = typeof row?.path === 'string' ? row.path.trim() : ''
  const normalized = rel.replace(/\\/g, '/')
  if (normalized === '' || normalized.startsWith('/') || normalized.includes('../') || normalized.endsWith('..')
    || /[A-Za-z]:/.test(normalized) || normalized.split('/').includes('')) {
    throw new Error(`manifest file path "${rel}" is not a safe relative path`)
  }
  const sha256 = typeof row?.sha256 === 'string' ? row.sha256.toLowerCase() : ''
  if (!SHA_RE.test(sha256)) throw new Error(`manifest entry "${normalized}" has no valid sha256`)
  const size = row?.size
  if (!Number.isInteger(size) || size <= 0 || size > MAX_FILE_BYTES) {
    throw new Error(`manifest entry "${normalized}" has an out-of-range size`)
  }
  return { path: normalized, sha256, size }
}

function timestampOf(value) {
  if (typeof value !== 'string' || value === '') return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : undefined
}

/** Resolve one manifest-relative path against the URL the manifest came from. */
export function fileUrlOf(manifestUrl, manifest, relativePath) {
  return new URL(manifest.base + relativePath.split('/').map(encodeURIComponent).join('/'), manifestUrl).href
}

export async function downloadManifest(sources, { timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const failures = []
  for (const source of sources) {
    try {
      const response = await fetchImpl(bustCdnCache(source), {
        redirect: 'error',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
      })
      if (!response.ok) { failures.push(`${source} -> HTTP ${response.status}`); continue }
      const text = await response.text()
      if (text.length > MAX_MANIFEST_BYTES) { failures.push(`${source} -> manifest too large`); continue }
      return { manifest: parseManifest(JSON.parse(text)), source }
    } catch (error) {
      failures.push(`${source} -> ${error?.message ?? error}`)
    }
  }
  throw new Error(`no manifest source answered (${failures.join('; ')})`)
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

/**
 * Download and hash-verify the whole release into `stageDir`.
 * @returns {Promise<{bytes: number, files: number}>}
 */
export async function stageRelease({ manifest, manifestUrl, stageDir, fetchImpl = fetch, concurrency = 4, onProgress = () => {}, timeoutMs = 30000 }) {
  fs.rmSync(stageDir, { recursive: true, force: true })
  fs.mkdirSync(stageDir, { recursive: true })
  let done = 0
  let bytes = 0
  let cursor = 0
  const failures = []
  const workers = Array.from({ length: Math.min(concurrency, manifest.files.length) }, async () => {
    while (cursor < manifest.files.length) {
      const file = manifest.files[cursor++]
      const target = path.join(stageDir, ...file.path.split('/'))
      try {
        const response = await fetchImpl(bustCdnCache(fileUrlOf(manifestUrl, manifest, file.path)), {
          redirect: 'error',
          signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = Buffer.from(await response.arrayBuffer())
        if (body.length !== file.size) throw new Error(`size ${body.length} != manifest ${file.size}`)
        const digest = crypto.createHash('sha256').update(body).digest('hex')
        if (digest !== file.sha256) throw new Error('sha256 mismatch')
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, body)
        done += 1
        bytes += body.length
        onProgress({ done, total: manifest.files.length, file: file.path })
      } catch (error) {
        failures.push(`${file.path}: ${error?.message ?? error}`)
      }
    }
  })
  await Promise.all(workers)
  if (failures.length > 0) {
    fs.rmSync(stageDir, { recursive: true, force: true })
    throw new Error(`staging failed: ${failures.join('; ')}`)
  }
  return { bytes, files: done }
}

/** The staged copy is checked against the manifest before install touches anything. */
export function verifyStaged(stageDir, manifest) {
  for (const file of manifest.files) {
    const target = path.join(stageDir, ...file.path.split('/'))
    let stat
    try { stat = fs.statSync(target) } catch { throw new Error(`staged file missing: ${file.path}`) }
    if (stat.size !== file.size) throw new Error(`staged size drift for ${file.path}`)
    if (sha256File(target) !== file.sha256) throw new Error(`staged hash drift for ${file.path}`)
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(stageDir, 'package.json'), 'utf8'))
  if (pkg.version !== manifest.version) throw new Error(`staged package.json says ${pkg.version}, manifest says ${manifest.version}`)
}

/**
 * Top-level directories and files that belong to the repository rather than to a
 * release. An installed copy never has them; a git-clone or linked development
 * copy always does, and it is the same directory the upgrader operates on.
 */
const REPOSITORY_SCAFFOLDING = ['feed', 'scripts', 'docs', 'promo', 'node_modules']

/**
 * Walk a directory into relative file paths, skipping release scratch files and
 * anything that belongs to the repository rather than to the package.
 *
 * The skip matters twice over: the backup must not copy a `.git` directory, and
 * `installStaged` must not delete the development copy's test suite or feed
 * directory as "a file the new release dropped".
 */
export function listPackageFiles(dir) {
  const out = []
  const visit = (current, rel) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.endsWith('.ofm-new') || entry.name.endsWith('.ofm-old')) continue
      if (rel === '' && (entry.name.startsWith('.') || REPOSITORY_SCAFFOLDING.includes(entry.name))) continue
      const child = path.join(current, entry.name)
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) visit(child, childRel)
      else if (entry.isFile()) out.push(childRel)
    }
  }
  if (fs.existsSync(dir)) visit(dir, '')
  return out
}

/**
 * Copy the current package aside so a failed swap can be undone.
 * @returns {number} files backed up
 */
export function backupPackage(pkgDir, backupDir) {
  fs.rmSync(backupDir, { recursive: true, force: true })
  const files = listPackageFiles(pkgDir)
  for (const rel of files) {
    const target = path.join(backupDir, ...rel.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(pkgDir, ...rel.split('/')), target)
  }
  return files.length
}

/** Put a backed-up copy back in place (used when a swap or reload fails). */
export function restoreBackup(backupDir, pkgDir) {
  for (const rel of listPackageFiles(pkgDir)) {
    try { fs.rmSync(path.join(pkgDir, ...rel.split('/')), { force: true }) } catch { /* best effort */ }
  }
  for (const rel of listPackageFiles(backupDir)) {
    const target = path.join(pkgDir, ...rel.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(backupDir, ...rel.split('/')), target)
  }
}

/** Windows can transiently refuse a rename while a file is scanned; retry briefly. */
async function renameWithRetry(from, to) {
  let delay = 60
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(from, to)
      return
    } catch (error) {
      if (attempt >= 4 || !['EPERM', 'EACCES', 'ENOENT'].includes(error?.code)) throw error
      await new Promise(resolve => setTimeout(resolve, delay))
      delay *= 4
    }
  }
}

/**
 * Move a verified staging directory into the installed package location.
 * Every file goes through a same-directory `<name>.ofm-new` so the final
 * hop is a same-volume rename; the running module graph is unaffected.
 */
export async function installStaged(stageDir, pkgDir, files) {
  for (const rel of files) {
    const parts = rel.split('/')
    const source = path.join(stageDir, ...parts)
    const target = path.join(pkgDir, ...parts)
    const pending = `${target}.ofm-new`
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(source, pending)
    await renameWithRetry(pending, target)
  }
  // A file the new release dropped must not linger from the old one.
  for (const rel of listPackageFiles(pkgDir)) {
    if (files.includes(rel)) continue
    try { fs.rmSync(path.join(pkgDir, ...rel.split('/')), { force: true }) } catch { /* best effort */ }
  }
}

/** Read back everything that was just written; one drifted byte aborts the swap. */
export function verifyInstalled(pkgDir, manifest) {
  for (const file of manifest.files) {
    const target = path.join(pkgDir, ...file.path.split('/'))
    if (!fs.existsSync(target)) throw new Error(`installed file missing: ${file.path}`)
    if (sha256File(target) !== file.sha256) throw new Error(`installed hash drift for ${file.path}`)
  }
}

/**
 * The upgrade lifecycle. `apply` stops short of the code swap itself: the caller
 * (index.js) owns `ctx` and performs the hot reload after the files are in
 * place, rolling back with {@link restoreBackup} if the reload cannot start.
 */
export class PluginUpdater {
  /**
   * @param {object} deps
   * @param {string} deps.pkgDir - installed package directory
   * @param {string} deps.dataDir - plugin data dir (staging, backup, history)
   * @param {() => {updateCheckHours?: number}} deps.settings
   * @param {(message: string) => void} [deps.log]
   * @param {typeof fetch} [deps.fetchImpl]
   */
  constructor({ pkgDir, dataDir, settings, log = () => {}, fetchImpl = fetch, defaultSources = DEFAULT_MANIFEST_SOURCES }) {
    this.deps = { pkgDir, dataDir, settings, log, fetchImpl, defaultSources }
    this.latest = undefined
    this.checkedAt = 0
    this.error = ''
    this.applying = false
    this.history = this.loadHistory()
  }

  get stageDir() { return path.join(this.deps.dataDir, 'upgrade-stage') }
  get backupDir() { return path.join(this.deps.dataDir, 'rollback') }

  currentVersion() {
    try {
      return String(JSON.parse(fs.readFileSync(path.join(this.deps.pkgDir, 'package.json'), 'utf8')).version ?? '')
    } catch {
      return ''
    }
  }

  loadHistory() {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(this.deps.dataDir, 'updates.json'), 'utf8'))
      return Array.isArray(parsed?.applied) ? parsed.applied : []
    } catch {
      return []
    }
  }

  recordHistory(entry) {
    this.history = [...this.history, entry].slice(-20)
    try {
      fs.mkdirSync(this.deps.dataDir, { recursive: true })
      fs.writeFileSync(path.join(this.deps.dataDir, 'updates.json'), JSON.stringify({ applied: this.history }, undefined, 2))
    } catch (error) {
      this.deps.log?.(`our-free-model: could not write update history (${error?.message ?? error})`)
    }
  }

  status() {
    const current = this.currentVersion()
    const available = this.latest !== undefined && compareVersions(this.latest.version, current) > 0
    return {
      current,
      latest: this.latest?.version ?? '',
      available,
      notes: this.latest?.notes ?? '',
      publishedAt: this.latest?.publishedAt ?? 0,
      checkedAt: this.checkedAt,
      applying: this.applying,
      error: this.error,
      lastApplied: this.history[this.history.length - 1] ?? undefined,
    }
  }

  /** Manifest sources: the owner's feed override also redirects update checks. */
  sources() {
    const override = typeof this.deps.settings()?.feedUrl === 'string' ? this.deps.settings().feedUrl.trim() : ''
    if (override !== '') {
      const root = override.includes('{repo}')
        ? override.replace('{repo}', REPO)
        : override
      const manifestFromFeed = root.replace(/announcements\.json[^/]*$/, 'manifest.json')
      return [manifestFromFeed, ...this.deps.defaultSources]
    }
    return this.deps.defaultSources
  }

  /**
   * Fetch and evaluate the latest manifest.
   * @returns {Promise<{available: boolean, current: string, latest: string}>}
   */
  async check() {
    try {
      const { manifest, source } = await downloadManifest(this.sources(), { fetchImpl: this.deps.fetchImpl })
      const current = this.currentVersion()
      if (manifest.minSupported !== undefined && current !== '' && compareVersions(current, manifest.minSupported) < 0) {
        throw new Error(`update path requires at least ${manifest.minSupported}; ${current} is installed`)
      }
      this.latest = manifest
      this.manifestUrl = source
      this.checkedAt = Date.now()
      this.error = ''
      this.deps.log?.(`our-free-model: update check via ${source} -> ${manifest.version} (installed ${current})`)
      return { available: compareVersions(manifest.version, current) > 0, current, latest: manifest.version }
    } catch (error) {
      this.error = String(error?.message ?? error)
      throw error
    }
  }

  /**
   * Download, verify and install one manifest. Idempotent for the same version.
   * @param {{version?: string, onProgress?: (progress: object) => void}} [options]
   * @returns {Promise<{version: string, files: number, bytes: number, previous: string}>}
   */
  async apply({ version, onProgress = () => {} } = {}) {
    if (this.applying) throw new Error('an upgrade is already running')
    this.applying = true
    const previous = this.currentVersion()
    try {
      // Re-check immediately before installing: the owner may have pushed a new
      // manifest since the last check, and a stale cached manifest would verify
      // downloads against hashes the repository no longer stands behind.
      await this.check()
      const manifest = this.latest
      if (manifest === undefined) throw new Error('no manifest available')
      if (version !== undefined && manifest.version !== version) throw new Error(`manifest offers ${manifest.version}, not ${version}`)
      if (compareVersions(manifest.version, previous) < 0) throw new Error(`installed ${previous} is newer than ${manifest.version}`)

      onProgress({ phase: 'download' })
      const staged = await stageRelease({
        manifest, manifestUrl: this.manifestUrl ?? this.sources()[0], stageDir: this.stageDir,
        fetchImpl: this.deps.fetchImpl, onProgress,
      })
      verifyStaged(this.stageDir, manifest)

      onProgress({ phase: 'install' })
      const backedUp = backupPackage(this.deps.pkgDir, this.backupDir)
      try {
        await installStaged(this.stageDir, this.deps.pkgDir, manifest.files.map(file => file.path))
        verifyInstalled(this.deps.pkgDir, manifest)
      } catch (error) {
        // The installed copy is now in an unknown state: put the old one back
        // before surfacing the failure, so the next boot still works.
        restoreBackup(this.backupDir, this.deps.pkgDir)
        throw new Error(`install failed, previous version restored (${error?.message ?? error})`)
      }
      fs.rmSync(this.stageDir, { recursive: true, force: true })
      const record = { from: previous, to: manifest.version, at: Date.now(), ok: true, files: manifest.files.length, bytes: staged.bytes, backedUp }
      this.recordHistory(record)
      this.checkedAt = Date.now()
      this.deps.log?.(`our-free-model: upgraded ${previous} -> ${manifest.version} (${manifest.files.length} files)`)
      return { version: manifest.version, previous, files: manifest.files.length, bytes: staged.bytes }
    } catch (error) {
      const record = { from: previous, to: version ?? '', at: Date.now(), ok: false, error: String(error?.message ?? error) }
      this.recordHistory(record)
      throw error
    } finally {
      this.applying = false
    }
  }
}
