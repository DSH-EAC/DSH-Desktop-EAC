/**
 * Which tokens actually arrive inside the window the plugin times?
 *
 * A recorded call reported 63 output tokens decoded in 1 ms while its
 * first-token latency was 2 977 ms. The gateway is not batching — a raw-read
 * probe (`batch-delivery.mjs`) shows 64 reads spread over 5.6 s for this same
 * model — so the only remaining explanation is that the numerator and the
 * denominator describe different intervals. This prints, per frame, when it
 * arrived and what it carried, next to the usage totals the provider finally
 * reported, so the mismatch can be read off one run instead of argued about.
 *
 * Run: node scripts/probes/decode-window.mjs   (one call per model, live)
 */

import { FreeModelAdapter, ROUTE_MAIN } from '../../src/adapter.js'
import { buildCatalog } from '../../src/catalog.js'

const MODELS = ['space-bunny-free', 'mimo-v2.6-flash-free']
const PROMPT = 'List 30 short invented appliance names, one per line, no commentary.'

const entries = buildCatalog(MODELS)

const adapter = new FreeModelAdapter({
  state: () => ({ catalog: entries, membership: { [ROUTE_MAIN]: entries.map(entry => entry.id) }, settings: { enabled: true, defaultMaxTokens: 4096 }, attributionUserAgent: 'probe' }),
  recordUsage: record => { recorded = record },
  warn: () => {},
})

let recorded = null

for (const id of MODELS) {
  const entry = entries.find(candidate => candidate.id === id)
  recorded = null
  const started = Date.now()
  const frames = []
  for await (const chunk of adapter.stream({
    provider: ROUTE_MAIN,
    model: id,
    messages: [{ role: 'user', content: PROMPT }],
    reasoningEffort: 'balanced',
    sessionId: `probe:decode-window:${id}`,
  }, entry, adapter.deps.state())) {
    if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta' || chunk.type === 'tool-call-delta') {
      frames.push({ at: Date.now() - started, kind: chunk.type === 'text-delta' ? 'text' : chunk.type === 'reasoning-delta' ? 'reason' : 'tool', chars: (chunk.text ?? chunk.argumentsDelta ?? '').length })
    }
  }

  const first = kind => frames.find(frame => frame.kind === kind)?.at
  const last = kind => frames.filter(frame => frame.kind === kind).at(-1)?.at
  const chars = kind => frames.filter(frame => frame.kind === kind).reduce((sum, frame) => sum + frame.chars, 0)
  console.log(`\n${id}`)
  console.log(`  frames: text ${frames.filter(f => f.kind === 'text').length} (${chars('text')} chars), reasoning ${frames.filter(f => f.kind === 'reason').length} (${chars('reason')} chars)`)
  console.log(`  first text ${first('text') ?? '—'} ms, last text ${last('text') ?? '—'} ms, first reasoning ${first('reason') ?? 'never'} ms`)
  console.log(`  recorded  ttftMs=${recorded?.ttftMs}  decodeMs=${recorded?.decodeMs}  output=${recorded?.output}  reasoning=${recorded?.reasoning}  decodeTokens=${recorded?.decodeTokens}`)
  console.log(`  rate over the recorded window, all output tokens: ${recorded?.decodeMs ? Math.round((recorded.output / recorded.decodeMs) * 1000) : 'n/a'} tok/s`)
  console.log(`  rate the plugin now reports: ${recorded?.decodeTokens && recorded.decodeMs ? Math.round((recorded.decodeTokens / recorded.decodeMs) * 1000) : 'not measurable'} tok/s`)
}
