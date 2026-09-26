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
 *  2. One derived Pack `dev.dsh-eac.skins.v1`, because Mojobox has no skin Pack
 *     record yet (M4 left `eac.skins.v1` draft/source-pending). Its members are
 *     real catalog records with real GitHub-Release artifacts (loader v1.1.0 +
 *     13 skins), and its provenance says plainly that it is derived.
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

const DERIVED_SKIN_PACK_ID = 'dev.dsh-eac.skins.v1'
/**
 * Every member of the loader/skin line, loader first. This is the full v1.1.0
 * chain as catalogued in dsh-mojobox (loader + 13 skins); the derived pack and
 * `src/data/snapshot.test.ts` both read the roster from here.
 */
const SKIN_CHAIN_IDS = [
  'dev.eac.ui-skin-loader',
  'dev.eac.skin-aurora',
  'dev.eac.skin-blue-fantasy',
  'dev.eac.skin-deep-whale-day-night',
  'dev.eac.skin-dragon-heir',
  'dev.eac.skin-inkwash',
  'dev.eac.skin-maid-atelier',
  'dev.eac.skin-miku',
  'dev.eac.skin-minecraft',
  'dev.eac.skin-qq98',
  'dev.eac.skin-ths',
  'dev.eac.skin-trading',
  'dev.eac.skin-whale-song',
  'dev.eac.skin-xp'
]

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
 * Record the installer's tier provenance explicitly: `desktop-sync` when the
 * EAC desktop registry classifies the package, `installer-policy` for the
 * derived skin chain.
 *
 * The desktop registry does classify the loader/skin packages — as
 * `builtin`/bundled — which would make every skin row L1 and therefore
 * non-deselectable. The installer deliberately presents the appearance pack as
 * an opt-in set instead: the plan's confirm dialog lets a user untick
 * individual plugins, and the loader's own console (not this installer) is the
 * active-skin control plane. The chain is therefore pinned to `recommended`
 * with `installer-policy` provenance, so the UI never claims the tier came from
 * the upstream registry.
 */
function withDistribution(record, byPackage, policyIds) {
  if (policyIds.has(record.id)) {
    return {
      ...record,
      'x-mojobox-distribution': { distributionClass: 'recommended', source: 'installer-policy' }
    }
  }
  const distributionClass = byPackage.get(record.name)
  if (distributionClass === undefined) return record
  return { ...record, 'x-mojobox-distribution': { distributionClass, source: 'desktop-sync' } }
}

/** The derived skin Pack, assembled from real catalog records. */
function derivedSkinPack(pluginById) {
  const components = []
  for (const id of SKIN_CHAIN_IDS) {
    const record = pluginById.get(id)
    if (record === undefined) throw new Error(`derived skin pack: catalog record ${id} is missing`)
    components.push({
      id,
      version: record.version,
      // The loader must come with the skins: a skin pack without its loader
      // renders nothing, so it is not user-deselectable.
      required: id === 'dev.eac.ui-skin-loader'
    })
  }

  return {
    metadata: {
      id: DERIVED_SKIN_PACK_ID,
      version: pluginById.get('dev.eac.ui-skin-loader').version,
      name: 'EAC 皮肤包',
      description:
        'EAC 皮肤链：皮肤加载器 1.1.0 + 13 款公约皮肤（2 款参考实现 + 11 款迁移皮肤）。成员均为 Mojobox 目录中的真实记录，制品为 GitHub Release tgz（v1.1.0 资产与 npm 发布均待 M8）。',
      category: 'appearance'
    },
    components,
    'x-dsh-eac-provenance': {
      kind: 'snapshot-derived',
      reason:
        'Mojobox 尚无 eac.skins.v1 Pack 记录（M4 记 draft/source-pending）；此视图由真实目录记录派生（loader v1.1.0 + 13 款皮肤），不虚构 digest 或制品。桌面注册表将皮肤链登记为 builtin/bundled（不可取消勾选），安装器按自身策略呈现为「可选」外观包（可逐项取消勾选），分级来源如实标注为 installer-policy。',
      sources: [...SKIN_CHAIN_IDS]
    }
  }
}

async function main() {
  const byPackage = await distributionByPackage()

  const pluginPaths = await jsonFiles(join(mojobox, 'catalog', 'plugins'))
  const policyIds = new Set(SKIN_CHAIN_IDS)
  const plugins = []
  for (const path of pluginPaths) {
    const record = await readJson(path)
    plugins.push(withDistribution(record, byPackage, policyIds))
  }
  const pluginById = new Map(plugins.map((record) => [record.id, record]))

  const packPaths = (await jsonFiles(join(mojobox, 'catalog', 'packs'))).filter((path) => path.endsWith('.pack.json'))
  const packs = []
  for (const packPath of packPaths) {
    const pack = await readJson(packPath)
    const lock = await readJson(packPath.replace('.pack.json', '.lock.json'))
    packs.push({ ...pack, lock })
  }
  packs.push(derivedSkinPack(pluginById))

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
 * ${plugins.length} plugin records, ${packs.length} packs (one derived skin view).
 * Every member carries a real artifact URL/digest from the sources above; no
 * digest is fabricated. The derived skin pack names its provenance.
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
