/**
 * The provider adapter.
 *
 * It satisfies the harness adapter contract structurally — `registerAdapter`
 * validates by calling the methods, not by an `instanceof` test — which is what
 * lets this plugin mount on more than one kernel line without importing a
 * version-pinned adapter base class.
 *
 * Two routes are published from one adapter instance, because the harness groups
 * the model picker strictly by provider route and offers no other grouping
 * field: `our-free-model` carries what this egress can use right now, and
 * `our-free-model-region` carries what the gateway refuses on this egress. A
 * group with no models is dropped from the picker by the client, so a user whose
 * VPN unlocks the region-gated models sees one group, and a user without sees
 * the second group labelled as such.
 *
 * @module src/adapter.js
 */

import { applyFingerprint, baseModelId, endpointFor, mintRequestId, sessionForConversation, wireFor } from './upstream.js'
import { toChatMessages, toClaudeMessages, toResponseInput, toToolDefs, repairToolPairing } from './messages.js'
import { CODE, UpstreamError, postStreamed } from './http.js'
import { finishReason, readStream, windowTokens } from './stream.js'
import { DEFAULT_LEVEL, budgetFor, effortsFor, resolveLevel } from './effort.js'
import { createChannel } from './channel.js'

export const ROUTE_MAIN = 'our-free-model'
export const ROUTE_REGION = 'our-free-model-region'

/** Group headings — the only strings the picker shows as a section title. */
export const ROUTE_LABELS = {
  [ROUTE_MAIN]: 'Our Free Model',
  [ROUTE_REGION]: 'Our Free Model · region-limited',
}

const STYLE_FOR_WIRE = { chat: 'chat', responses: 'flat', messages: 'claude' }

export class FreeModelAdapter {
  /**
   * @param {object} dependencies
   * @param {() => {catalog: Array<object>, membership: Record<string, string[]>, settings: object, attributionUserAgent: string}} dependencies.state
   * @param {(ref: object) => string | undefined} [dependencies.resolveImage]
   * @param {(record: object) => void} dependencies.recordUsage
   * @param {(message: string) => void} [dependencies.warn]
   */
  constructor(dependencies) {
    this.deps = dependencies
  }

  providerInfo(provider) {
    return { id: provider, name: ROUTE_LABELS[provider] ?? provider }
  }

  /**
   * A fully resolved policy, not a configuration fragment.
   *
   * Both the 0.1.5 and 0.1.7 kernels store this object verbatim instead of
   * running it through their policy resolver, and the backoff scheduler reads the
   * delay fields off the top level. Reporting them nested under `backoff` makes
   * every scheduled delay `NaN`, which the durable session log then rejects —
   * turning a recoverable transient failure into an aborted turn.
   */
  providerRetryPolicy() {
    return Object.freeze({
      mode: 'normal',
      maxRetries: 2,
      // A regional refusal is a property of the egress, not a transient fault;
      // retrying it only spends quota. It is deliberately absent here.
      retryableCodes: Object.freeze(['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT']),
      initialDelayMs: 700,
      maxDelayMs: 8000,
      jitterRatio: 0.2,
    })
  }

  /** Models this route advertises right now. */
  async listModels(provider) {
    const state = this.deps.state()
    const ids = new Set(state.membership[provider] ?? [])
    return state.catalog
      .filter(entry => ids.has(entry.id))
      .map(entry => ({
        provider,
        id: entry.id,
        name: entry.name,
        description: describe(entry, state.settings),
        inputModalities: entry.vision ? ['text', 'image'] : ['text'],
      }))
  }

  async resolveModel(provider, model) {
    const state = this.deps.state()
    const entry = state.catalog.find(candidate => candidate.id === baseModelId(model))
    if (entry === undefined) {
      return {
        provider,
        id: baseModelId(model),
        name: baseModelId(model),
        context: { contextWindow: 131072 },
        defaultMaxTokens: 8192,
      }
    }
    const ceiling = Math.min(entry.maxOutput, state.settings.defaultMaxTokens ?? 32768)
    const efforts = effortsFor(entry, undefined, state.settings.defaultMaxTokens)
    return {
      provider,
      id: entry.id,
      name: entry.name,
      inputModalities: entry.vision ? ['text', 'image'] : ['text'],
      context: { contextWindow: entry.contextWindow },
      defaultMaxTokens: ceiling,
      ...efforts === undefined ? {} : { reasoning: { efforts, defaultEffort: DEFAULT_LEVEL } },
    }
  }

