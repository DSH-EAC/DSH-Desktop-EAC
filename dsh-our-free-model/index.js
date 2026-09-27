/**
 * Our Free Model — plugin entry (Host half).
 *
 * Wiring: one adapter instance, two provider routes (usable now / region-limited
 * on this egress), a live-catalog + availability-probe loop behind them, the
 * browser-facing JSON API the settings page reads, and the OpenAI-compatible
 * forward listener.
 *
 * On top of the model lane the plugin owns a small distribution channel of its
 * own: a remote announcement feed the repository owner publishes by pushing a
 * JSON document, an in-app self-updater that verifies and installs new releases
 * from the same repository, and a self hot-reload that swaps the running plugin
 * for the code now on disk. All three report to the browser over one
 * Server-Sent-Events route, because the kernel has no notification service and
 * the settings page should not have to poll.
 *
 * Every harness facility is reached through `ctx`, and only the one the plugin
 * cannot exist without is declared in `inject`, so a composition that omits the
 * rest degrades a feature rather than failing the plugin: no web server means no
 * in-app dashboard, no attachments means image blocks fall back to the text
 * projection the runtime already performs. See `inject` below.
 *
 * @module index.js
 */

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FreeModelAdapter, ROUTE_LABELS, ROUTE_MAIN, ROUTE_REGION } from './src/adapter.js'
import { JsonStore, SETTINGS_INITIAL, STATS_INITIAL, STATS_VERSION, DATA_DIR_NAME, MIN_DECODE_MS, decodeWindow, migrateStats, pruneDays, recordUsage, resolveDshHome } from './src/store.js'
import { buildCatalog, parseListing } from './src/catalog.js'
import { STATE, detectEgress, probeCatalog } from './src/probe.js'
import { generateKey, startForwardServer, toOpenAiUsage } from './src/forward.js'
import { CODE, UpstreamError, getJson } from './src/http.js'
import { mintRequestId, sessionForConversation } from './src/upstream.js'
import { DEFAULT_LEVEL, budgetLadder } from './src/effort.js'
import { toToolDefs } from './src/messages.js'
import { windowTokens } from './src/stream.js'
import { AnnouncementFeed } from './src/feed.js'
import { PluginUpdater, restoreBackup } from './src/updater.js'
import { selfReload, watchPackage, isReloading } from './src/reload.js'
import { createPushHub } from './src/push.js'
import { rejectionFor, isLoopbackHost } from './src/trust.js'
import { resolveAttributionUserAgent } from './adapter/kernel.js'

export const name = 'our-free-model'

/** The installed package directory — the self-updater and hot reload operate here. */
const PKG_URL = new URL('./', import.meta.url)
const PKG_DIR = fileURLToPath(PKG_URL)
const ENTRY_URL = new URL('index.js', import.meta.url).href

/** Published version of the installed package, read once at load. */
function readPackageVersion() {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8')).version ?? '')
  } catch {
    return ''
  }
}

/**
 * `llm` is what the plugin exists for, so it is the only hard requirement of the
 * plugin itself.
 *
 * Cordis withholds from a context any service its fiber does not name in
 * `inject`, and keeps that fiber PENDING while a named one is absent — which is
 * how v1.2.1 stayed permanently inactive on a composition with no HTTP server,
 * the surface issue #4 reported. So nothing else may be named here: a headless
 * composition would rather serve models without a settings page than serve
 * nothing.
 *
 * What that costs and what still works:
 * - `webServer` — the in-app dashboard and the SSE push channel. Reached through
 *   a nested `ctx.inject` fiber (see the browser-facing API section), which pends
 *   on its own and never blocks the lane above.
 * - `timer` (`ctx.interval`) — nothing. The background loops are plain unref'd
 *   timers (see `every`), because reading a mixin off an undeclared service
 *   throws rather than answering `undefined`.
 * - `connection`, `attachments` — one feature each: the fence falls back to its
 *   structural replica, image blocks to the text projection. Both are read with
 *   `ctx.get()`, which is the opportunistic lookup that answers `undefined`.
 */
export const inject = ['llm']

/** Static fallback catalog, so a cold start with no network still lists models. */
const FALLBACK_CATALOG = buildCatalog([
  'mimo-v2.6-flash-free', 'mimo-v2.5-free', 'ling-3.0-flash-fin-free',
  'nemotron-3-ultra-free', 'nemotron-3.5-lightning-free', 'space-bunny-free',
  'muse-spark-1.3-contributor-free', 'muse-spark-1.2-contributor-free',
])

/** Where the plugin's own announcement copy lives; bump it to re-announce. */
export const ANNOUNCEMENT_VERSION = '2026-09-25.1'

/**
 * Who owns the plugin's bytes — the distribution mode:
 *
 * - `self` (default): the plugin updates itself from its repository, publishes
 *   its announcement feed, and hot-reloads, exactly as before.
 * - `managed`: the plugin arrived through a distribution pack (an EAC
 *   integration pack, a Mojobox install). The pack manager owns the bytes now,
 *   so the in-app updater, the announcement channel and the hot reload stand
 *   down — two writers to one installed directory is a corrupted install. The
 *   model lane is untouched; this is about who ships the code, not what it does.
 *
 * `config.distribution` (what a pack's bundle patch passes) outranks the
 * settings file, and the settings API never accepts the field back, so an
 * install that shipped managed stays managed.
 */
const MANAGED_MESSAGE = 'this installation is managed; updates are handled by the pack that installed it'

/** Effective distribution mode: config override first, then the settings file. */
function distributionOf(config, settings) {
  if (config?.distribution === 'managed' || settings.get().distribution === 'managed') return 'managed'
  return 'self'
}

