/**
 * Catalog admission and the adapter isolation rule.
 *
 * Stage M6 folds this plugin into the EAC ecosystem packs. Two things have to
 * hold before a pack can name it:
 *
 * 1. `catalog/dsh-plugin.json` is a valid DSH Plugin Manifest Community Draft
 *    **0.15** document, and the provenance / integrity records beside it agree
 *    with the tree it describes. A catalog record that lies about its revision
 *    or its bytes is worse than no record, so the checks read the schema's own
 *    constants (vendored under `vendor/dsh-std/`) rather than restating them.
 * 2. The upstream kernel coupling stays behind `adapter/`: no shipped file may
 *    import an `@deepseek-ai/*` module from anywhere else. This is the audit
 *    gate the ecosystem plan (§4.3) grades as Critical, and nothing else fails
 *    when an import sneaks back into `index.js` — which is exactly where it
 *    lived before the adapter seam existed.
 *
 * Structural conformance only: full JSON-Schema validation with ajv happens at
 * Mojobox ingestion, where the validator lives. Everything this suite checks is
 * checkable offline with the standard library alone.
 *
 * Run: node scripts/catalog-test.mjs
 */
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { publishedBytes } from './lib/published-bytes.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8')
const readJson = rel => JSON.parse(read(rel))

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`)
}
const assert = (cond, message) => { if (!cond) { failures++; console.log(`FAIL ${name0 ?? '(check)'} — ${message}`) } }
let name0 = null
const sub = label => { name0 = label }

const pkg = readJson('package.json')
const manifest = readJson('catalog/dsh-plugin.json')
const provenance = readJson('catalog/provenance.json')
const integrity = readJson('catalog/integrity.json')
const schema = readJson('vendor/dsh-std/dsh-plugin-0.15.schema.json')

// ── the manifest 0.15 record ──────────────────────────────────────────────────
// Every rule below is lifted from the vendored draft-2020-12 schema document —
// the same one Mojobox's validator compiles — so the two can never drift apart
// silently: if the schema changes under us, the constants read here change with
// it and this suite says exactly what no longer fits.
sub('manifest')
assert(schema.properties?.manifestVersion?.const === '0.15', 'vendored schema is not draft 0.15')
check('$schema points at the pinned dsh-std 0.15 schema',
  manifest.$schema, 'https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json')
check('manifestVersion', manifest.manifestVersion, schema.properties.manifestVersion.const)

const idRe = new RegExp(schema.$defs.namespacedId.pattern)
check('id is namespaced per the schema', idRe.test(manifest.id), true)
check('name is the npm package name', manifest.name, pkg.name)
check('version tracks package.json', manifest.version, pkg.version)
check('license tracks package.json', manifest.license, pkg.license)

const required = schema.required
check('every required field is present', required.filter(key => manifest[key] === undefined), [])

const topAllowed = new Set([...Object.keys(schema.properties), ...required])
const stray = Object.keys(manifest).filter(key => !topAllowed.has(key) && !/^x-/.test(key))
check('no unknown top-level fields (x- prefixed extensions only)', stray, [])

const host = manifest.facets?.host
check('facets names exactly what the schema allows', Object.keys(manifest.facets ?? {}), ['host'])
check('host facet names entry and apiVersion', Object.keys(host ?? {}).sort(), ['apiVersion', 'entry'])
check('host entry resolves on disk', fs.existsSync(path.join(repo, host?.entry ?? 'missing')), true)
check('host entry is a relative path', new RegExp(schema.properties.facets.properties.host.properties.entry.pattern).test(host?.entry ?? ''), true)
check('apiVersion shape', new RegExp(schema.properties.facets.properties.host.properties.apiVersion.pattern).test(host?.apiVersion ?? ''), true)

if (manifest.artifact !== undefined) {
  const digestRe = new RegExp(schema.properties.artifact.properties.digest.pattern)
  check('artifact digest is a real sha256 document', digestRe.test(manifest.artifact?.digest ?? ''), true)
}

const source = manifest.source ?? {}
check('source repository is the plugin repository', source.repository, `https://github.com/zouyuxuan122/${pkg.name}`)
check('source revision is a full commit sha', /^[0-9a-f]{40}$/.test(source.revision ?? ''), true)
// The revision names the most recent commit that touched the release content —
// package.json plus everything in the `files` list, exactly the set the
// integrity digests describe — and deliberately not HEAD. A record cannot
// contain the hash of the commit that introduces it: the records travel beside
// the content but are not part of it, so a revision compared against HEAD turns
// red the moment the records are actually committed, and re-pointing it in a
// follow-up commit moves HEAD again. "Last commit that touched the release
// content" is both truthful (committing the records alone changes no published
// byte) and satisfiable (the refresh commit touches only catalog/, so the
// pointer it must match does not move under it). The refresh step is part of
// the release runbook in docs/RELEASING.md.
const contentRevision = spawnLastContentRevision()
if (contentRevision !== null) check('source revision is the last commit that touched the release content', source.revision, contentRevision)
else console.log('ok   (revision cross-check skipped: git unavailable or the release content has no commits yet)')