  /**
   * Bind model metadata and the dispatch closure to one state snapshot, so a
   * catalog refresh arriving mid-turn cannot mix one generation's capacities
   * with another's endpoint table.
   */
  async prepareCall(provider, model) {
    const snapshot = this.deps.state()
    const entry = snapshot.catalog.find(candidate => candidate.id === baseModelId(model)) ?? null
    return {
      model: await this.resolveModel(provider, model),
      stream: options => this.stream(options, entry, snapshot),
    }
  }

  /**
   * @param {object} options - GenerateOptions
   * @param {object|null} pinned - catalog row frozen by `prepareCall`, if any
   * @param {object} [snapshot] - state generation frozen by `prepareCall`
   */
  async * stream(options, pinned, snapshot = this.deps.state()) {
    const settings = snapshot.settings ?? {}
    const modelId = baseModelId(options.model)
    const entry = pinned ?? snapshot.catalog.find(candidate => candidate.id === modelId) ?? null

    if (settings.enabled === false) {
      yield { type: 'finish', reason: { kind: 'error', failure: { message: 'our free model is switched off in its settings page', code: 'CONFIG_DISABLED' } } }
      return
    }
    if (entry === null) {
      yield { type: 'finish', reason: { kind: 'error', failure: { message: `our free model does not serve "${options.model}" on this egress`, code: CODE.server } } }
      return
    }

    const started = Date.now()
    const wire = wireFor(entry.id)
    const style = STYLE_FOR_WIRE[wire]
    const warnings = []
    const resolveImage = this.deps.resolveImage
    const messages = repairToolPairing(options.messages ?? [])
    const budget = budgetFor(options.reasoningEffort, entry, options.maxTokens, settings.defaultMaxTokens)
    const payload = buildPayload(wire, entry.id, messages, options, budget, resolveImage, warnings)

    const declared = toToolDefs(options.tools, style)
    if (declared.length > 0) payload.tools = declared
    if (typeof options.temperature === 'number' && Number.isFinite(options.temperature)) payload.temperature = options.temperature
    if (wire !== 'responses' && Array.isArray(options.stop) && options.stop.length > 0) payload.stop = options.stop
    // The free-tier gate is a fingerprint check over the declared tool set, so
    // it is satisfied even when the caller brought no tools of its own.
    const renameMap = applyFingerprint(payload, style === 'flat')

    const channel = createChannel()
    const session = sessionForConversation(options.sessionId)
    const request = postStreamed({
      path: endpointFor(entry.id),
      body: payload,
      session,
      requestId: mintRequestId(),
      attributionUserAgent: snapshot.attributionUserAgent,
      signal: options.signal,
      onData: value => channel.push(value),
    }).then(() => channel.push(undefined))
      .catch(error => channel.push(error instanceof Error ? error : new Error(String(error))))
    // Rejections are surfaced through the channel; silence the host's guard.
    request.catch(() => {})

    const record = (ok, usage, ttftMs, decodeMs, sawReasoning) => {
      this.deps.recordUsage({
        at: started,
        model: entry.id,
        effort: resolveLevel(options.reasoningEffort, entry)?.id ?? '',
        ok,
        input: usage?.inputTokens ?? 0,
        output: usage?.outputTokens ?? 0,
        reasoning: usage?.reasoningTokens ?? 0,
        cacheRead: usage?.cacheReadTokens ?? 0,
        decodeTokens: ok ? windowTokens(usage, sawReasoning === true) : 0,
        ttftMs,
        decodeMs,
        origin: 'harness',
        ...warnings.length === 0 ? {} : { warnings },
      })
    }

    try {
      const outcome = yield* readStream(channel.read(), wire, renameMap, () => Date.now())
      yield { type: 'usage', usage: outcome.usage }
      // Two upstream pathologies the finish token alone cannot express:
      //
      // A truncated turn is reported by the gateway as finish "tool_calls" even
      // when the ceiling cut the arguments mid-JSON (verified live 2026-09-25).
      // Handing the harness a tool-calls finish makes it execute an
      // unexecutable call, the tool errors, and the model retries into the same
      // ceiling — the reported endless, very expensive turns. A max-tokens
      // finish makes the assembler prune the call and ends the turn instead.
      if (outcome.brokenToolCall === true) {
        yield { type: 'finish', reason: { kind: 'max-tokens' } }
        record(true, outcome.usage, (outcome.firstDeltaAt ?? started) - started, Date.now() - (outcome.firstDeltaAt ?? started), outcome.sawReasoning)
        if (warnings.length > 0) this.deps.warn?.(`our-free-model: dropped unsupported content for ${entry.id}: ${warnings.join(', ')}`)
        return
      }
      // A degenerate completion — a normal stop with zero blocks — would end
      // the turn silently with nothing for the user or the loop to act on.
      // Classifying it here is what makes the harness back off and retry.
      if (outcome.sawText !== true && outcome.sawToolCall !== true && outcome.sawReasoning !== true
        && finishReason(outcome.finish).kind === 'stop') {
        yield { type: 'finish', reason: { kind: 'error', failure: { message: 'our free model returned an empty response', code: CODE.empty } } }
        record(false, outcome.usage, undefined, 0)
        return
      }
      yield { type: 'finish', reason: finishReason(outcome.finish) }
      record(true, outcome.usage, (outcome.firstDeltaAt ?? started) - started, Date.now() - (outcome.firstDeltaAt ?? started), outcome.sawReasoning)
      if (warnings.length > 0) this.deps.warn?.(`our-free-model: dropped unsupported content for ${entry.id}: ${warnings.join(', ')}`)
    } catch (error) {
      // No first-token time exists for a call that never streamed, and its wall
      // clock is not one: recording it as TTFT pushed failure latency into the
      // latency average.
      record(false, undefined, undefined, 0)
      // Geography refusals are how a changed egress announces itself mid-turn.
      if (error?.code === CODE.region) this.deps.onRegionBlocked?.(entry.id)
      const failure = toFailure(error)
      yield { type: 'finish', reason: { kind: options.signal?.aborted === true ? 'aborted' : 'error', failure } }
    }
  }
}

