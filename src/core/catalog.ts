/**
 * Catalog parsing: Mojobox catalog JSON → the installer's own snapshot model.
 *
 * One parser serves both producers:
 *  - the **online** read of `generated/catalog.json` from the Mojobox site;
 *  - the **embedded** snapshot in `src/data/snapshot.ts`, which is the same
 *    shape plus a resolved `distributionClass` per plugin record and one
 *    derived skin view.
 *
 * The parser is deliberately strict: a pack that names a plugin record the
 * catalog does not carry is a broken catalog, not a row to render greyed out.
 * Strictness is what makes the offline path meaningful — a malformed online
 * read throws, and the caller degrades to the embedded snapshot.
 *
 * @module core/catalog
 */

import {
  isRecord,
  type CatalogSnapshot,
  type DistributionClass,
  type PackCategory,
  type PackComponent,
  type PackProvenance,
  type PackView,
  type TierSource
} from '../protocol.ts'
import { tierOf } from './tier-policy.ts'

/** Accepted `apiVersion` of the Mojobox catalog document. */
export const CATALOG_API_VERSION = 'catalog.mojobox.dev/v1alpha1'

/** Thrown for any catalog document this installer refuses to use. */
export class CatalogParseError extends Error {
  readonly code = 'catalog/invalid'

  constructor(message: string) {
    super(message)
    this.name = 'CatalogParseError'
  }
}

const DISTRIBUTION_CLASSES: readonly DistributionClass[] = ['builtin', 'recommended', 'external']
const PACK_CATEGORIES: readonly PackCategory[] = ['appearance', 'function', 'workflow']

function requireString(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CatalogParseError(`${where} must be a non-empty string`)
  }
  return value
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** A catalog plugin record, narrowed to the fields the installer reads. */
interface PluginRecord {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly artifactUrl: string | null
  readonly artifactDigest: string | null
  readonly distributionClass: DistributionClass | null
  readonly tierSource: TierSource
  readonly maintenanceReason: string | null
}

const TIER_SOURCES: readonly TierSource[] = ['desktop-sync', 'installer-policy', 'unmapped']

function parsePluginRecord(raw: unknown, index: number): PluginRecord {
  if (!isRecord(raw)) throw new CatalogParseError(`plugins[${index}] must be an object`)
  const id = requireString(raw['id'], `plugins[${index}].id`)
  const name = requireString(raw['name'], `plugins[${index}].name`)
  const version = requireString(raw['version'], `plugins[${index}].version`)

  const artifact = isRecord(raw['artifact']) ? raw['artifact'] : null
  const maintenance = isRecord(raw['x-mojobox-maintenance']) ? raw['x-mojobox-maintenance'] : null

  // The distribution mapping lives on the record so that both producers carry
  // it the same way: the build script resolves it from the EAC desktop
  // `.sync/plugin-distribution.json`, the online catalog may one day publish
  // it itself. Anything outside the three upstream values is refused loudly
  // rather than silently downgraded.
  let distributionClass: DistributionClass | null = null
  let tierSource: TierSource = 'unmapped'
  const distribution = isRecord(raw['x-mojobox-distribution']) ? raw['x-mojobox-distribution'] : null
  const rawClass = distribution?.['distributionClass']
  if (rawClass !== undefined && rawClass !== null) {
    if (typeof rawClass !== 'string' || !DISTRIBUTION_CLASSES.includes(rawClass as DistributionClass)) {
      throw new CatalogParseError(
        `plugins[${index}] (${id}) x-mojobox-distribution.distributionClass must be one of ${DISTRIBUTION_CLASSES.join(', ')}`
      )
    }
    distributionClass = rawClass as DistributionClass
    const rawSource = distribution?.['source']
    if (rawSource === undefined) {
      tierSource = 'desktop-sync'
    } else if (typeof rawSource !== 'string' || !TIER_SOURCES.includes(rawSource as TierSource) || rawSource === 'unmapped') {
      throw new CatalogParseError(
        `plugins[${index}] (${id}) x-mojobox-distribution.source must be desktop-sync or installer-policy`
      )
    } else {
      tierSource = rawSource as TierSource
    }
  }

  return {
    id,
    name,
    version,
    artifactUrl: optionalString(artifact?.['path']),
    artifactDigest: optionalString(artifact?.['digest']),
    distributionClass,
    tierSource,
    maintenanceReason: optionalString(maintenance?.['reason'])
  }
}

