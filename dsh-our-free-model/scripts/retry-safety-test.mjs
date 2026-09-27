/**
 * The failure vocabulary, end to end: what each real shape costs the caller, and
 * whether the harness is allowed to retry it.
 *
 * Two things are checked per case. The first is the one the durable session log
 * enforces: the harness writes `finish.reason.failure` straight into an
 * `llm/retry` event, and that append rejects Error instances, non-finite numbers
 * and explicit `undefined` fields — a rejected append aborts the whole turn
 * instead of letting the harness back off, so a malformed failure is strictly
 * worse than a sparse one.
 *
 * The second is the code itself, and the retry policy read against it. This suite
 * used to prove neither: it called the adapter with `model:
 * "our-free-model/test-model-free"`, and `baseModelId` strips a *label*, not a
 * route, so every case — including "transport failure" and "aborted signal" —
 * returned the up-front "does not serve" error without a request leaving the
 * process. Four labelled cases, one code, and nothing said about retryability:
 * which is the property that decides whether a turn the user cancelled gets sent
 * to the gateway again.
 *
 * Run: node scripts/retry-safety-test.mjs
 */
import { chatFrames, stubUpstream } from './lib/fake-kernel.mjs'

const stub = await stubUpstream({
  answer: model => {
    if (model === 'socket-model-free') return { socket: true }
    if (model === 'region-model-free') {
      // A refusal that arrives *inside* an open stream: the header said 200, so
      // nothing but the frame itself can say what happened.
      return { pieces: ['data: {"type":"error","error":{"type":"RegionError","message":"This model is not available in your country."}}\n\n'] }
    }
    if (model === 'quota-model-free') {
      return { pieces: ['data: {"type":"error","error":{"type":"FreeUsageLimitError","message":"Free usage limit reached. Try again later."}}\n\n'] }
    }
    if (model === 'slow-model-free') {
      // Content, and then nothing: the turn is open, text has been handed to the
      // caller, and this is where a cancellation has to land.
      return { pieces: ['data: {"choices":[{"index":0,"delta":{"content":"partial"}}]}\n\n'], holdMs: 700 }
    }
    return { body: chatFrames('fine') }
  },
})
// Set before the adapter module reads it: UPSTREAM_BASE is captured at import time.
process.env.OUR_FREE_MODEL_BASE = stub.base
const { FreeModelAdapter, ROUTE_MAIN, ROUTE_REGION } = await import('../src/adapter.js')
const { CODE } = await import('../src/http.js')

/**
 * Mirrors `snapshotJsonValue` from @deepseek-ai/dsh-util-values: a value survives
 * only if every leaf is a JSON primitive, a plain object or an array.
 */
function isLosslessJson(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0)
  if (Array.isArray(value)) return value.every(item => isLosslessJson(item, seen))
  if (typeof value !== 'object' || value === undefined) return false
  if (seen.has(value)) return false
  seen.add(value)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.values(value).every(item => isLosslessJson(item, seen))
}

const MODELS = ['test-model-free', 'socket-model-free', 'region-model-free', 'quota-model-free', 'slow-model-free']
const CATALOG = MODELS.map(id => ({
  id, name: `Test ${id}`, availability: 'available',
  vision: false, reasoning: true, contextWindow: 128000, maxOutput: 8192,
}))

const STATE = () => ({
  catalog: CATALOG,
  membership: { [ROUTE_MAIN]: MODELS, [ROUTE_REGION]: [] },
  settings: { enabled: true, defaultMaxTokens: 4096 },
  attributionUserAgent: 'test/1.0',
})

/** Run the real adapter and return the failure object it yields, if any. */
async function failureFor(model, { state = STATE, signal } = {}) {
  let regionSignal
  const adapter = new FreeModelAdapter({
    state,
    recordUsage: () => {},
    warn: () => {},
    onRegionBlocked: id => { regionSignal = id },
  })
  let failure = null
  let kind = null
  let streamed = 0
  for await (const chunk of adapter.stream({
    provider: ROUTE_MAIN,
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    ...signal === undefined ? {} : { signal },
  })) {
    if (chunk.type === 'text-delta') streamed++
    if (chunk.type === 'finish') {
      kind = chunk.reason.kind
      failure = chunk.reason.failure ?? null
    }
  }
  return { failure, kind, streamed, regionSignal }
}

const policy = new FreeModelAdapter({ state: STATE, recordUsage: () => {}, warn: () => {} }).providerRetryPolicy()

/**
 * `signal.abort(new Error(...))` rejects fetch with *that* error, whose `name` is
 * `Error` — so a check on the name alone filed a cancelled turn under
 * `TRANSPORT`, which is in `retryableCodes`. The reason the harness cancels with
 * is not part of the contract; the fact that it cancelled is.
 */
const customReason = new AbortController()
setTimeout(() => customReason.abort(new Error('user cancelled')), 60).unref?.()

const cases = [
  // name, model, fixture, finish kind, code, retryable?, region re-probe?, text delivered?
  ['transport failure', 'socket-model-free', {}, 'error', CODE.transport, true, undefined, false],
  ['aborted before the request', 'test-model-free', { signal: AbortSignal.abort() }, 'aborted', CODE.aborted, false, undefined, false],
  ['aborted mid-stream, with the caller’s own reason', 'slow-model-free', { signal: customReason.signal }, 'aborted', CODE.aborted, false, undefined, true],
  ['model not served on this egress', 'no-such-model-free', {}, 'error', CODE.server, true, undefined, false],
  ['plugin switched off mid-call', 'test-model-free', { state: () => ({ ...STATE(), settings: { ...STATE().settings, enabled: false } }) }, 'error', 'CONFIG_DISABLED', false, undefined, false],
  ['a geography refusal inside the stream', 'region-model-free', {}, 'error', CODE.region, false, 'region-model-free', false],
  ['the free usage limit inside the stream', 'quota-model-free', {}, 'error', CODE.quota, true, undefined, false],
]

