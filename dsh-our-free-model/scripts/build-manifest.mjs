/**
 * Build the release manifest the in-app upgrader consumes.
 *
 * Run after bumping package.json and committing the release's files:
 *
 *     node scripts/build-manifest.mjs
 *
 * It hashes every file the package ships (the `files` list in package.json,
 * plus package.json itself) and writes feed/manifest.json with `"base": "../"`,
 * so the file URLs resolve beside the manifest — i.e. the repository root the
 * manifest lives in. Pushing the result to GitHub is the whole release.
 *
 * `--check` writes nothing and exits non-zero when the committed manifest no
 * longer matches the files it describes:
 *
 *     node scripts/build-manifest.mjs --check
 *
 * That mismatch is not cosmetic. The upgrader compares the downloaded bytes
 * against this document before installing anything, so a stale entry fails the
 * whole upgrade for every user — and the URLs are resolved from the repository,
 * so they download the *new* file while checking it against the *old* hash.
 * Editing any shipped file without re-running this script reproduces exactly
 * that, which is why `--check` belongs in the test run and in front of a commit.
 *
 * A manifest for a version already lower than or equal to the last published
 * one is rejected; pass --force to rebuild anyway.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { publishedBytes } from './lib/published-bytes.mjs'

const root = path.join(fileURLToPath(new URL('..', import.meta.url)))
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const manifestPath = path.join(root, 'feed', 'manifest.json')
const integrityPath = path.join(root, 'catalog', 'integrity.json')

// `private: true` guards against accidental npm publishes; building the manifest
// is the project's own release path, so it proceeds either way.
if (pkg.private === true) console.error('note: package.json is private — this manifest is for the in-app upgrader, not npm')

const shipped = ['package.json', ...(pkg.files ?? [])]
const files = []
for (const rel of shipped) {
  const absolute = path.join(root, rel)
  let stat
  try { stat = fs.statSync(absolute) } catch {
    console.error(`listed file "${rel}" does not exist; fix package.json "files"`)
    process.exit(1)
  }
  if (stat.isDirectory()) walkDirectory(rel)
  else if (stat.isFile()) addFile(rel)
}

/** Every file under a listed directory, however deep. */
function walkDirectory(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) walkDirectory(rel)
    else if (entry.isFile()) addFile(rel)
  }
}

function addFile(rel) {
  const absolute = path.join(root, rel)
  const body = publishedBytes(fs.readFileSync(absolute))
  files.push({
    path: rel.replace(/\\/g, '/'),
    size: body.length,
    sha256: crypto.createHash('sha256').update(body).digest('hex'),
  })
}

files.sort((a, b) => a.path.localeCompare(b.path))

let previous
try { previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch { /* first manifest */ }
let previousIntegrity
try { previousIntegrity = JSON.parse(fs.readFileSync(integrityPath, 'utf8')) } catch { /* first run */ }
if (previous?.version !== undefined && !process.argv.includes('--force')) {
  const rank = value => String(value).split(/[.\-]/).map(part => Number.isNaN(Number(part)) ? part : Number(part))
  const after = (left, right) => {
    // Compared segment by segment. The previous version of this test stringified
    // the two arrays and compared the strings, which read 1.9.0 as newer than
    // 1.10.0 and would have the release script refuse the day it needs it.
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
      const a = left[index] ?? 0
      const b = right[index] ?? 0
      if (a === b) continue
      return typeof a === 'number' && typeof b === 'number' ? a > b : String(a) > String(b)
    }
    return false
  }
  if (after(rank(previous.version), rank(pkg.version))) {
    console.error(`refusing to downgrade the manifest from ${previous.version} to ${pkg.version} (use --force)`)
    process.exit(1)
  }
}

const manifest = {
  version: pkg.version,
  base: '../',
  publishedAt: new Date().toISOString(),
  notes: typeof previous?.notes === 'string' && previous.version === pkg.version ? previous.notes : '',
  files,
}

if (process.argv.includes('--check')) {
  const problems = describeDrift(previous, manifest)
  // The catalog's integrity record is the same promise, addressed to ecosystem
  // consumers instead of the in-app upgrader, so it is checked in the same pass.
  const integrityProblems = describeDrift(previousIntegrity, { version: pkg.version, files }, 'catalog/integrity.json')
  if (problems.length === 0 && integrityProblems.length === 0) {
    console.log(`feed/manifest.json and catalog/integrity.json match the ${files.length} files they describe (${files.reduce((sum, file) => sum + file.size, 0)} bytes)`)
    process.exit(0)
  }
  console.error('the committed digests do not describe the files on disk:')
  for (const problem of [...problems, ...integrityProblems]) console.error(`  ${problem}`)
  console.error('every user who upgrades now fails verification — run: node scripts/build-manifest.mjs')
  process.exit(1)
}

fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
// The catalog-facing copy of the same file list: no notes, no base URL — just
// the version and the per-file bytes/sha256 a catalog record can be audited
// against. One builder writes both so they cannot disagree.
fs.mkdirSync(path.dirname(integrityPath), { recursive: true })
fs.writeFileSync(integrityPath, `${JSON.stringify({ version: pkg.version, algorithm: 'sha256', files }, undefined, 2)}\n`)
console.log(`feed/manifest.json: ${pkg.version}, ${files.length} files, ${files.reduce((sum, file) => sum + file.size, 0)} bytes`)
console.log(`catalog/integrity.json: same ${files.length} digests, written beside the manifest`)

/**
 * Every way a committed digest document can disagree with the tree, in the terms
 * the upgrader itself checks: the version it will install, then each file's size
 * and hash, in that order — a size mismatch already aborts the download.
 */
function describeDrift(committed, built, label = 'feed/manifest.json') {
  if (committed === undefined) return [`${label} does not exist`]
  const problems = []
  if (committed.version !== built.version) problems.push(`version ${committed.version} on disk, ${built.version} in the manifest`)
  const byPath = new Map((Array.isArray(committed.files) ? committed.files : []).map(row => [row?.path, row]))
  for (const file of built.files) {
    const row = byPath.get(file.path)
    byPath.delete(file.path)
    if (row === undefined) { problems.push(`${file.path}: not in the manifest`); continue }
    if (row.size !== file.size) problems.push(`${file.path}: size ${row.size} in the manifest, ${file.size} on disk`)
    else if (row.sha256 !== file.sha256) problems.push(`${file.path}: sha256 ${String(row.sha256).slice(0, 12)}… in the manifest, ${file.sha256.slice(0, 12)}… on disk`)
  }
  for (const [leftover] of byPath) problems.push(`${leftover}: in the manifest but no longer shipped`)
  return problems
}