/** Pack-lock rows, keyed by component id, as `installSpec` sources. */
function lockSources(packRecord: Record<string, unknown>, packId: string): Map<string, string> {
  const sources = new Map<string, string>()
  const lock = packRecord['lock']
  if (!isRecord(lock)) return sources
  const components = lock['components']
  if (!Array.isArray(components)) return sources
  for (const [index, entry] of components.entries()) {
    if (!isRecord(entry)) throw new CatalogParseError(`${packId}.lock.components[${index}] must be an object`)
    const id = requireString(entry['id'], `${packId}.lock.components[${index}].id`)
    const source = requireString(entry['source'], `${packId}.lock.components[${index}].source`)
    sources.set(id, source)
  }
  return sources
}

/**
 * Turn one lock `source` (`npm:<name>@<version>`) into a pnpm registry spec.
 * Non-`npm:` sources are not install specs and are refused, so a future
 * Mojobox source scheme can never be silently mistyped into `pnpm add`.
 */
function registrySpecFromLockSource(source: string, where: string): string {
  if (!source.startsWith('npm:')) {
    throw new CatalogParseError(`${where}: unsupported lock source ${JSON.stringify(source)} (only npm: is installable)`)
  }
  const spec = source.slice('npm:'.length)
  if (!spec.includes('@', 1)) {
    throw new CatalogParseError(`${where}: lock source ${JSON.stringify(source)} names no version`)
  }
  return spec
}

/** Whether a URL can be handed to pnpm as a tarball install spec. */
function isTarballUrl(url: string): boolean {
  return /^https:\/\/\S+\.(tgz|tar\.gz)$/.test(url)
}

function parseComponent(
  raw: unknown,
  index: number,
  packId: string,
  plugins: ReadonlyMap<string, PluginRecord>,
  lockByComponent: ReadonlyMap<string, string>
): PackComponent {
  if (!isRecord(raw)) throw new CatalogParseError(`${packId}.components[${index}] must be an object`)
  const id = requireString(raw['id'], `${packId}.components[${index}].id`)
  const version = requireString(raw['version'], `${packId}.components[${index}].version`)
  const required = raw['required'] === true

  const plugin = plugins.get(id)
  if (plugin === undefined) {
    throw new CatalogParseError(`${packId}: component ${id} has no catalog plugin record`)
  }

  const where = `${packId}:${id}`
  const lockedSource = lockByComponent.get(id)
  let installSpec: string | null = null
  if (lockedSource !== undefined) {
    installSpec = registrySpecFromLockSource(lockedSource, where)
  } else if (plugin.artifactUrl !== null && isTarballUrl(plugin.artifactUrl)) {
    // GitHub Release tgz: a real, pinnable artifact that pnpm installs by URL.
    // Used by the skin chain, whose npm publication is still pending.
    installSpec = plugin.artifactUrl
  }

  const sourcePending = installSpec === null

  return {
    id,
    name: plugin.name,
    version,
    installSpec,
    artifactUrl: plugin.artifactUrl,
    artifactDigest: plugin.artifactDigest,
    distributionClass: plugin.distributionClass,
    tierSource: plugin.tierSource,
    tier: tierOf(plugin.distributionClass),
    required,
    sourcePending,
    reason: sourcePending
      ? (plugin.maintenanceReason ?? '目录记录尚未发布可安装的制品（source-pending）')
      : null
  }
}