function buildPayload(wire, modelId, messages, options, budget, resolveImage, warnings) {
  if (wire === 'responses') {
    const input = toResponseInput(messages, resolveImage, warnings)
    return {
      model: modelId,
      input: input.length > 0 ? input : [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: '...' }] }],
      stream: true,
      store: false,
      max_output_tokens: budget,
    }
  }
  if (wire === 'messages') {
    const shaped = toClaudeMessages(messages, resolveImage, warnings)
    return {
      model: modelId,
      messages: shaped.messages,
      stream: true,
      max_tokens: budget,
      ...shaped.system === undefined ? {} : { system: shaped.system },
    }
  }
  const chat = toChatMessages(messages, resolveImage, warnings)
  return {
    model: modelId,
    messages: typeof options.system === 'string' && options.system !== ''
      ? [{ role: 'system', content: options.system }, ...chat]
      : chat,
    stream: true,
    max_tokens: budget,
  }
}

/**
 * Shape one thrown error into the harness's `LlmFailure` vocabulary.
 *
 * The harness writes this object straight into a durable session event, and that
 * log rejects anything that does not survive a lossless JSON round trip — an
 * Error instance, a `NaN`, an explicit `undefined` field. A rejected append
 * aborts the whole turn, so a malformed failure is strictly worse than a sparse
 * one: only the whitelisted fields are carried, each validated, and each dropped
 * rather than emitted in a degraded form.
 */
function toFailure(error) {
  const message = typeof error?.message === 'string' && error.message.length > 0
    ? error.message
    : String(error ?? 'our free model request failed')
  const code = typeof error?.code === 'string' && error.code.length > 0 ? error.code : CODE.transport
  const status = error?.status
  const retryAfter = error?.providerRetryAfterMs
  return {
    message,
    code,
    ...Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {},
    ...Number.isFinite(retryAfter) && retryAfter > 0 ? { providerRetryAfterMs: Math.trunc(retryAfter) } : {},
  }
}

/**
 * The `/model` popup's detail line. The composer renders only the model name, so
 * the capacities that matter for choosing a model — modality, window, whether an
 * effort menu exists — have to fit here.
 *
 * A model that cannot switch its thinking off names the shared ceiling outright:
 * on that lane the rung is not only the answer's budget, and a picker that
 * implied otherwise is how "why is it cut off at 8K when my ceiling is 32K" gets
 * asked.
 */
function describe(entry, settings) {
  const parts = [entry.vision ? 'vision + text input' : 'text input', `${Math.round(entry.contextWindow / 1024)}K context`]
  if (entry.reasoning === true) {
    const rung = Math.round(budgetFor(DEFAULT_LEVEL, entry, undefined, settings?.defaultMaxTokens) / 1024)
    parts.push(entry.canDisableThinking === false
      ? `thinking always on · ${rung}K default ceiling, shared with the answer`
      : 'tunable thinking budget')
  }
  return parts.join(' · ')
}
