/**
 * Proves the speed panel cannot be poisoned by tokens it never saw.
 *
 * Measured live (scripts/probes/decode-window.mjs): one call reported 422 output
 * tokens of which 291 were reasoning, and not a single reasoning frame arrived —
 * those tokens were produced during the 5.2 s before the first observed frame,
 * so dividing them by the 1.2 s the answer took published 349 tok/s for a 108
 * tok/s answer. A worse recorded sample divided 63 tokens by a 1 ms window and
 * published 63 000 tok/s; averaged over 26 calls that one point dragged the
 * whole card to 2 493 while the lane was doing ~40. The gateway is not at fault:
 * a raw-read probe (batch-delivery.mjs) shows 64 frames spread over 5.6 s.
 *
 * Run: node scripts/speed-stat-test.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { decodeWindow, migrateStats, recordUsage, JsonStore, STATS_INITIAL } = await import('../src/store.js')
const { windowTokens } = await import('../src/stream.js')
const { buildStats } = await import('../index.js')

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`)
}

/** The smallest thing recordUsage needs: a get/edit pair over a plain object. */
const store = value => ({
  value,
  get() { return this.value },
  edit(mutate) { this.value = mutate(structuredClone(this.value)); return this.value },
})

check('unstreamed reasoning leaves the numerator', windowTokens({ outputTokens: 422, reasoningTokens: 291 }, false), 131)
check('streamed reasoning stays in it', windowTokens({ outputTokens: 135, reasoningTokens: 23 }, true), 135)
check('a model that reports no reasoning is unaffected', windowTokens({ outputTokens: 50 }, false), 50)
check('no usage is no tokens', windowTokens(undefined, false), 0)

check('131 tokens in 1.2 s is a real 108 tok/s', decodeWindow(1209, 131, true), { measurable: true, decodeMs: 1209, tps: 108 })
check('a 1 ms window is not a measurement', decodeWindow(1, 3, true), { measurable: false, decodeMs: 0, tps: null })
check('561 tok/s is coalesced frames, not speed', decodeWindow(358, 201, true), { measurable: false, decodeMs: 0, tps: null })
check('a failed call has no rate', decodeWindow(0, 0, false), { measurable: false, decodeMs: 0, tps: null })
check('no numerator, no rate', decodeWindow(4000, 0, true), { measurable: false, decodeMs: 0, tps: null })

const call = over => ({ at: 1, model: 'mimo-v2.6-flash-free', input: 100, output: 100, reasoning: 0, cacheRead: 0, effort: 'balanced', ...over })
const stats = store(structuredClone(STATS_INITIAL))
for (const record of [
  call({ ok: true, output: 146, decodeTokens: 146, ttftMs: 1649, decodeMs: 2704 }),
  call({ ok: true, output: 51, decodeTokens: 51, ttftMs: 4431, decodeMs: 1750 }),
  call({ ok: true, output: 63, decodeTokens: 3, ttftMs: 2977, decodeMs: 1 }),
  call({ ok: false, output: 0, decodeTokens: 0, ttftMs: 10732, decodeMs: 0 }),
]) recordUsage(stats, record)

const row = Object.values(stats.get().days)[0].models['mimo-v2.6-flash-free']
check('unmeasurable windows add to neither sum', [row.decodeMs, row.decodeTokens], [4454, 197])
check('the failed call is not a first-frame sample', [row.ttftMs, row.ttftSamples], [9057, 3])

const named = buildStats(stats.get(), [{ id: 'mimo-v2.6-flash-free', name: 'Mimo' }]).models[0]
check('the reported rate is token-weighted', named.tps, 44)
check('an unweighted mean of the same calls would read', Math.round((54 + 29 + 3000) / 3), 1028)
check('mean first frame covers successes only', named.avgTtftMs, 3019)
check('every call still counts', [named.calls, named.failed], [4, 1])

const silent = store(structuredClone(STATS_INITIAL))
recordUsage(silent, call({ model: 'space-bunny-free', ok: true, output: 63, decodeTokens: 3, ttftMs: 2977, decodeMs: 1 }))
check('a model nobody timed shows no rate, not zero', buildStats(silent.get(), []).models[0].tps, null)

const legacy = {
  version: 1,
  requests: 3,
  days: { '2026-09-24': { total: 500, models: { 'space-bunny-free': {
    input: 100, output: 65, reasoning: 0, cacheRead: 0, calls: 2, failed: 1,
    ttftMs: 13709, decodeMs: 2, decodeTokens: 65,
  } } } },
  models: {},
  samples: [
    { at: 1, model: 'space-bunny-free', ok: true, input: 100, output: 63, ttftMs: 2977, tps: 63000 },
    { at: 2, model: 'space-bunny-free', ok: false, input: 0, output: 0, ttftMs: 10732, tps: 0 },
  ],
}
const migrated = migrateStats(legacy)
const legacyRow = migrated.days['2026-09-24'].models['space-bunny-free']
check('migration clears the poisoned speed totals', [legacyRow.decodeMs, legacyRow.decodeTokens, legacyRow.ttftMs, legacyRow.ttftSamples], [0, 0, 0, 0])
check('migration keeps what was really measured', [migrated.samples[0].ttftMs, migrated.samples[0].tps, migrated.samples[0].decodeMs], [2977, null, 0])
check('a failure is not promoted to a latency sample', [migrated.samples[1].ttftMs, migrated.samples[1].tps], [null, null])
check('token totals survive', [legacyRow.input, legacyRow.output, migrated.requests], [100, 65, 3])
check('migration is idempotent', migrateStats(migrated), migrated)

// ── the file itself ──────────────────────────────────────────────────────────
// A half-written store file is the one failure the plugin used to answer by
// quietly starting over: `load()` swallowed the parse error, kept the defaults,
// and the first scheduled flush renamed them over the top of whatever was there —
// the forward key and the acknowledged announcements gone with nothing on disk to
// recover and nothing in the log to explain it.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-store-'))
const damaged = path.join(scratch, 'settings.json')
const original = '{"forwardKey":"ofm-was-here","probeIntervalMinutes":'
fs.writeFileSync(damaged, original)
const store2 = new JsonStore(damaged, { forwardKey: '', probeIntervalMinutes: 15 })
check('a file that will not parse falls back to the defaults', [store2.get().forwardKey, store2.get().probeIntervalMinutes], ['', 15])
store2.update({ forwardKey: 'ofm-new' })
store2.flush()
check('the damaged bytes survive the write that replaces them',
  fs.readdirSync(scratch).some(name => name.startsWith('settings.json.corrupt-')
    && fs.readFileSync(path.join(scratch, name), 'utf8') === original), true)
check('and the replacement is readable by the next load', new JsonStore(damaged, { forwardKey: '' }).get().forwardKey, 'ofm-new')
fs.rmSync(scratch, { recursive: true, force: true })

console.log(failures === 0 ? '\nspeed-stat: the panel can no longer be averaged into nonsense' : `\nspeed-stat: ${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