export function apply(ctx, config) {
  const logger = ctx.logger ?? console
  const home = resolveDshHome()
  const dataDir = path.join(home, DATA_DIR_NAME)
  fs.mkdirSync(dataDir, { recursive: true })
  const packageVersion = readPackageVersion()

  // A hot reload re-enters apply with fresh stores; the generation counter lives
  // on globalThis so the new instance knows it replaced a predecessor, and does
  // the post-swap bookkeeping itself (the old closure must not touch stores
  // after its own dispose — that would race the new instance's writes).
  const generation = (globalThis[Symbol.for('our-free-model.generation')] ?? 0) + 1
  globalThis[Symbol.for('our-free-model.generation')] = generation

  const settings = new JsonStore(path.join(dataDir, 'settings.json'), SETTINGS_INITIAL)
  const stats = new JsonStore(path.join(dataDir, 'stats.json'), STATS_INITIAL)
  const availability = new JsonStore(path.join(dataDir, 'availability.json'), { version: 1, at: 0, egress: null, results: {} })
  const catalogStore = new JsonStore(path.join(dataDir, 'catalog.json'), { version: 1, at: 0, entries: FALLBACK_CATALOG.map(entry => entry.id) })

  if (stats.get().version !== STATS_VERSION) stats.edit(migrateStats)

  if (generation > 1) {
    settings.update({ reloadedAt: Date.now(), reloadCount: generation - 1 })
    settings.flush()
  }

  /** `managed` stands down everything that would rewrite the installed bytes. */
  const distribution = distributionOf(config, settings)
  const managed = distribution === 'managed'

  let catalog = materializeCatalog(catalogStore.get().entries ?? [])
  let attributionUserAgent = 'deepseek-harness'
  let egress = availability.get().egress ?? null
  let forward = null
  let forwardError = ''

  // ── push channel ────────────────────────────────────────────────────────────
  const push = createPushHub({ logger })

  /** Set of announcement ids the user has acknowledged. */
  const ackedIds = () => new Set(Array.isArray(settings.get().announcementsAcked) ? settings.get().announcementsAcked : [])

  const feed = new AnnouncementFeed({
    settings: () => settings.get(),
    cacheFile: path.join(dataDir, 'feed.json'),
    onArrival: items => {
      push.emit('announcements', { items, unread: feedView().unread })
      refreshUpdatePush?.()
    },
    log: message => logger.info?.(message),
  })
  feed.load()

  /**
   * The announcement view the settings page reads. A managed install polls no
   * feed and caches no copy — the pack speaks for the plugin — so its view is a
   * fixed empty one that names its source honestly.
   */
  const MANAGED_FEED_VIEW = { items: [], unread: 0, fetchedAt: 0, source: 'managed', error: '', lastError: '' }
  function feedView() {
    return managed ? MANAGED_FEED_VIEW : feed.view({ ackedIds: ackedIds() })
  }

  const updater = new PluginUpdater({
    pkgDir: PKG_DIR,
    dataDir,
    settings: () => settings.get(),
    log: message => logger.info?.(message),
  })
  /** Update versions we have already pushed a notification for. */
  let updateNotifiedFor = typeof settings.get().updateNotifiedFor === 'string' ? settings.get().updateNotifiedFor : ''

  /** Push an `update` event once per version (manual checks force a re-push). */
  function pushUpdate(force = false) {
    if (disposed || managed) return
    const status = updater.status()
    if (status.available !== true || status.latest === '') return
    if (!force && status.latest === updateNotifiedFor) return
    updateNotifiedFor = status.latest
    settings.update({ updateNotifiedFor: status.latest })
    push.emit('update', { current: status.current, latest: status.latest, notes: status.notes })
  }
  let refreshUpdatePush = undefined
  /** Set when this generation is disposed; late async callbacks must stand down. */
  let disposed = false

  /** The immutable snapshot every adapter call binds to. */
  const state = () => ({
    catalog,
    membership: computeMembership(catalog, availability.get(), settings.get()),
    settings: settings.get(),
    attributionUserAgent,
  })

  /** A turn refused for geography means the egress moved; re-classify promptly. */
  let reprobeTimer
  function scheduleReprobe() {
    if (reprobeTimer !== undefined) return
    reprobeTimer = setTimeout(() => {
      reprobeTimer = undefined
      void refreshAvailability().catch(() => {})
    }, 4000)
    reprobeTimer.unref?.()
  }

  const adapter = new FreeModelAdapter({
    state,
    resolveImage: imageResolver(ctx, logger),
    recordUsage: record => {
      recordUsage(stats, record)
      stats.edit(state => pruneDays(state, 120))
    },
    warn: message => logger.warn?.(message) ?? logger.log?.(message),
    onRegionBlocked: () => scheduleReprobe(),
  })

  // ── registration ────────────────────────────────────────────────────────────
  const routes = () => Object.keys(computeMembership(catalog, availability.get(), settings.get()))
  const registration = ctx.llm.registerAdapter([ROUTE_MAIN, ROUTE_REGION], adapter)
  ctx.llm.registerConfigurableProviders?.([
    { provider: ROUTE_MAIN, displayName: ROUTE_LABELS[ROUTE_MAIN], settingsNs: ctx.fiber?.entry?.options?.id ?? name, settingsPath: [] },
  ])

  // Advertise a probe endpoint for the in-app "detect models" button. It offers
  // what the picker itself advertises — a model the gateway refuses to route at
  // all must not be addable to a profile just because it still appears in the
  // upstream listing.
  ctx.llm.registerModelDiscovery?.(ctx.fiber?.entry?.options?.id ?? name, async () => {
    await refreshCatalog({ probe: true })
    const advertised = new Set(Object.values(state().membership).flat())
    return catalog
      .filter(entry => advertised.has(entry.id))
      .map(entry => ({
        id: entry.id,
        name: entry.name,
        contextWindow: entry.contextWindow,
        maxTokens: entry.maxOutput,
        inputModalities: entry.vision ? ['text', 'image'] : ['text'],
      }))
  })

  ctx.on?.('loader/volatile-update', () => {
    registration.replace(routes())
  })

  // ── catalog + availability ──────────────────────────────────────────────────
  async function refreshCatalog({ probe = true } = {}) {
    let ids = []
    try {
      ids = parseListing(await fetchListing())
    } catch (error) {
      logger.warn?.(`our-free-model: model listing refresh failed (${error?.message ?? error}); keeping the cached catalog`)
    }
    if (ids.length > 0) {
      catalog = buildCatalog(ids)
      catalogStore.update({ at: Date.now(), entries: catalog.map(entry => entry.id) })
      catalogStore.flush()
      settings.update({ catalogSyncedAt: Date.now() })
    } else {
      catalog = materializeCatalog(catalogStore.get().entries ?? [])
    }
    if (probe) await refreshAvailability()
    emitTopology()
    return catalog
  }

  async function fetchListing() {
    // Read straight from the listing path rather than the probe helper: a listing
    // needs no session identity, and a failure should be a plain throw. Through
    // `getJson` so the base URL stays the one override every other request uses.
    return await getJson('/zen/v1/models', {
      session: sessionForConversation('catalog:our-free-model'),
      requestId: mintRequestId(),
      attributionUserAgent,
    })
  }

  async function runProbeRound() {
    const results = await probeCatalog(catalog, { attributionUserAgent }, (id, result) => {
      availability.edit(state => ({ ...state, results: { ...state.results, [id]: { state: result.state, ...result.detail === undefined ? {} : { detail: result.detail }, ...result.ttftMs === undefined ? {} : { ttftMs: result.ttftMs }, latencyMs: result.latencyMs, at: Date.now() } } }))
    }, 2)
    availability.update({ at: Date.now(), egress })
    availability.flush()
    // Say it out loud when a round refuses everything: `computeMembership` keeps
    // the roster advertised in that case, and without this line the log would
    // read as a healthy probe while the gateway was turning every model down.
    const verdicts = Object.values(results)
    if (verdicts.length > 0 && verdicts.every(row => row.state === STATE.unavailable)) {
      logger.warn?.(`our-free-model: the gateway refused all ${verdicts.length} models this round (${verdicts[0].detail ?? 'no detail'}); keeping them advertised`)
    }
    emitTopology()
    return results
  }

  /**
   * One catalog round at a time, for every caller.
   *
   * Four things start a round: the periodic catalog loop, the 2-minute egress
   * watch, a mid-turn `RegionError`, and the two settings buttons. Each awaited a
   * fresh `probeCatalog`, so a slow round and a trigger arriving during it ran
   * whole catalogs side by side — against a lane whose 429 carries a growing
   * `retry-after`, that is the user's own quota spent on the same question. A
   * caller that arrives mid-round joins the round in flight instead of starting
   * another, which is what the feed poll above already does.
   */
  let probeRound = null
  async function refreshAvailability() {
    if (probeRound !== null) return probeRound
    const round = runProbeRound()
    probeRound = round
    try {
      return await round
    } finally {
      if (probeRound === round) probeRound = null
    }
  }


  async function watchEgress() {
    const seen = await detectEgress()
    if (seen === undefined) return
    const previous = availability.get().egress
    const changed = previous === null || previous === undefined
      || previous.ip !== seen.ip || (seen.country !== undefined && previous.country !== seen.country)
    egress = seen
    if (changed) {
      availability.update({ egress: seen })
      availability.flush()
      logger.info?.(`our-free-model: egress changed to ${seen.ip}${seen.country ? ` (${seen.country})` : ''}; re-probing availability`)
      await refreshAvailability()
    }
  }

  // ── forward listener ────────────────────────────────────────────────────────
  async function syncForward() {
    const desired = settings.get().forward ?? {}
    const wanted = desired.enabled === true
    // A listener already bound where the settings want it is left alone. Two
    // callers reconcile the same state — the boot refresh and every settings
    // POST — and the second one used to close and re-bind the port anyway,
    // resetting whatever request was in flight on the old socket.
    if (forward !== null && wanted
      && forward.host === (desired.host || '127.0.0.1')
      && forward.port === (Number.isFinite(Number(desired.port)) ? Number(desired.port) : 0)) return
    if (forward === null && !wanted) return
    if (forward !== null) {
      const closing = forward
      forward = null
      await closing.close().catch(() => {})
    }
    if (!wanted) {
      forwardError = ''
      return
    }
    // Checked again here, not only where the settings page posts: a headless
    // composition has no page to click, and `settings.json` is the way in. A
    // routable bind would spend this machine's free lane on the whole subnet.
    if (!isLoopbackHost(desired.host || '127.0.0.1')) {
      forwardError = 'the forward listener binds a loopback address only'
      logger.warn?.(`our-free-model: forward listener not started (${forwardError})`)
      return
    }
    try {
      forward = await startForwardServer({
        config: () => {
          const current = settings.get().forward ?? {}
          return { host: current.host || '127.0.0.1', port: current.port ?? 0, enabled: current.enabled === true, key: forwardKey() }
        },
        complete: (request, onChunk) => runForwarded(request, onChunk),
        modelRows: () => publicModelRows(),
        log: message => logger.warn?.(`our-free-model forward: ${message}`),
      })
      forwardError = ''
      settings.update({ forward: { ...desired, port: forward.port, host: desired.host || '127.0.0.1' } })
      settings.flush()
    } catch (error) {
      forwardError = String(error?.message ?? error)
      logger.warn?.(`our-free-model: forward listener could not start (${forwardError})`)
    }
  }

  function forwardKey() {
    const current = settings.get()
    if (typeof current.forwardKey === 'string' && current.forwardKey !== '') return current.forwardKey
    const minted = generateKey()
    settings.update({ forwardKey: minted })
    settings.flush()
    return minted
  }

  /**
   * Run one forwarded OpenAI request through the adapter.
   *
   * The caller's spelling is translated into harness messages, and the resulting
   * chunk stream is handed straight back to the caller's callback while an
   * outcome summary accumulates for the non-streaming path.
   */
  async function runForwarded(request, onChunk) {
    const entry = catalog.find(candidate => candidate.id === request.model)
    if (entry === undefined) throw new UpstreamError(`unknown model "${request.model}"`, CODE.server)
    const openAi = request.openAi ?? {}
    const messages = fromOpenAiMessages(openAi, request.responses === true)
    const tools = toToolDefs((openAi.tools ?? []).map(normalizeTool).filter(Boolean), request.responses === true ? 'flat' : 'chat')
    const handler = typeof onChunk === 'function' ? onChunk : () => {}
    const outcome = { text: '', toolCalls: [], usage: undefined, truncated: false, error: undefined }

    const options = {
      provider: ROUTE_MAIN,
      model: entry.id,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      ...typeof openAi.temperature === 'number' ? { temperature: openAi.temperature } : {},
      ...typeof openAi.max_tokens === 'number' ? { maxTokens: openAi.max_tokens } : {},
      ...typeof openAi.reasoning_effort === 'string' ? { reasoningEffort: openAi.reasoning_effort } : {},
      sessionId: `forward:${String(openAi.user ?? openAi.conversation ?? 'shared')}`,
    }

    for await (const chunk of adapter.stream(options, entry, state())) {
      handler(chunk)
      foldForwardOutcome(outcome, chunk)
    }
    // A max-tokens finish means the adapter judged a tool call unexecutable
    // (arguments cut mid-JSON); keep the OpenAI answer consistent with its
    // finish_reason by not reporting the broken call alongside `length`.
    if (outcome.truncated === true) {
      outcome.toolCalls = outcome.toolCalls.filter(call => {
        try { JSON.parse(call.arguments === '' ? '{}' : call.arguments); return true } catch { return false }
      })
    }
    return outcome
  }

  function publicModelRows() {
    const membership = new Set(state().membership[ROUTE_MAIN] ?? [])
    if (settings.get().exposeRegionModels !== false) for (const id of state().membership[ROUTE_REGION] ?? []) membership.add(id)
    return catalog
      .filter(entry => membership.has(entry.id))
      .map(entry => ({
        id: entry.id,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'our-free-model',
        ...entry.contextWindow === undefined ? {} : { context_window: entry.contextWindow },
      }))
  }

  // ── hot reload + in-app upgrade ─────────────────────────────────────────────
  /**
   * Swap the running plugin for the code on disk. Called for explicit reloads
   * and at the end of an upgrade; the updater's rollback directory is the disk
   * safety net when the new code cannot start.
   */
  async function reloadFromDisk() {
    const result = await selfReload(ctx, { logger, packageUrl: PKG_URL, entryUrl: ENTRY_URL })
    if (result.ok) return result
    // The registry is back on the old code; make the disk match it.
    try { restoreBackup(updater.backupDir, PKG_DIR) } catch { /* best effort */ }
    throw new Error(result.error)
  }

  async function applyUpgrade(version) {
    if (managed) throw httpError(409, MANAGED_MESSAGE)
    if (isReloading()) throw new Error('a reload is already in progress')
    const result = await updater.apply({ version })
    // The next apply() picks this up and pushes `upgraded` once it is live.
    globalThis[Symbol.for('our-free-model.pending-upgrade')] = result.version
    try {
      await reloadFromDisk()
    } catch (error) {
      // The successor will never boot, so it can never consume the marker —
      // clear it or the next cold start would announce a phantom upgrade.
      globalThis[Symbol.for('our-free-model.pending-upgrade')] = undefined
      throw error
    }
    return { ...result, reloaded: true }
  }

  /**
   * Watch the installed package and hot-reload when its files change.
   * Off by default; the settings page flips it for development and demos.
   */
  let watcher = undefined
  function syncWatcher() {
    const wanted = settings.get().autoReloadWatch === true
    if (wanted && watcher === undefined) {
      watcher = watchPackage(PKG_DIR, {
        logger,
        onChange: () => {
          if (isReloading()) return
          logger.info?.('our-free-model: watched files changed; hot-reloading')
          void reloadFromDisk().catch(error => logger.warn?.(`our-free-model: hot reload failed (${error?.message ?? error})`))
        },
      })
    } else if (!wanted && watcher !== undefined) {
      watcher()
      watcher = undefined
    }
  }

  // ── browser-facing API ──────────────────────────────────────────────────────
  /**
   * Read a service the composition may or may not mount.
   *
   * `ctx.get` is cordis' opportunistic lookup: it answers `undefined` instead of
   * throwing when the service is absent — and also while it is merely not
   * provided yet, which matters because plugins load before the browser half has
   * published anything. So a service read this way is a snapshot: `connection` is
   * therefore resolved per request below, and `webServer` gets its own fiber (see
   * the `ctx.inject` at the end of this section).
   */
  const optional = service => (typeof ctx.get === 'function' ? ctx.get(service) : undefined)
  /**
   * The trust fence's view of the connection service, looked up per request.
   *
   * The browser half publishes `connection` after plugins have loaded, so reading
   * it once here would freeze in "absent" and leave every request on the replica
   * fence for the life of the process. The getter answers `undefined` — not a
   * no-op function — while the service is missing, which is what makes the fence
   * fall through to its own structural check instead of reading as "admitted".
   */
  const fenceConnection = {
    get admit() {
      const current = optional('connection')
      return current === undefined ? undefined : (req => current.admit(req))
    },
  }
  const api = createApiRoutes({
    settings, stats, availability, catalog: () => catalog, state,
    refreshCatalog, refreshAvailability, syncForward,
    forwardInfo: () => ({ running: forward !== null, port: forward?.port ?? 0, error: forwardError, egress }),
    rotateKey: () => {
      const minted = generateKey()
      settings.update({ forwardKey: minted })
      settings.flush()
      return minted
    },
    testModel: async (id, effort) => {
      const entry = catalog.find(candidate => candidate.id === id)
      if (entry === undefined) throw new UpstreamError(`unknown model "${id}"`, CODE.server)
      const started = Date.now()
      let firstFrame
      let sawReasoning = false
      let text = ''
      let usage
      for await (const chunk of adapter.stream({
        provider: ROUTE_MAIN,
        model: entry.id,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        reasoningEffort: effort === undefined || effort === '' ? DEFAULT_LEVEL : effort,
        sessionId: `bench:${entry.id}:${effort ?? DEFAULT_LEVEL}`,
      }, entry, state())) {
        if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta' || chunk.type === 'tool-call-delta') {
          if (firstFrame === undefined) firstFrame = Date.now()
          if (chunk.type === 'reasoning-delta') sawReasoning = true
          if (chunk.type === 'text-delta') text += chunk.text
        }
        if (chunk.type === 'usage') usage = chunk.usage
        if (chunk.type === 'finish' && chunk.reason.kind !== 'stop' && chunk.reason.kind !== 'tool-calls') {
          throw new UpstreamError(chunk.reason.failure?.message ?? chunk.reason.kind, chunk.reason.failure?.code ?? CODE.server)
        }
      }
      const ms = Date.now() - started
      // Same rule as the recorded calls: the rate divides only by a window that
      // actually covers the tokens in its numerator.
      const measured = decodeWindow(firstFrame === undefined ? 0 : ms - firstFrame, windowTokens(usage, sawReasoning), true)
      return {
        model: entry.id, effort: effort ?? DEFAULT_LEVEL, ok: true,
        totalMs: ms,
        ttftMs: firstFrame === undefined ? ms : firstFrame - started,
        outputTokens: usage?.outputTokens ?? 0,
        reasoningTokens: usage?.reasoningTokens ?? 0,
        tokensPerSecond: measured.tps,
        sample: text.slice(0, 60),
      }
    },
    meta: () => ({
      version: packageVersion,
      distribution,
      generation,
      reloadedAt: settings.get().reloadedAt ?? 0,
      reloadCount: settings.get().reloadCount ?? 0,
      dataDir,
      autoReloadWatch: settings.get().autoReloadWatch === true,
      lastReload: globalThis[Symbol.for('our-free-model.last-reload')] ?? undefined,
      purgeSample: globalThis[Symbol.for('our-free-model.purge-sample')] ?? undefined,
    }),
    announcements: {
      view: feedView,
      /** Persist the complete acked set the caller assembled (full-replace
       *  semantics: the caller decides additions *and* clearings). */
      ack: ids => {
        settings.update({ announcementsAcked: [...ids] })
        settings.flush()
        return feedView()
      },
      refresh: () => feed.poll(),
    },
    update: {
      status: () => managed
        ? { ...updater.status(), managed: true, available: false, latest: '' }
        : { ...updater.status(), notifiedFor: updateNotifiedFor },
      check: async () => {
        if (managed) throw httpError(409, MANAGED_MESSAGE)
        const result = await updater.check()
        pushUpdate(true)
        return result
      },
      apply: applyUpgrade,
    },
    hotReload: () => {
      if (managed) throw httpError(409, MANAGED_MESSAGE)
      return reloadFromDisk()
    },
    /** Fixed for this generation; the settings API cannot flip it (see below). */
    managedDistribution: managed,
    push,
    connection: fenceConnection,
    logger,
  })

  // The dashboard half runs in its own fiber so that a composition without an
  // HTTP server cannot take the model lane down with it.
  //
  // `ctx.inject(deps, callback)` is cordis' "run this once these services exist":
  // the callback pends while `webServer` is absent *or merely not provided yet*,
  // and is re-run if the service is replaced. That pending is the whole point —
  // reading `ctx.get('webServer')` once at apply time answered `undefined` in the
  // real web composition (plugins load before the browser half publishes it), the
  // routes never registered, and the settings page had no data source while a web
  // server was busy serving it.
  ctx.inject(['webServer'], scoped => {
    const server = scoped.webServer
    scoped.effect(() => server.register({ kind: 'prefix', path: '/api/our-free-model', handler: api }), 'our-free-model: api routes')
    // The events stream is an exact route: exact dispatch outranks the prefix, so
    // the hub's handler owns the socket while every other path still lands on the
    // JSON API.
    scoped.effect(() => server.register({ kind: 'exact', path: '/api/our-free-model/events', handler: eventsRoute }), 'our-free-model: events stream')
    logger.info?.('our-free-model: settings API mounted at /api/our-free-model')
  })

  /** Adopt one request as a live push stream, after the trust fence. */
  function eventsRoute(req, res) {
    const rejection = rejectionFor(req, fenceConnection)
    if (rejection !== undefined) {
      res.writeHead(rejection, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
      return
    }
    push.attach(req, res, helloPayload())
  }

  function helloPayload() {
    return {
      version: packageVersion,
      announcements: { unread: feedView().unread, fetchedAt: feedView().fetchedAt },
      update: { available: updater.status().available, latest: updater.status().latest },
      reloadedAt: settings.get().reloadedAt ?? 0,
    }
  }

  // ── boot + background loop ──────────────────────────────────────────────────
  ctx.effect(() => () => {
    settings.dispose(); stats.dispose(); availability.dispose(); catalogStore.dispose()
  }, 'our-free-model: stores')

  ctx.effect(() => () => {
    void forward?.close().catch(() => {})
  }, 'our-free-model: forward listener')

  ctx.effect(() => () => { registration() }, 'our-free-model: adapter routes')

  ctx.effect(() => () => {
    disposed = true
    push.dispose()
    watcher?.()
  }, 'our-free-model: push + watcher')

  ctx.effect(() => {
    void (async () => {
      attributionUserAgent = await resolveAttributionUserAgent(logger)
      await refreshCatalog({ probe: true })
      await syncForward()
      syncWatcher()
      emitTopology()
      push.emit('hello', helloPayload())
      // An upgrade that ended in a hot reload reports from its successor.
      const pending = globalThis[Symbol.for('our-free-model.pending-upgrade')]
      if (pending !== undefined) {
        globalThis[Symbol.for('our-free-model.pending-upgrade')] = undefined
        settings.update({ installedVersion: pending })
        settings.flush()
        push.emit('upgraded', { version: pending, clientChanged: true })
      }
    })().catch(error => logger.warn?.(`our-free-model: startup refresh failed (${error?.message ?? error})`))
  }, 'our-free-model: boot refresh')

  // Feed poll: shortly after boot, then on the configured period. Concurrency
  // with a manual refresh is harmless — polls share one in-flight request.
  // A managed install polls nothing: the pack speaks for the plugin.
  ctx.effect(() => {
    if (managed) return
    const first = setTimeout(() => { void feed.poll() }, 12_000)
    first.unref?.()
    return () => clearTimeout(first)
  }, 'our-free-model: first feed poll')

  /**
   * Run one task every `ms` for as long as this generation lives.
   *
   * A plain unref'd timer chain, on purpose. `ctx.interval` is a mixin over the
   * `timer` service, and reading it from a fiber that did not name `timer` in
   * `inject` throws inside the real cordis proxy (`cannot get property "timer"
   * without inject`) instead of answering `undefined` — that one read is what
   * stopped the whole plugin from activating. `timer` is not worth declaring on a
   * headless composition, and the mixin adds nothing here beyond `setTimeout` plus
   * a disposer: it must not hold the process open, and `disposed` ends it when the
   * fiber goes away. Without any loop the availability probe would run once at
   * boot, so a model that throttled, recovered, or moved behind the region gate
   * would keep the picker position it was first given.
   */
  function every(task, ms) {
    let handle = setTimeout(function tick() {
      if (disposed) return
      task()
      handle = setTimeout(tick, ms)
      handle.unref?.()
    }, ms)
    handle.unref?.()
    ctx.effect(() => () => clearTimeout(handle), 'our-free-model: interval')
  }

  const feedMinutes = positiveOr(settings.get().feedPollMinutes, 30, 5)
  if (!managed) {
    every(() => {
      void feed.poll()
      const hours = settings.get().updateCheckHours ?? 6
      if (hours > 0) void updater.check().then(() => pushUpdate(false)).catch(() => {})
    }, feedMinutes * 60_000)
  }
  // The probe period is in minutes, and one minute is the floor — a value of 0 or
  // a negative one would otherwise spin. This used to read `Math.max(60, …)`,
  // which floored every interval below an hour *including the shipped default of
  // 15*, so the number on the settings page was silently ignored.
  every(() => {
    void (async () => {
      await watchEgress()
      await refreshCatalog({ probe: true })
    })().catch(error => logger.warn?.(`our-free-model: periodic refresh failed (${error?.message ?? error})`))
  }, positiveOr(settings.get().probeIntervalMinutes, 15, 1) * 60_000)
  every(() => {
    void watchEgress().catch(() => {})
  }, 120_000)
  // The first update check waits for the boot refresh to settle, then runs once
  // even when the periodic poll is disabled (hours === 0 means opt out fully).
  // Managed installs check nothing — the pack that installed them decides.
  ctx.effect(() => {
    if (managed) return
    const first = setTimeout(() => {
      const hours = settings.get().updateCheckHours ?? 6
      if (hours <= 0) return
      void updater.check().then(() => pushUpdate(false)).catch(() => {})
    }, 40_000)
    first.unref?.()
    return () => clearTimeout(first)
  }, 'our-free-model: first update check')

  // Keep the module-level "notified" marker in sync with the stored one so a
  // reload does not re-toast the same version.
  refreshUpdatePush = () => pushUpdate(false)

  function emitTopology() {
    try { ctx.emit?.('llm/adapters-updated') } catch { /* no listener surface */ }
    registration.replace(routes())
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * An error the settings API presents with its own status line, not a bare 500.
 * Used where a refusal is the *correct* answer — a managed install declining to
 * update itself — so the page can say why instead of blaming a fault.
 */
function httpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

/**
 * A period that cannot become a hot loop.
 *
 * `setTimeout(fn, NaN)` is `setTimeout(fn, 1)` in Node, and a settings file the
 * user edits by hand (the only way in on a headless composition) can carry
 * anything. Both timers below take their period from a stored number, so the
 * guard belongs here rather than in each caller.
 */function positiveOr(value, fallback, floor = 1) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return Math.max(floor, Math.trunc(number))
}

/**
 * Coerce the settings a timer or the wire reads.
 *
 * The settings page's own cleared input field posts `0`: on the output ceiling
 * that read as `min(model capacity, 0)` and every turn came back capped at the
 * 512-token floor, and on a period it asked for a probe round a minute. A value
 * that is not a positive number is "the user did not set one", so it falls back
 * to what ships rather than being clamped into an extreme.
 */
function sanitizeSettings(patch, current) {
  const next = { ...patch }
  const positive = (key, fallback) => {
    if (next[key] === undefined) return
    const value = Number(next[key])
    next[key] = Number.isFinite(value) && value > 0 ? Math.trunc(value) : (Number(current[key]) || fallback)
  }
  positive('probeIntervalMinutes', 15)
  positive('feedPollMinutes', 30)
  positive('defaultMaxTokens', 32768)
  if (next.updateCheckHours !== undefined) {
    // Zero is a real answer here: it means "stop checking for updates".
    const hours = Number(next.updateCheckHours)
    next.updateCheckHours = Number.isFinite(hours) && hours >= 0 ? Math.trunc(hours) : (Number(current.updateCheckHours) || 6)
  }
  return next
}

/**
 * Which route advertises which model, given the last probe.
 *
 * Region-gated models move to their dedicated route, and only while the user
 * wants them shown. Everything else sits on the main route, including models a
 * probe could not reach this round — a call that never got an answer is not a
 * verdict, and a flaky network must not empty the picker.
 *
 * A model the gateway named in its listing but refused to route at all is the
 * exception: it cannot answer any prompt, so advertising it trades the user's
 * turn for a guaranteed failure. Those come out of both routes until a later
 * probe reverses the verdict, which the periodic re-probe does by itself if the
 * lane brings the id back.
 *
 * A catalog entry with no verdict at all is normal, not an edge case: a fresh
 * install has no probe history until the boot round lands (one ping per model,
 * two at a time, each with a 45 second budget), and a model the listing just
 * added has none until the next one does. Such an entry is advertised — not
 * knowing is not the same as knowing it is refused.
 *
 * The one thing that may never happen is an empty result. Every model failing
 * the same way means the lane or the client fingerprint is broken, not that the
 * whole roster went away, and a picker with no models at all is worse than one
 * with a stale entry — so a round that refused everything is ignored, geography
 * grouping and all.
 */
function computeMembership(catalog, availabilitySnapshot, settings) {
  const results = availabilitySnapshot?.results ?? {}
  const expose = settings?.exposeRegionModels !== false
  const verdictOf = entry => results[entry.id]?.state
  let usable = catalog.filter(entry => verdictOf(entry) !== STATE.unavailable)
  if (catalog.length > 0 && usable.length === 0) usable = catalog
  const main = []
  const region = []
  for (const entry of usable) {
    const verdict = verdictOf(entry)
    if (verdict !== STATE.regionBlocked) main.push(entry.id)
    else if (expose) region.push(entry.id)
  }
  const membership = {}
  if (main.length > 0) membership[ROUTE_MAIN] = main
  if (region.length > 0) membership[ROUTE_REGION] = region
  return membership
}

function materializeCatalog(ids) {
  const rebuilt = buildCatalog(ids)
  return rebuilt.length > 0 ? rebuilt : FALLBACK_CATALOG
}

/**
 * Resolve an image attachment into a data URL the provider can accept.
 *
 * The attachment service exposes a host path, not bytes; reading it here keeps the
 * plugin free of a second credential path. An unresolvable image is reported as a
 * warning and dropped — the runtime has already text-projected files, and a
 * text-only model never sees an image block in the first place.
 */
function imageResolver(ctx, logger) {
  if (typeof ctx.get !== 'function') return undefined
  const cache = new Map()
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024
  return ref => {
    // Looked up per call, not once at apply time: this is the third instance of
    // the same cordis trap the release note describes for `webServer` and
    // `connection` — a service that plugins load before is not provided yet, so a
    // one-shot read silently cost the whole feature (here: image attachments,
    // with nothing in the log to say so).
    const attachments = ctx.get('attachments')
    if (attachments === undefined || typeof attachments.imageHostPath !== 'function') return undefined
    const id = String(ref?.attachmentId ?? '')
    if (id === '') return undefined
    const cached = cache.get(id)
    if (cached !== undefined) return cached
    try {
      const hostPath = attachments.imageHostPath(ref)
      if (typeof hostPath !== 'string' || hostPath === '') return undefined
      const size = fs.statSync(hostPath).size
      if (size > MAX_IMAGE_BYTES) { logger.warn?.(`our-free-model: image ${id} is ${size} bytes, above the ${MAX_IMAGE_BYTES} send limit`); return undefined }
      const media = typeof ref.mediaType === 'string' ? ref.mediaType : 'image/png'
      const url = `data:${media};base64,${fs.readFileSync(hostPath).toString('base64')}`
      if (cache.size > 48) cache.clear()
      cache.set(id, url)
      return url
    } catch (error) {
      logger.warn?.(`our-free-model: could not read image ${id} (${error?.message ?? error})`)
      return undefined
    }
  }
}

/** OpenAI request messages -> harness messages, for the forward listener. */
function fromOpenAiMessages(body, isResponses) {
  const out = []
  const rows = isResponses
    ? normaliseResponsesInput(body.input)
    : (Array.isArray(body.messages) ? body.messages : [])
  for (const row of rows) {
    const role = row.role ?? 'user'
    const content = []
    if (typeof row.content === 'string') {
      if (row.content !== '') content.push({ type: 'text', text: row.content })
    } else if (Array.isArray(row.content)) {
      for (const part of row.content) {
        if (typeof part === 'string') { if (part !== '') content.push({ type: 'text', text: part }); continue }
        const text = part?.text ?? part?.input_text ?? part?.output_text
        if (typeof text === 'string' && text !== '') content.push({ type: 'text', text })
        const image = part?.image_url?.url ?? part?.image_url
        if (typeof image === 'string' && image !== '') {
          content.push({ type: 'image', attachment: { attachmentId: `url:${image.slice(0, 64)}`, mediaType: 'image/png', bytes: 0, width: 0, height: 0, url: image } })
        }
      }
    }
    if (role === 'tool') {
      out.push({ role: 'tool', content: [{ type: 'text', text: typeof row.content === 'string' ? row.content : JSON.stringify(row.content ?? '') }], toolCallId: row.tool_call_id ?? '', source: { kind: 'tool', callId: row.tool_call_id ?? '' } })
      continue
    }
    if (role === 'assistant' && Array.isArray(row.tool_calls)) {
      for (const call of row.tool_calls) {
        content.push({ type: 'tool-call', id: call.id ?? '', name: call.function?.name ?? '', arguments: call.function?.arguments ?? '{}' })
      }
    }
    if (content.length === 0) continue
    out.push({
      role: role === 'developer' ? 'developer' : role === 'system' ? 'system' : role === 'assistant' ? 'assistant' : 'user',
      content,
      ...role === 'assistant' ? { source: { kind: 'model' } } : {},
    })
  }
  return out
}

function normaliseResponsesInput(input) {
  if (typeof input === 'string') return [{ role: 'user', content: input }]
  if (!Array.isArray(input)) return []
  return input.map(row => {
    if (typeof row === 'string') return { role: 'user', content: row }
    if (row.type === 'function_call') return { role: 'assistant', content: [], tool_calls: [{ id: row.call_id, function: { name: row.name, arguments: row.arguments } }] }
    if (row.type === 'function_call_output') return { role: 'tool', content: String(row.output ?? ''), tool_call_id: row.call_id }
    return row
  })
}

function normalizeTool(tool) {
  const name = tool?.name ?? tool?.function?.name
  if (typeof name !== 'string' || name.trim() === '') return null
  const parameters = tool?.parameters ?? tool?.function?.parameters ?? { type: 'object', properties: {} }
  return { name, description: String(tool?.description ?? tool?.function?.description ?? ''), parameters }
}

function foldForwardOutcome(outcome, chunk) {
  switch (chunk.type) {
    case 'text-delta': outcome.text += chunk.text; break
    case 'tool-call-delta': {
      let call = outcome.toolCalls.find(candidate => candidate.slot === chunk.index)
      if (call === undefined) { call = { slot: chunk.index, id: chunk.id ?? '', name: chunk.name ?? '', arguments: chunk.argumentsDelta ?? '' }; outcome.toolCalls.push(call) }
      else call.arguments += chunk.argumentsDelta ?? ''
      if (chunk.name) call.name = chunk.name
      if (chunk.id) call.id = chunk.id
      break
    }
    case 'block-end':
      if (chunk.block?.type === 'tool-call') {
        const existing = outcome.toolCalls.find(candidate => candidate.id === chunk.block.id)
        if (existing === undefined) outcome.toolCalls.push({ slot: chunk.index, id: chunk.block.id, name: chunk.block.name, arguments: chunk.block.arguments })
      }
      break
    case 'usage': outcome.usage = toOpenAiUsage(chunk.usage); break
    case 'finish':
      if (chunk.reason?.kind === 'max-tokens') outcome.truncated = true
      // An aborted turn carries the same in-body nothing as an errored one; both
      // are the caller's failure to report, not an empty completion.
      if (chunk.reason?.kind === 'error' || chunk.reason?.kind === 'aborted') outcome.error = chunk.reason.failure?.message
      break
    default: break
  }
  return outcome
}

/**
 * The settings page's HTTP surface.
 *
 * Every route runs the trust fence first: the connection service's own
 * admission when the composition mounts it (the same check the kernel applies
 * to `/api`), otherwise the structural replica in src/trust.js. The plugin's
 * prefix outranks `/api` in webServer's longest-prefix dispatch, so without
 * this fence these routes would answer callers the app itself would refuse.
 */
function createApiRoutes(deps) {
  return async function handler(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const routePath = url.pathname.replace(/^\/api\/our-free-model/, '').replace(/\/+$/, '') || '/'
    const method = String(req.method ?? 'GET').toUpperCase()
    const rejection = rejectionFor(req, deps.connection)
    const send = (status, payload) => {
      const body = JSON.stringify(payload)
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(body)
    }
    if (rejection !== undefined) return send(rejection, { error: rejection === 401 ? 'unauthorized' : 'forbidden' })
    try {
      if (method === 'GET' && routePath === '/summary') {
        return send(200, buildSummary(deps))
      }
      if (method === 'GET' && routePath === '/stats') {
        return send(200, buildStats(deps.stats.get(), deps.catalog()))
      }
      if (method === 'GET' && routePath === '/meta') {
        return send(200, { ...deps.meta(), feed: { fetchedAt: deps.announcements.view().fetchedAt, source: deps.announcements.view().source, error: deps.announcements.view().error }, update: deps.update.status() })
      }
      if (method === 'GET' && routePath === '/announcement') {
        // A managed install also stands down the owner's onboarding copy: the
        // pack, not the plugin, speaks for what is new.
        const acknowledged = deps.managedDistribution === true || deps.settings.get().announcementAck === ANNOUNCEMENT_VERSION
        return send(200, { version: ANNOUNCEMENT_VERSION, acknowledged })
      }
      if (method === 'POST' && routePath === '/announcement/ack') {
        deps.settings.update({ announcementAck: String(url.searchParams.get('version') ?? ANNOUNCEMENT_VERSION) })
        deps.settings.flush()
        return send(200, { ok: true })
      }
      if (method === 'GET' && routePath === '/announcements') {
        const view = deps.announcements.view()
        return send(200, { ...view, acked: [...ackedSet(deps)], notifyOs: deps.settings.get().notifyOs === true })
      }
      if (method === 'POST' && routePath === '/announcements/ack') {
        const body = await readJson(req)
        const acked = ackedSet(deps)
        if (body.all === true) {
          // "mark all read": every announcement currently in the feed.
          for (const item of deps.announcements.view().items) acked.add(item.id)
        }
        if (typeof body.id === 'string' && body.id !== '') acked.add(body.id)
        deps.announcements.ack(acked)
        return send(200, { ok: true, view: deps.announcements.view() })
      }
      if (method === 'POST' && routePath === '/announcements/refresh') {
        // Managed installs poll no feed; a manual refresh is a polite no-op
        // rather than a network round the pack never asked for.
        if (deps.managedDistribution !== true) await deps.announcements.refresh()
        return send(200, { ok: true, view: deps.announcements.view() })
      }
      if (method === 'GET' && routePath === '/update/status') {
        return send(200, deps.update.status())
      }
      if (method === 'POST' && routePath === '/update/check') {
        const result = await deps.update.check()
        return send(200, { ...result, status: deps.update.status() })
      }
      if (method === 'POST' && routePath === '/update/apply') {
        const body = await readJson(req)
        const result = await deps.update.apply(body?.version === undefined ? undefined : String(body.version))
        return send(200, { ok: true, ...result })
      }
      if (method === 'POST' && routePath === '/reload') {
        // A managed install does not swap its own bytes; the pack owns them.
        if (deps.managedDistribution === true) return send(409, { error: 'this installation is managed; updates are handled by the pack that installed it' })
        // Answer first, then swap: the response rides an already-accepted
        // socket, but the client should not wait on the reload finishing. The
        // swap closure is `deps.hotReload`, applied inside `apply` — this
        // module-level handler has no access to the fiber's own context.
        send(202, { ok: true, note: 'hot reload started' })
        setTimeout(() => {
          Promise.resolve()
            .then(() => deps.hotReload())
            .catch(error => deps.logger?.warn?.(`our-free-model: hot reload failed (${error?.message ?? error})`))
        }, 50).unref?.()
        return
      }
      if (method === 'POST' && routePath === '/settings') {
        const patch = await readJson(req)
        const current = deps.settings.get()
        const next = sanitizeSettings({ ...current, ...pick(patch, ['enabled', 'exposeRegionModels', 'probeIntervalMinutes', 'defaultMaxTokens', 'announcementAck', 'feedUrl', 'feedPollMinutes', 'notifyOs', 'updateCheckHours', 'autoReloadWatch']) }, current)
        if (patch.forward !== undefined) {
          const forward = { ...(current.forward ?? {}), ...pick(patch.forward, ['enabled', 'host', 'port']) }
          // The listener spends this machine's lane, and a routable bind address
          // would let the whole subnet spend it too. Refused here so the settings
          // page says why, and again in `syncForward` for a hand-edited file.
          if (forward.enabled === true && !isLoopbackHost(forward.host ?? '127.0.0.1')) {
            return send(400, { error: 'the forward listener binds a loopback address only' })
          }
          if (forward.port !== undefined) {
            const port = Number(forward.port)
            forward.port = Number.isFinite(port) && port >= 1 && port <= 65535 ? Math.trunc(port) : (current.forward?.port ?? 0)
          }
          next.forward = forward
        }
        deps.settings.update(next)
        deps.settings.flush()
        await deps.syncForward()
        if (patch.probeIntervalMinutes !== undefined || patch.feedPollMinutes !== undefined) {
          // Poll periods live in fiber effects; the next load picks a change up,
          // so surface that rather than pretending it hot-applied.
          deps.logger.info?.('our-free-model: poll interval change applies on the next load')
        }
        return send(200, { ok: true, settings: publicSettings(deps.settings.get(), deps.forwardInfo()) })
      }
      if (method === 'POST' && routePath === '/refresh') {
        await deps.refreshCatalog({ probe: true })
        return send(200, { ok: true, ...buildSummary(deps) })
      }
      if (method === 'POST' && routePath === '/reprobe') {
        await deps.refreshAvailability()
        return send(200, { ok: true, ...buildSummary(deps) })
      }
      if (method === 'GET' && routePath === '/forward/key') {
        return send(200, { key: deps.settings.get().forwardKey ?? '' })
      }
      if (method === 'POST' && routePath === '/forward/rotate') {
        return send(200, { key: deps.rotateKey() })
      }
      if (method === 'POST' && routePath === '/bench') {
        const body = await readJson(req)
        const result = await deps.testModel(String(body.model ?? ''), body.effort === undefined ? undefined : String(body.effort))
        return send(200, result)
      }
      return send(404, { error: 'not found' })
    } catch (error) {
      const status = Number(error?.statusCode)
      return send(Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500, { error: String(error?.message ?? error) })
    }
  }
}

function ackedSet(deps) {
  const value = deps.settings.get().announcementsAcked
  return new Set(Array.isArray(value) ? value : [])
}

function pick(source, keys) {
  const out = {}
  for (const key of keys) if (source?.[key] !== undefined) out[key] = source[key]
  return out
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return {} }
}