function parseProvenance(
  raw: unknown,
  packId: string,
  components: readonly PackComponent[],
  locked: boolean
): PackProvenance {
  if (isRecord(raw)) {
    const kind = requireString(raw['kind'], `${packId}.x-dsh-eac-provenance.kind`)
    if (kind !== 'mojobox-pack' && kind !== 'snapshot-derived') {
      throw new CatalogParseError(`${packId}.x-dsh-eac-provenance.kind must be mojobox-pack or snapshot-derived`)
    }
    const sources = Array.isArray(raw['sources']) ? raw['sources'].map((entry, index) => requireString(entry, `${packId}.x-dsh-eac-provenance.sources[${index}]`)) : []
    return {
      kind,
      locked,
      reason: requireString(raw['reason'], `${packId}.x-dsh-eac-provenance.reason`),
      sources
    }
  }
  const pending = components.filter((component) => component.sourcePending)
  return {
    kind: 'mojobox-pack',
    locked,
    reason: locked
      ? '来自 Mojobox Pack 与 Pack Lock'
      : `Mojobox 尚无该 Pack 的 Pack Lock（${pending.length} 个成员 source-pending，缺真实 npm 制品）`,
    sources: components.map((component) => component.id)
  }
}

function parsePack(raw: unknown, index: number, plugins: ReadonlyMap<string, PluginRecord>): PackView {
  if (!isRecord(raw)) throw new CatalogParseError(`packs[${index}] must be an object`)
  const metadata = raw['metadata']
  if (!isRecord(metadata)) throw new CatalogParseError(`packs[${index}].metadata must be an object`)
  const id = requireString(metadata['id'], `packs[${index}].metadata.id`)
  const version = requireString(metadata['version'], `packs[${index}].metadata.version`)
  const name = requireString(metadata['name'], `packs[${index}].metadata.name`)
  const description = requireString(metadata['description'], `packs[${index}].metadata.description`)

  const rawCategory = metadata['category']
  const category: PackCategory =
    typeof rawCategory === 'string' && PACK_CATEGORIES.includes(rawCategory as PackCategory)
      ? (rawCategory as PackCategory)
      : 'function'

  const rawComponents = raw['components']
  if (!Array.isArray(rawComponents) || rawComponents.length === 0) {
    throw new CatalogParseError(`${id}.components must be a non-empty array`)
  }

  const lockByComponent = lockSources(raw, id)
  const components = rawComponents.map((component, componentIndex) =>
    parseComponent(component, componentIndex, id, plugins, lockByComponent)
  )

  const locked = lockByComponent.size > 0 && components.every((component) => lockByComponent.has(component.id))

  return {
    id,
    version,
    name,
    description,
    category,
    provenance: parseProvenance(raw['x-dsh-eac-provenance'], id, components, locked),
    components
  }
}

/**
 * Read one catalog document into the installer's snapshot model.
 *
 * @param raw - parsed JSON of a Mojobox catalog (online) or the embedded snapshot.
 * @param options - `generatedAt` recorded on the result; defaults to the empty string for a caller that does not track it.
 * @returns the catalog, with every pack's components resolved against the plugin records.
 * @throws {CatalogParseError} for any document this installer refuses to install from.
 */
export function parseCatalog(raw: unknown, options: { generatedAt?: string } = {}): CatalogSnapshot {
  if (!isRecord(raw)) throw new CatalogParseError('catalog must be an object')
  const apiVersion = requireString(raw['apiVersion'], 'catalog.apiVersion')
  if (apiVersion !== CATALOG_API_VERSION) {
    throw new CatalogParseError(`catalog.apiVersion must be ${CATALOG_API_VERSION}, received ${JSON.stringify(apiVersion)}`)
  }

  const rawPlugins = raw['plugins']
  if (!Array.isArray(rawPlugins)) throw new CatalogParseError('catalog.plugins must be an array')
  const plugins = new Map<string, PluginRecord>()
  for (const [index, entry] of rawPlugins.entries()) {
    const record = parsePluginRecord(entry, index)
    if (plugins.has(record.id)) throw new CatalogParseError(`catalog.plugins repeats id ${record.id}`)
    plugins.set(record.id, record)
  }

  const rawPacks = raw['packs']
  if (!Array.isArray(rawPacks)) throw new CatalogParseError('catalog.packs must be an array')
  const packs = rawPacks.map((pack, index) => parsePack(pack, index, plugins))

  return { apiVersion, generatedAt: options.generatedAt ?? '', packs }
}

/** Look up one pack by id; `undefined` when the catalog does not carry it. */
export function findPack(snapshot: CatalogSnapshot, packId: string): PackView | undefined {
  return snapshot.packs.find((pack) => pack.id === packId)
}