// ── provenance and license ────────────────────────────────────────────────────
sub('provenance')
check('provenance names the same subject', [provenance.subject?.id, provenance.subject?.version, provenance.subject?.sourceRevision],
  [manifest.id, manifest.version, manifest.source.revision])
check('license record matches the LICENSE file',
  [provenance.license?.spdx, /MIT License/.test(read('LICENSE')), /Copyright/.test(read('LICENSE'))],
  ['MIT', true, true])
check('provenance records where the kernel coupling lives',
  [provenance.upstreamRuntime?.package, provenance.upstreamRuntime?.isolationFile], ['@deepseek-ai/dsh-llm', 'adapter/kernel.js'])
check('no release artifact is claimed before one exists',
  [provenance.mojobox?.recordInstalled, provenance.mojobox?.artifactDigest], [false, null])

// ── integrity: the catalog digests are the release digests ────────────────────
sub('integrity')
const feedManifest = readJson('feed/manifest.json')
check('integrity version tracks the release manifest', integrity.version, feedManifest.version)
check('integrity lists exactly the files the release manifest does',
  [integrity.algorithm, integrity.files?.length], ['sha256', feedManifest.files.length])
const feedByPath = new Map(feedManifest.files.map(row => [row.path, row]))
const drifted = (integrity.files ?? []).filter(row => {
  const other = feedByPath.get(row.path)
  return other === undefined || other.sha256 !== row.sha256 || other.size !== row.size
})
check('every integrity digest equals the release manifest digest', drifted.map(row => row.path), [])
const spot = ['index.js', 'package.json', 'adapter/kernel.js']
const recomputed = spot.map(rel => {
  const body = publishedBytes(fs.readFileSync(path.join(repo, rel)))
  return crypto.createHash('sha256').update(body).digest('hex')
})
check('the digests are the bytes on disk (LF-normalised), not copies',
  spot.every((rel, index) => integrity.files.find(row => row.path === rel)?.sha256 === recomputed[index]), true)

// ── adapter isolation ─────────────────────────────────────────────────────────
sub('isolation')
/** Every file the package ships, however deep — the same walk the release e2e does. */
function* shipped(rel) {
  const absolute = path.join(repo, rel)
  const stat = fs.statSync(absolute)
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      yield* shipped(path.join(rel, entry.name))
    }
  } else if (stat.isFile()) yield rel.replace(/\\/g, '/')
}

const upstreamImports = []
for (const rel of ['package.json', ...(pkg.files ?? [])]) {
  for (const file of shipped(rel)) {
    if (!/\.(c|m)?js$/.test(file)) continue
    if (/@deepseek-ai\//.test(read(file))) upstreamImports.push(file)
  }
}
check('only adapter/ may name an @deepseek-ai module', upstreamImports.filter(f => !f.startsWith('adapter/')), [])
check('the adapter seam exists and is the one importer', upstreamImports, ['adapter/kernel.js'])
check('the entry reaches the kernel only through the seam', /from '\.\/adapter\/kernel\.js'/.test(read('index.js')), true)
check('the seam is shipped', (pkg.files ?? []).includes('adapter'), true)

// ── the plugin still declares only what it cannot exist without ───────────────
const entry = await import('../index.js')
check('inject stays `llm` only — a headless composition must keep working', entry.inject, ['llm'])

function spawnLastContentRevision() {
  try {
    return execFileSync('git', ['log', '-1', '--format=%H', '--', 'package.json', ...(pkg.files ?? [])], { cwd: repo, encoding: 'utf8' }).trim() || null
  } catch {
    return null
  }
}

console.log(failures === 0 ? '\ncatalog: the record, the bytes and the seam agree' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