function publicSettings(settings, forwardInfo) {
  return {
    enabled: settings.enabled !== false,
    exposeRegionModels: settings.exposeRegionModels !== false,
    probeIntervalMinutes: settings.probeIntervalMinutes ?? 15,
    defaultMaxTokens: settings.defaultMaxTokens ?? 32768,
    announcementAck: settings.announcementAck ?? '',
    feedUrl: typeof settings.feedUrl === 'string' ? settings.feedUrl : '',
    feedPollMinutes: settings.feedPollMinutes ?? 30,
    notifyOs: settings.notifyOs === true,
    updateCheckHours: settings.updateCheckHours ?? 6,
    autoReloadWatch: settings.autoReloadWatch === true,
    reloadedAt: settings.reloadedAt ?? 0,
    reloadCount: settings.reloadCount ?? 0,
    forward: { ...(settings.forward ?? {}), running: forwardInfo.running, actualPort: forwardInfo.port, error: forwardInfo.error },
  }
}

function buildSummary(deps) {
  const state = deps.state()
  const snapshot = deps.availability.get()
  const forwardInfo = deps.forwardInfo()
  const update = deps.update.status()
  const feedView = deps.announcements.view()
  const defaultMaxTokens = deps.settings.get().defaultMaxTokens
  return {
    catalog: state.catalog.map(entry => ({
      ...entry,
      availability: snapshot.results?.[entry.id]?.state ?? STATE.unknown,
      detail: snapshot.results?.[entry.id]?.detail ?? '',
      probedAt: snapshot.results?.[entry.id]?.at ?? 0,
      ttftMs: snapshot.results?.[entry.id]?.ttftMs,
      latencyMs: snapshot.results?.[entry.id]?.latencyMs,
      // What each rung of the effort menu will really put on the wire for this
      // model, so the page never shows a 32K "output ceiling" beside a call that
      // was cut off at 8K. A model with no effort menu has no ladder to show.
      ...(entry.reasoning === true ? { budgets: budgetLadder(entry, undefined, defaultMaxTokens) } : {}),
      // `null` here is what the picker does not advertise; the roster still lists
      // those models, because "the probe refused it" is the user's only evidence.
      route: (state.membership[ROUTE_MAIN] ?? []).includes(entry.id) ? ROUTE_MAIN
        : (state.membership[ROUTE_REGION] ?? []).includes(entry.id) ? ROUTE_REGION : null,
    })),
    settings: publicSettings(deps.settings.get(), forwardInfo),
    egress: forwardInfo.egress ?? snapshot.egress ?? null,
    probedAt: snapshot.at ?? 0,
    announcementVersion: ANNOUNCEMENT_VERSION,
    version: deps.meta().version,
    distribution: deps.meta().distribution,
    announcements: { unread: feedView.unread, fetchedAt: feedView.fetchedAt },
    update: { available: update.available, latest: update.latest, current: update.current, checkedAt: update.checkedAt, applying: update.applying, managed: update.managed === true },
  }
}