let failed = 0
for (const [name, model, fixture, wantKind, wantCode, wantRetryable, wantRegionFor, wantStreamed] of cases) {
  let outcome
  try {
    outcome = await failureFor(model, fixture)
  } catch (error) {
    console.log(`FAIL  ${name}: stream threw instead of yielding a failure — ${error?.message ?? error}`)
    failed++
    continue
  }
  const { failure, kind, regionSignal, streamed } = outcome
  if (failure === null) {
    console.log(`FAIL  ${name}: no failure on the finish (kind ${kind ?? 'none'})`)
    failed++
    continue
  }
  const undefinedFields = Object.keys(failure).filter(key => failure[key] === undefined)
  const shaped = typeof failure.message === 'string' && failure.message.length > 0
    && typeof failure.code === 'string' && failure.code.length > 0
  const code = failure.code
  const retryable = policy.retryableCodes.includes(code)
  const problems = []
  if (!isLosslessJson(failure)) problems.push('not durable-log safe')
  if (!shaped) problems.push('malformed')
  if (undefinedFields.length > 0) problems.push(`undefined fields [${undefinedFields}]`)
  if (kind !== wantKind) problems.push(`finish kind ${kind}, want ${wantKind}`)
  if (code !== wantCode) problems.push(`code ${code}, want ${wantCode}`)
  if (retryable !== wantRetryable) problems.push(`retryable=${retryable}, want ${wantRetryable}`)
  if (regionSignal !== wantRegionFor) problems.push(`region re-probe ${regionSignal ?? 'did not fire'}, want ${wantRegionFor ?? 'not to fire'}`)
  if ((streamed > 0) !== wantStreamed) problems.push(`text delivered ${streamed}, want ${wantStreamed ? 'some' : 'none'}`)
  if (problems.length === 0) console.log(`ok    ${name}: ${code}${retryable ? ' (retryable)' : ' (never retried)'}`)
  else {
    console.log(`FAIL  ${name}: ${problems.join('; ')} — ${JSON.stringify(failure)}`)
    failed++
  }
}

// The provider policy is consumed verbatim by the kernel's backoff scheduler,
// which reads these fields off the top level. A nested `backoff` makes the
// scheduled delay NaN, and the durable session log rejects NaN outright.
const exponential = Math.min(policy.initialDelayMs * 2 ** 0, policy.maxDelayMs)
const jitter = 1 - policy.jitterRatio + 2 * policy.jitterRatio * 0.5
const firstDelay = Math.min(exponential * jitter, policy.maxDelayMs)
const policyShapeOk = isLosslessJson({ ...policy, retryableCodes: [...policy.retryableCodes] })
  && Number.isFinite(firstDelay) && firstDelay > 0
console.log(`${policyShapeOk ? 'ok   ' : 'FAIL '} retry policy schedules a finite delay: firstDelay=${Number.isFinite(firstDelay) ? Math.round(firstDelay) : 'NaN'}ms`)

// `ABORTED` is absent from the retryable list by decision, and nothing else in
// the repository would say so if it were added back: the code is correct at the
// transport layer on its own, and the policy that consumes it lives 200 lines
// away in another module.
const abortedNeverRetried = !policy.retryableCodes.includes(CODE.aborted)
  && !policy.retryableCodes.includes('CONFIG_DISABLED')
console.log(`${abortedNeverRetried ? 'ok   ' : 'FAIL '} a cancelled turn is not in the retryable set: [${policy.retryableCodes}]`)

// The same rule covers the usage event the harness appends after a turn, and the
// OpenAI `usage` object has no required details block: reading `cached_tokens`
// off an absent one made `inputTokens` NaN on every call from a gateway that
// omits the optional field.
const { mapUsage } = await import('../src/stream.js')
const bare = mapUsage({ prompt_tokens: 11, completion_tokens: 7 })
const usageOk = isLosslessJson(bare) && bare?.inputTokens === 11 && bare?.outputTokens === 7
  && bare.totalTokens === 18 && !('cacheReadTokens' in bare)
console.log(`${usageOk ? 'ok   ' : 'FAIL '} a usage object with no details block stays finite: ${JSON.stringify(bare)}`)

const cached = mapUsage({ prompt_tokens: 20, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 12 } })
const cachedOk = cached.inputTokens === 8 && cached.cacheReadTokens === 12 && cached.totalTokens === 25
console.log(`${cachedOk ? 'ok   ' : 'FAIL '} a cache hit is taken out of the disjoint input count: ${JSON.stringify(cached)}`)

// The held connection from the mid-stream abort is still open. Windows' libuv
// asserts if the process tears down a handle that is mid-close, so let the
// scripted answer finish and the sockets retire before exiting.
await new Promise(resolve => setTimeout(resolve, 900))
await stub.close()

const ok = failed === 0 && policyShapeOk && usageOk && cachedOk && abortedNeverRetried
console.log(ok
  ? `\nretry-safety: all ${cases.length} failure shapes are classified, retried correctly, and durable-log safe`
  : `\nretry-safety: ${failed + (policyShapeOk ? 0 : 1) + (usageOk ? 0 : 1) + (cachedOk ? 0 : 1) + (abortedNeverRetried ? 0 : 1)} failure(s)`)
process.exit(ok ? 0 : 1)
