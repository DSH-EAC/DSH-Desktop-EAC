/**
 * Plugin-owned durable state: user settings, usage history, probe results, and
 * the forward proxy's key ring.
 *
 * Storage is a plain JSON file under the harness home rather than a harness
 * service on purpose. The settings seam changed shape between the two kernel
 * lines this plugin has to run on (the older one exposes a registrable
 * namespace, the newer one projects volatile plugin config), and the storage
 * domain needs composition rows a bare profile may not mount. A file the plugin
 * owns behaves identically on both, and usage history is high-cardinality
 * telemetry that does not belong in a configuration document anyway.
 *
 * Writes are coalesced and land through a temp file + rename, so a crash mid
 * write cannot leave a truncated store.
 *
 * @module src/store.js
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/** Same resolution the harness home-paths helper uses: `$DSH_HOME` else `~/.dsh`. */
export function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return path.join(os.homedir(), '.dsh')
}

export const DATA_DIR_NAME = 'our-free-model'

/** Bumped when the shape or the meaning of a stored field changes. */
export const STATS_VERSION = 2

export class JsonStore {
  /**
   * @param {string} file - absolute path
   * @param {object} initial - value used when the file does not exist yet
   */
  constructor(file, initial) {
    this.file = file
    this.value = initial
    this.dirty = false
    this.timer = undefined
    this.disposed = false
    this.load()
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.value = { ...this.value, ...parsed }
      }
    } catch {
      // Absent is normal; unreadable is not. Keep the damaged file: without this
      // the next scheduled flush renames a fresh default over it and the user's
      // settings — the forward key, the acknowledged announcements — are gone with
      // nothing on disk to recover and nothing in the log to explain.
      try {
        if (fs.existsSync(this.file)) fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`)
      } catch { /* a home we cannot write to is not this file's problem */ }
    }
  }

  get() {
    return this.value
  }

  /** Merge a patch in and schedule the write. Returns the new value. */
  update(patch) {
    if (this.disposed) return this.value
    this.value = { ...this.value, ...patch }
    this.schedule()
    return this.value
  }

  /** Mutate through a callback; used for read-modify-write on nested state. */
  edit(mutate) {
    if (this.disposed) return this.value
    const next = mutate(structuredClone(this.value))
    if (next !== undefined) this.value = next
    this.schedule()
    return this.value
  }

  schedule(delayMs = 800) {
    if (this.disposed) return
    this.dirty = true
    if (this.timer !== undefined) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.flush()
    }, delayMs)
    // Telemetry must never hold the process open.
    this.timer.unref?.()
  }

  flush() {
    if (!this.dirty || this.disposed) return
    this.dirty = false
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const temp = `${this.file}.${process.pid}.tmp`
      fs.writeFileSync(temp, JSON.stringify(this.value, undefined, 2), { mode: 0o600 })
      fs.renameSync(temp, this.file)
    } catch {
      // fail-soft: the next mutation retries, and nothing downstream depends on it
    }
  }

  dispose() {
    if (this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined }
    // Persist what this generation changed, THEN lock the store: late callbacks
    // from a hot-reloaded-away generation (an in-flight feed poll, a pending
    // update check) must never write over the successor generation's state.
    // The disposal order makes this safe — the successor's stores are created
    // only after the previous generation's disposers have run.
    this.flush()
    this.disposed = true
    this.dirty = false
  }
}

/** `YYYY-MM-DD` in the machine's own calendar, which is what a heatmap needs. */
export function dayKey(at = Date.now()) {
  const date = new Date(at)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const SETTINGS_INITIAL = {
  version: 1,
  /** Master switch: when off the routes stay registered but serve nothing. */
  enabled: true,
  /** Show region-limited models in the picker as soon as they answer. */
  exposeRegionModels: true,
  /** Minutes between background availability re-probes. */
  probeIntervalMinutes: 15,
  /** Serve the OpenAI-compatible forward listener for other local harnesses. */
  forward: { enabled: false, host: '127.0.0.1', port: 18899 },
  /** Cap a turn's output so a slow lane cannot run away. */
  defaultMaxTokens: 32768,
  /** Acknowledged announcement copy version. */
  announcementAck: '',
  /** Last full catalog refresh timestamp. */
  catalogSyncedAt: 0,
  /** Owner override for the announcement/update feed location. `{repo}` expands
   *  to the plugin repository slug; empty means the shipped GitHub sources. */
  feedUrl: '',
  /** Minutes between announcement-feed polls; floored at 5. */
  feedPollMinutes: 30,
  /** Raise OS-level notifications for new announcements and updates (the
   *  browser asks for permission on the user's click). */
  notifyOs: false,
  /** Announcement ids the user has acknowledged. */
  announcementsAcked: [],
  /** Hours between automatic update checks; 0 disables them entirely. */
  updateCheckHours: 6,
  /** Version whose update availability has already been pushed. */
  updateNotifiedFor: '',
  /** Watch the installed package and hot-reload on change (development aid). */
  autoReloadWatch: false,
  /** Who owns the installed bytes: `self` updates in-app from the repository;
   *  `managed` — written by a distribution pack's installer, or passed as the
   *  bundle config `distribution` — stands the self-updater, the announcement
   *  feed and the hot reload down. The settings API never accepts this field,
   *  so an install that shipped managed stays managed. */
  distribution: 'self',
  /** When the running code was hot-reloaded into place, and how many times. */
  reloadedAt: 0,
  reloadCount: 0,
  /** Version installed by the in-app upgrader, for the settings page. */
  installedVersion: '',
}

export const STATS_INITIAL = { version: STATS_VERSION, days: {}, models: {}, requests: 0, samples: [] }

/**
 * Two bounds on what counts as a measurable decode window.
 *
 * A real recorded sample published 63 000 tok/s: 63 output tokens inside a 1 ms
 * window that opened after a 2 977 ms first-token wait. `windowTokens` in
 * src/stream.js removes the unstreamed-reasoning inflation, and these two catch
 * the rest — a window too short to time at all, and one so fast that the frames
 * must have been coalesced rather than decoded. Measured sustained output on
 * this lane runs at tens of tok/s, so both bounds sit far outside anything
 * genuine, and a call tripping either is not a slow measurement: it is no
 * measurement, and it is dropped instead of averaged in.
 */
export const MIN_DECODE_MS = 250
export const MAX_CREDIBLE_TPS = 250

/**
 * Classify one completed call's decode window.
 * @param {number} decodeMs - first observed frame to finish
 * @param {number} tokens - output tokens attributable to that window
 * @param {boolean} ok
 * @returns {{measurable: boolean, decodeMs: number, tps: number|null}}
 */
export function decodeWindow(decodeMs, tokens, ok) {
  const ms = Number.isFinite(decodeMs) && decodeMs > 0 ? decodeMs : 0
  const count = Number.isFinite(tokens) ? tokens : 0
  if (ok !== true || count <= 0 || ms < MIN_DECODE_MS) return { measurable: false, decodeMs: 0, tps: null }
  const tps = (count / ms) * 1000
  if (!Number.isFinite(tps) || tps > MAX_CREDIBLE_TPS) return { measurable: false, decodeMs: 0, tps: null }
  return { measurable: true, decodeMs: ms, tps: Math.round(tps) }
}

/**
 * Accumulate one completed call into the store's day/model buckets and keep a
 * bounded ring of per-call latency samples for the speed charts.
 */
export function recordUsage(stats, record) {
  return stats.edit(state => {
    const day = dayKey(record.at)
    const days = { ...(state.days ?? {}) }
    const bucket = days[day] ?? { total: 0, models: {} }
    const perModel = { ...(bucket.models ?? {}) }
    const previous = perModel[record.model] ?? {
      input: 0, output: 0, reasoning: 0, cacheRead: 0, calls: 0, failed: 0,
      ttftMs: 0, ttftSamples: 0, decodeMs: 0, decodeTokens: 0,
    }
    const measured = decodeWindow(record.decodeMs, record.decodeTokens, record.ok)
    const ttftMs = Number.isFinite(record.ttftMs) && record.ok === true ? record.ttftMs : undefined
    perModel[record.model] = {
      input: previous.input + record.input,
      output: previous.output + record.output,
      reasoning: previous.reasoning + record.reasoning,
      cacheRead: previous.cacheRead + record.cacheRead,
      calls: previous.calls + 1,
      failed: previous.failed + (record.ok ? 0 : 1),
      ttftMs: previous.ttftMs + (ttftMs ?? 0),
      ttftSamples: previous.ttftSamples + (ttftMs === undefined ? 0 : 1),
      decodeMs: previous.decodeMs + measured.decodeMs,
      decodeTokens: previous.decodeTokens + (measured.measurable ? record.decodeTokens : 0),
    }
    days[day] = { ...bucket, models: perModel, total: bucket.total + record.input + record.output }
    const models = { ...(state.models ?? {}) }
    const lifetime = models[record.model] ?? { input: 0, output: 0, calls: 0 }
    models[record.model] = {
      input: lifetime.input + record.input,
      output: lifetime.output + record.output,
      calls: lifetime.calls + 1,
    }
    const samples = [...(state.samples ?? []), {
      at: record.at, model: record.model, ok: record.ok === true,
      input: record.input, output: record.output,
      ttftMs: ttftMs === undefined ? null : Math.round(ttftMs),
      tps: measured.tps,
      decodeMs: measured.decodeMs,
      decodeTokens: measured.measurable ? record.decodeTokens : 0,
      effort: record.effort ?? '',
      origin: record.origin ?? 'chat',
    }].slice(-400)
    return { ...state, days, models, requests: (state.requests ?? 0) + 1, samples }
  })
}

/**
 * v1 added every decode window it was handed to the same accumulator, so its
 * speed totals are garbage rather than history and cannot be un-polluted row by
 * row. Token totals and the heatmap survive; the derived speed totals reset and
 * repopulate from fresh calls. Per-sample first-token latency is real for
 * completed calls, so those samples keep it — v1 stored a failed call's whole
 * latency there, which is not a time-to-first-token.
 */
export function migrateStats(value) {
  if (value?.version === STATS_VERSION) return value
  const days = {}
  for (const [day, bucket] of Object.entries(value?.days ?? {})) {
    const models = {}
    for (const [model, row] of Object.entries(bucket.models ?? {})) {
      models[model] = { ...row, decodeMs: 0, decodeTokens: 0, ttftMs: 0, ttftSamples: 0 }
    }
    days[day] = { ...bucket, models }
  }
  return {
    ...value,
    version: STATS_VERSION,
    days,
    samples: (value?.samples ?? []).map(sample => ({
      ...sample,
      tps: null,
      decodeMs: 0,
      decodeTokens: 0,
      ttftMs: sample.ok === true && Number.isFinite(sample.ttftMs) ? sample.ttftMs : null,
    })),
  }
}

/** Trim day buckets older than `keepDays`, keeping the payload chart-sized. */
export function pruneDays(state, keepDays = 120) {
  const keys = Object.keys(state.days ?? {}).sort()
  if (keys.length <= keepDays) return state
  const drop = new Set(keys.slice(0, keys.length - keepDays))
  const days = {}
  for (const key of keys) if (!drop.has(key)) days[key] = state.days[key]
  return { ...state, days }
}