export function buildStats(stats, catalog) {
  const days = stats.days ?? {}
  const series = Object.keys(days).sort().map(day => ({
    day,
    total: days[day].total ?? 0,
    models: Object.entries(days[day].models ?? {}).map(([model, value]) => ({ model, ...value })),
  }))
  const totals = {}
  for (const entry of series) for (const row of entry.models) {
    const previous = totals[row.model] ?? {
      model: row.model, input: 0, output: 0, reasoning: 0, calls: 0, failed: 0,
      ttftMs: 0, ttftSamples: 0, decodeMs: 0, decodeTokens: 0,
    }
    totals[row.model] = {
      ...previous,
      input: previous.input + row.input,
      output: previous.output + row.output,
      reasoning: previous.reasoning + row.reasoning,
      calls: previous.calls + row.calls,
      failed: previous.failed + row.failed,
      ttftMs: previous.ttftMs + (row.ttftMs ?? 0),
      ttftSamples: previous.ttftSamples + (row.ttftSamples ?? 0),
      decodeMs: previous.decodeMs + (row.decodeMs ?? 0),
      decodeTokens: previous.decodeTokens + (row.decodeTokens ?? 0),
    }
  }
  const named = Object.values(totals).map(row => ({
    ...row,
    name: catalog.find(entry => entry.id === row.model)?.name ?? row.model,
    // A rate over too few measurable calls is a rounding error with a unit on it.
    tps: row.decodeMs >= MIN_DECODE_MS ? Math.round(row.decodeTokens / (row.decodeMs / 1000)) : null,
    avgTtftMs: row.ttftSamples > 0 ? Math.round(row.ttftMs / row.ttftSamples) : null,
  }))
  return {
    requests: stats.requests ?? 0,
    days: series,
    models: named,
    samples: (stats.samples ?? []).slice(-200),
    grand: {
      input: named.reduce((sum, row) => sum + row.input, 0),
      output: named.reduce((sum, row) => sum + row.output, 0),
      reasoning: named.reduce((sum, row) => sum + row.reasoning, 0),
      calls: named.reduce((sum, row) => sum + row.calls, 0),
      failed: named.reduce((sum, row) => sum + row.failed, 0),
    },
  }
}
