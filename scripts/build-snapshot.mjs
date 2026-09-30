/**
 * Regenerate the embedded offline catalog snapshot (`src/data/snapshot.ts`).
 *
 * The snapshot is built from real, on-disk sources only — nothing is invented:
 *
 *   ../dsh-mojobox/catalog/plugins/*.json     plugin records
 *   ../dsh-mojobox/catalog/packs/*.pack.json  Pack records
 *   ../dsh-mojobox/catalog/packs/*.lock.json  Pack Locks (npm sources)
 *   ../dsh_desktop/.sync/plugin-distribution.json  distributionClass registry
 *   ../dsh_desktop/.sync/plugins.json              package name ↔ plugin id
 *
 * Two things are added on top of the raw catalog, and both are recorded in the
 * output so the installer's UI can label them:
 *
 *  1. `x-mojobox-distribution` per plugin record — the EAC desktop's
 *     `distributionClass`, matched by package name. Mojobox does not carry the
 *     field yet (plan §0.5 keeps it canonical in `.sync/plugin-distribution.json`).
 *
 * EAC-CORE-SHELL-01 removed the former derived Pack `dev.dsh-eac.skins.v1`: the
 * skin platform (loader + 13 skins) is no longer bundled by the host shell. The
 * Mojobox catalog records remain as the **index** the Market Core installs from,
 * which is exactly the split the shell/Full decision asked for — the shell ships
 * no skins, and the index subpackage is what Market Core consumes.
 *
 * Usage: node scripts/build-snapshot.mjs
 *
 * @module scripts/build-snapshot
 */

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = resolve(root, '..')
const mojobox = join(workspace, 'dsh-mojobox')
const desktop = join(workspace, 'dsh_desktop')

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

async function jsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(directory, entry.name))
    .sort()
}

/** package name → distributionClass, via the desktop's plugin id registry. */
async function distributionByPackage() {
  const [distribution, inventory] = await Promise.all([
    readJson(join(desktop, '.sync', 'plugin-distribution.json')),
    readJson(join(desktop, '.sync', 'plugins.json'))
  ])
  const classById = new Map(distribution.plugins.map((entry) => [entry.id, entry.distributionClass]))
  const byPackage = new Map()
  for (const plugin of inventory.plugins) {
    const distributionClass = classById.get(plugin.id)
    if (distributionClass !== undefined && plugin.packageName) byPackage.set(plugin.packageName, distributionClass)
  }
  return byPackage
}

/**
 * Record the installer's tier provenance: `desktop-sync` when the EAC desktop
 * registry classifies the package. Mojobox does not carry the field yet
 * (plan §0.5 keeps it canonical in `.sync/plugin-distribution.json`).
 *
 * EAC-CORE-SHELL-01 removed the `installer-policy` branch along with the derived
 * skin pack: the skin chain is no longer an installer concern at all. Skins live
 * in the Mojobox catalog as index records, and Market Core installs them on
 * demand — the shell never pins a tier for them.
 */
function withDistribution(record, byPackage) {
  const distributionClass = byPackage.get(record.name)
  if (distributionClass === undefined) return record
  return { ...record, 'x-mojobox-distribution': { distributionClass, source: 'desktop-sync' } }
}

async function main() {
  const byPackage = await distributionByPackage()

  const pluginPaths = await jsonFiles(join(mojobox, 'catalog', 'plugins'))
  const plugins = []
  for (const path of pluginPaths) {
    const record = await readJson(path)
    plugins.push(withDistribution(record, byPackage))
  }
  const packPaths = (await jsonFiles(join(mojobox, 'catalog', 'packs'))).filter((path) => path.endsWith('.pack.json'))
  const packs = []
  for (const packPath of packPaths) {
    const pack = await readJson(packPath)
    const lock = await readJson(packPath.replace('.pack.json', '.lock.json'))
    packs.push({ ...pack, lock })
  }

  const generatedAt = new Date().toISOString()
  const document = { apiVersion: 'catalog.mojobox.dev/v1alpha1', plugins, packs }

  const banner = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Regenerate with: npm run build:snapshot
 *
 * Offline catalog snapshot embedded in the plugin bundle. Sources:
 *   dsh-mojobox/catalog/plugins/*.json
 *   dsh-mojobox/catalog/packs/*.{pack,lock}.json
 *   DSH-Desktop-EAC/.sync/plugin-distribution.json
 *   DSH-Desktop-EAC/.sync/plugins.json
 *
 * ${plugins.length} plugin records, ${packs.length} packs.
 * Every member carries a real artifact URL/digest from the sources above; no
 * digest is fabricated.
 *
 * @module data/snapshot
 */

/** Build timestamp of this snapshot. */
export const SNAPSHOT_GENERATED_AT = ${JSON.stringify(generatedAt)}

/** Mojobox repository revision this snapshot was read from, when known. */
export const SNAPSHOT_SOURCES = ${JSON.stringify(
    {
      mojobox: 'dsh-mojobox',
      desktop: 'DSH-Desktop-EAC',
      pluginRecords: plugins.length,
      packs: packs.length
    },
    null,
    2
  )} as const

/** The catalog document, parsed and validated by \`core/catalog.ts\` at load time. */
export const snapshotDocument: unknown = `

  await writeFile(
    join(root, 'src', 'data', 'snapshot.ts'),
    `${banner}${JSON.stringify(document, null, 2)}\n`
  )

  console.log(
    `wrote src/data/snapshot.ts: ${plugins.length} plugin records, ${packs.length} packs, ${(
      Buffer.byteLength(JSON.stringify(document)) / 1024
    ).toFixed(1)} KiB`
  )
}

await main()
