import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// M4 coverage guards for the EAC pack split. Complements scripts/validate.mjs:
// schema and cross-reference checks live there; this script asserts the
// source-pending discipline required by docs/eac-pack-coverage.md —
// unresolved members must stay draft and must never be locked or given an
// invented artifact.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const load = async path => JSON.parse(await readFile(join(root, path), 'utf8'))

async function jsonFiles(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await jsonFiles(path))
    else if (entry.name.endsWith('.json')) files.push(path.replaceAll('\\', '/'))
  }
  return files.sort()
}

const failures = []
const check = (condition, message) => {
  if (!condition) failures.push(message)
}

const pluginPaths = await jsonFiles('catalog/plugins')
for (const path of pluginPaths) {
  const manifest = await load(path)
  const status = manifest['x-mojobox-maintenance']?.artifactStatus
  if (status === 'unpublished') {
    check(manifest.artifact === undefined, `${path}: unpublished record must not carry an artifact`)
  }
  if (manifest.artifact !== undefined) {
    check(typeof manifest.artifact.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(manifest.artifact.digest),
      `${path}: artifact digest must be a real sha256 digest`)
    check(typeof manifest.artifact.path === 'string' && manifest.artifact.path.length > 0,
      `${path}: artifact path must be present`)
  }
}

const packPaths = (await jsonFiles('catalog/packs')).filter(path => path.endsWith('.pack.json'))
const lockedIds = new Set()
for (const packPath of packPaths) {
  const lockPath = packPath.replace('.pack.json', '.lock.json')
  const lock = await load(lockPath)
  for (const component of lock.components) {
    lockedIds.add(component.id)
    const manifest = await load(component.manifest)
    check(manifest.artifact !== undefined,
      `${lockPath}: component ${component.id} is locked but its Manifest has no artifact`)
    check(manifest['x-mojobox-maintenance']?.artifactStatus !== 'unpublished',
      `${lockPath}: component ${component.id} is locked although marked unpublished`)
  }
}

const coverage = await readFile(join(root, 'docs/eac-pack-coverage.md'), 'utf8')
const plannedPacks = ['dev.dsh-eac.builtin.v1', 'dev.dsh-eac.recommended.v1', 'dev.dsh-eac.skins.v1', 'dev.dsh-eac.free-model.v1']
const shippedPacks = new Set(await Promise.all(packPaths.map(async path => (await load(path)).metadata.id)))
for (const id of plannedPacks) {
  const shipped = shippedPacks.has(id)
  check(shipped || coverage.includes(id),
    `planned Pack ${id} is neither shipped as catalog/packs/${id}.pack.json nor recorded as source-pending in docs/eac-pack-coverage.md`)
}

// Skin chain guard. The loader/skin line ships GitHub-release tarballs only
// (no npm artifact), which is exactly why it can never enter a Pack Lock and
// why the coverage ledger must list every record. The expected member count is
// the v1.1.0 release bundle: loader + 13 skins.
const SKIN_CHAIN_RELEASE_SIZE = 14
const skinChainPaths = pluginPaths.filter(path => /^catalog\/plugins\/dev\.eac\.(ui-skin-loader|skin-.+)\.json$/.test(path))
check(skinChainPaths.length === SKIN_CHAIN_RELEASE_SIZE,
  `loader/skin chain must hold ${SKIN_CHAIN_RELEASE_SIZE} catalog records (v1.1.0: loader + 13 skins), found ${skinChainPaths.length}`)
for (const path of skinChainPaths) {
  const manifest = await load(path)
  const where = `${path} (${manifest.id})`
  check(manifest['x-mojobox-maintenance']?.source === 'registry-maintained',
    `${where}: loader/skin record must stay registry-maintained`)
  check(manifest.artifact !== undefined, `${where}: loader/skin record must carry its GitHub-release artifact`)
  // The tarball name is derivable from the package name and version; asserting
  // it catches a bumped version that kept the previous release URL.
  const asset = `${manifest.name.replace('@dsh-eac/', 'dsh-eac-')}-${manifest.version}.tgz`
  check(typeof manifest.artifact?.path === 'string'
    && manifest.artifact.path.endsWith(`/releases/download/v${manifest.version}/${asset}`),
  `${where}: artifact path must be the v${manifest.version} release asset ${asset}`)
  check(coverage.includes(manifest.id), `${where}: loader/skin record is not recorded in docs/eac-pack-coverage.md`)
  check(!lockedIds.has(manifest.id), `${where}: GitHub-release-only record must not appear in a Pack Lock`)
  if (manifest.id !== 'dev.eac.ui-skin-loader') {
    check(manifest['x-mojobox-skin']?.apiVersion === 'dsh.ecosystem.ui-skin-loader/v1',
      `${where}: skin record must declare the dsh.ecosystem.ui-skin-loader/v1 convention apiVersion`)
    check(typeof manifest['x-mojobox-skin']?.id === 'string' && manifest['x-mojobox-skin'].id.startsWith('dsh-eac.skin.'),
      `${where}: skin record must carry its convention skin id`)
  }
}

if (failures.length > 0) {
  console.error(`EAC coverage check FAILED:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log(`EAC coverage check passed: ${pluginPaths.length} plugin records, ${packPaths.length} Packs, ${skinChainPaths.length} loader/skin records source-pending by design, planned Pack IDs accounted for.`)
