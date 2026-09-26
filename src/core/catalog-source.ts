/**
 * Catalog source selection: online first, embedded snapshot as the floor.
 *
 * The offline path is the one that must always work: the embedded snapshot is
 * parsed unconditionally and is the answer whenever the online read is
 * unavailable, slow, malformed or empty. `degraded` distinguishes "the online
 * attempt failed" (true, with the reason in `warnings`) from "there was no
 * online attempt by design" (false), so the settings section can say which of
 * the two happened instead of implying a failure that did not occur.
 *
 * @module core/catalog-source
 */

import type { CatalogResult } from '../protocol.ts'
import { parseCatalog } from './catalog.ts'

/** Online transport, implemented by the Host adapter over `fetch`. */
export interface CatalogSourcePort {
  /**
   * Read the online catalog document.
   * @param signal - aborted when the caller's deadline passes.
   */
  fetchOnline(signal: AbortSignal): Promise<unknown>
}

/** Input of {@link loadCatalog}. */
export interface LoadCatalogOptions {
  /** Parsed JSON of the embedded snapshot (`src/data/snapshot.ts`). */
  readonly embedded: unknown
  /** Online transport, or `null` when the build has none. */
  readonly port: CatalogSourcePort | null
  /** Set false to skip the online attempt entirely (user's offline preference). */
  readonly enabled?: boolean
  /** Deadline for the online read, in milliseconds. */
  readonly timeoutMs?: number
  /** Timestamp recorded on the returned snapshot. */
  readonly generatedAt?: string
}

/** Default deadline for the online read. */
export const DEFAULT_ONLINE_TIMEOUT_MS = 5_000

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function fetchWithDeadline(port: CatalogSourcePort, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  if (typeof timer === 'object' && typeof timer.unref === 'function') timer.unref()
  try {
    return await port.fetchOnline(controller.signal)
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`在线目录读取超时（${timeoutMs}ms）`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Read the catalog, preferring the online document.
 *
 * @param options - embedded snapshot, transport and deadline.
 * @returns the snapshot that answered, with its provenance.
 * @throws {CatalogParseError} when even the embedded snapshot is unusable —
 *   at that point there is nothing to fall back to and the caller must fail.
 */
export async function loadCatalog(options: LoadCatalogOptions): Promise<CatalogResult> {
  const { embedded, port, enabled = true, timeoutMs = DEFAULT_ONLINE_TIMEOUT_MS, generatedAt } = options

  // Parse the floor first: a broken snapshot is a build defect, not a runtime
  // condition, and must be reported before any network work happens.
  const fallback = parseCatalog(embedded, generatedAt === undefined ? {} : { generatedAt })

  if (!enabled) {
    return { source: 'snapshot', degraded: false, warnings: ['离线模式：使用内嵌目录快照'], snapshot: fallback }
  }
  if (port === null) {
    return { source: 'snapshot', degraded: false, warnings: [], snapshot: fallback }
  }

  try {
    const online = parseCatalog(await fetchWithDeadline(port, timeoutMs))
    if (online.packs.length === 0) throw new Error('在线目录没有任何 Pack')
    return { source: 'online', degraded: false, warnings: [], snapshot: online }
  } catch (error) {
    return {
      source: 'snapshot',
      degraded: true,
      warnings: [`在线目录不可用（${describe(error)}），已回退到内嵌快照`],
      snapshot: fallback
    }
  }
}
