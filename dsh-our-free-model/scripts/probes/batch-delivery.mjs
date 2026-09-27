/**
 * Is the short decode window this plugin sometimes measures caused by the
 * gateway, or by our own reader?
 *
 * A recorded sample of 63 output tokens inside a 1 ms decode window can only
 * mean one of two things: the completion arrived in a single network read, or
 * `readSse` swallowed it and released it late. This timestamps every
 * `reader.read()` straight off `fetch` — before any of the plugin's parsing — so
 * the two are told apart. A batched stream shows one large read carrying every
 * frame; a streaming one shows many small reads spread over seconds.
 *
 * Run: node scripts/probes/batch-delivery.mjs   (one call per model, live)
 */

import { UPSTREAM_BASE, applyFingerprint, endpointFor, gatewayHeaders, mintRequestId, mintSessionId, wireFor } from '../../src/upstream.js'

const MODELS = ['space-bunny-free', 'mimo-v2.6-flash-free']
const PROMPT = 'List 40 short invented appliance names, one per line, no commentary.'

for (const model of MODELS) {
  const body = {
    model,
    messages: [{ role: 'user', content: PROMPT }],
    stream: true,
    max_tokens: 900,
    temperature: 0.8,
  }
  applyFingerprint(body, wireFor(model) === 'responses')
  const headers = gatewayHeaders({ session: mintSessionId(), requestId: mintRequestId(), stream: true })
  const started = Date.now()
  const reads = []

  const response = await fetch(`${UPSTREAM_BASE}${endpointFor(model)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    redirect: 'error',
  })
  if (!response.ok) {
    console.log(`${model}: HTTP ${response.status} ${(await response.text()).slice(0, 120)}`)
    continue
  }
  const reader = response.body.getReader()
  let done = false
  while (!done) {
    const result = await reader.read()
    done = result.done
    if (result.value !== undefined) reads.push({ at: Date.now() - started, bytes: result.value.byteLength })
  }

  const first = reads[0]?.at ?? 0
  const spread = (reads[reads.length - 1]?.at ?? 0) - first
  console.log(`\n${model}  content-type=${response.headers.get('content-type')}`)
  console.log(`  ${reads.length} network reads, ${reads.reduce((sum, r) => sum + r.bytes, 0)} bytes, spread ${spread} ms`)
  console.log(`  arrival offsets (ms): ${reads.slice(0, 14).map(r => r.at).join(' ')}${reads.length > 14 ? ' …' : ''}`)
  const total = reads.reduce((sum, r) => sum + r.bytes, 0)
  const biggest = reads.reduce((best, r) => Math.max(best, r.bytes), 0)
  console.log(`  largest single read ${biggest}/${total} bytes — ${biggest >= total * 0.9 ? 'ONE READ CARRIED EVERYTHING: batch delivery' : 'deltas arrived over time: real streaming'}`)
}
