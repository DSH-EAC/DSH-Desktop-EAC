/**
 * Provider SSE -> harness `StreamChunk` projection for all three wire shapes the
 * free lane answers on.
 *
 * The harness contract (packages/llm/llm/src/types.ts StreamChunk) is a flat
 * indexed block protocol: every block is opened with `block-start`, fed with
 * deltas, and closed with `block-end` carrying the assembled block. Block
 * indices are allocated in arrival order, which is what the provider does with
 * reasoning-then-text on this lane anyway.
 *
 * Token accounting follows the harness's disjoint-count rule: `inputTokens` is
 * uncached input only, so the OpenAI `prompt_tokens` total has its cache hits
 * subtracted back out.
 *
 * @module src/stream.js
 */

import crypto from 'node:crypto'
import { classifyFailure } from './http.js'
import { restoreToolName } from './upstream.js'

/** Mint a tool-call id for providers that stream arguments without one. */
function mintToolCallId() {
  return `call_${crypto.randomBytes(12).toString('hex')}`
}

class BlockSink {
  constructor(yieldChunk) {
    this.emit = yieldChunk
    this.next = 0
    /** @type {Map<string, {index:number, kind:string, text:string, id?:string, name?:string, args?:string}>} */
    this.open = new Map()
    this.usage = undefined
    this.sawReasoning = false
    this.brokenToolCall = false
  }

  /** Open (or fetch) the block a given stream slot maps to. */
  slot(key, kind) {
    const existing = this.open.get(key)
    if (existing !== undefined) return existing
    // A tool call without a provider id would come back next turn with an empty
    // toolCallId, which the pairing repair then drops on both sides — the model
    // never sees its own result and re-issues the call forever. Mint a stable
    // stand-in; a provider id arriving later still overrides it.
    const block = { index: this.next++, kind, text: '', args: '', id: kind === 'tool-call' ? mintToolCallId() : '', name: '' }
    this.open.set(key, block)
    this.emit({ type: 'block-start', index: block.index, blockType: kind === 'reasoning' ? 'reasoning' : kind === 'tool-call' ? 'tool-call' : 'text' })
    return block
  }

  text(key, delta) {
    if (delta === undefined || delta === null || delta === '') return
    this.sawText = true
    const block = this.slot(key, 'text')
    block.text += delta
    this.emit({ type: 'text-delta', index: block.index, text: delta })
  }

  reasoning(key, delta) {
    if (delta === undefined || delta === null || delta === '') return
    this.sawReasoning = true
    const block = this.slot(key, 'reasoning')
    block.text += delta
    this.emit({ type: 'reasoning-delta', index: block.index, text: delta })
  }

  toolStart(key, id, name) {
    const block = this.slot(key, 'tool-call')
    if (id) block.id = id
    if (name) block.name = name
  }

  toolArgs(key, delta) {
    if (!delta) return
    const block = this.slot(key, 'tool-call')
    block.args += delta
    this.emit({ type: 'tool-call-delta', index: block.index, id: block.id, name: block.name === '' ? undefined : block.name, argumentsDelta: delta })
  }

  closeAll() {
    for (const block of this.open.values()) {
      if (block.kind === 'text' && block.text !== '') this.emit({ type: 'block-end', index: block.index, block: { type: 'text', text: block.text } })
      else if (block.kind === 'reasoning' && block.text !== '') this.emit({ type: 'block-end', index: block.index, block: { type: 'reasoning', text: block.text } })
      else if (block.kind === 'tool-call') {
        // Arguments that never parse are an unexecutable call. The gateway
        // reports finish "tool_calls" even when the output ceiling cut the JSON
        // mid-string (verified live 2026-09-25), so the finish token alone
        // cannot be trusted; the adapter downgrades such a turn to max-tokens,
        // which makes the harness's assembler prune the call instead of
        // executing it and looping on the model's retry.
        try { JSON.parse(block.args === '' ? '{}' : block.args) } catch { this.brokenToolCall = true }
        this.emit({
          type: 'block-end', index: block.index,
          block: { type: 'tool-call', id: block.id, name: block.name, arguments: block.args === '' ? '{}' : block.args },
        })
      }
    }
    this.open.clear()
  }
}

/**
 * Turn one provider `usage` object into the harness's disjoint TokenUsage.
 *
 * `prompt_tokens_details` is optional in the OpenAI schema, and the harness's
 * durable session log rejects a non-finite number outright — so an absent cache
 * count has to default to zero before the subtraction, not afterwards. Reading
 * `undefined` off the optional field turned `inputTokens` into `NaN`, which any
 * gateway that omits the details block would have handed the kernel on
 * every single call.
 */
export function mapUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined
  const prompt = number(usage.prompt_tokens ?? usage.input_tokens)
  const completion = number(usage.completion_tokens ?? usage.output_tokens)
  const cached = number(usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens) ?? 0
  const cacheWrite = number(usage.prompt_tokens_details?.cache_write_tokens)
  const reasoning = number(usage.completion_tokens_details?.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens)
  if (prompt === undefined && completion === undefined) return undefined
  const out = {
    inputTokens: Math.max(0, (prompt ?? 0) - cached),
    outputTokens: completion ?? 0,
  }
  if (cached > 0) out.cacheReadTokens = cached
  if (cacheWrite > 0) out.cacheWriteTokens = cacheWrite
  if (reasoning > 0) out.reasoningTokens = reasoning
  out.totalTokens = (prompt ?? 0) + (completion ?? 0)
  return out
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Consume one parsed Chat Completions SSE payload.
 * @returns optional usage, and the provider finish token when present.
 */
function feedChat(sink, payload, renameMap, onFinish) {
  if (payload.usage) onFinish(mapUsage(payload.usage), 'usage')
  for (const choice of payload.choices ?? []) {
    const delta = choice.delta ?? {}
    if (typeof delta.reasoning === 'string') sink.reasoning('r', delta.reasoning)
    else if (Array.isArray(delta.reasoning_details)) {
      for (const part of delta.reasoning_details) if (typeof part?.text === 'string') sink.reasoning('r', part.text)
    }
    if (typeof delta.content === 'string') sink.text('t', delta.content)
    for (const call of delta.tool_calls ?? []) {
      const key = `c${call.index ?? 0}`
      const name = call.function?.name
      if (typeof name === 'string' && name !== '') sink.toolStart(key, call.id ?? '', restoreToolName(name, renameMap))
      else if (call.id) sink.toolStart(key, call.id, '')
      if (call.function?.arguments) sink.toolArgs(key, call.function.arguments)
    }
    if (choice.finish_reason) onFinish(undefined, 'finish', choice.finish_reason)
  }
}

/** Consume one parsed Anthropic Messages SSE event. */
function feedClaude(sink, event, onFinish, renameMap) {
  if (event.type === 'content_block_start') {
    const block = event.content_block
    if (block?.type === 'tool_use') sink.toolStart(`b${event.index}`, block.id ?? '', restoreToolName(block.name ?? '', renameMap))
    return
  }
  if (event.type === 'content_block_delta') {
    const part = event.delta
    if (part?.type === 'text_delta') sink.text(`b${event.index}`, part.text)
    else if (part?.type === 'thinking_delta') sink.reasoning(`b${event.index}`, part.thinking)
    else if (part?.type === 'input_json_delta') sink.toolArgs(`b${event.index}`, part.partial_json)
    return
  }
  if (event.type === 'message_start') {
    const usage = event.message?.usage
    if (usage) {
      const mapped = mapUsage({
        prompt_tokens: number(usage.input_tokens),
        completion_tokens: number(usage.output_tokens),
        prompt_tokens_details: { cached_tokens: number(usage.cache_read_input_tokens), cache_write_tokens: number(usage.cache_creation_input_tokens) },
      })
      if (mapped) onFinish(mapped, 'usage')
    }
    return
  }
  if (event.type === 'message_delta') {
    const usage = event.usage
    if (usage && number(usage.output_tokens) !== undefined) {
      onFinish({ outputTokens: number(usage.output_tokens) }, 'usage')
    }
    const stop = event.delta?.stop_reason
    if (stop) onFinish(undefined, 'finish', stop)
  }
}

/** Consume one parsed OpenAI Responses SSE event. */
function feedResponses(sink, event, onFinish, renameMap) {
  switch (event.type) {
    case 'response.output_item.added': {
      const item = event.item
      if (item?.type === 'function_call') sink.toolStart(`i${event.output_index}`, item.call_id ?? item.id ?? '', restoreToolName(item.name ?? '', renameMap))
      return
    }
    case 'response.content_part.added':
      return
    case 'response.output_text.delta':
      sink.text(`t${event.output_index}`, event.delta)
      return
    case 'response.reasoning_summary_text.delta':
    case 'response.output_reasoning.text.delta':
      sink.reasoning(`r${event.item_id ?? 'r'}`, event.delta)
      return
    case 'response.function_call_arguments.delta':
      sink.toolArgs(`i${event.output_index}`, event.delta)
      return
    case 'response.completed': {
      const response = event.response
      if (response?.usage) {
        const mapped = mapUsage({
          prompt_tokens: number(response.usage.input_tokens),
          completion_tokens: number(response.usage.output_tokens),
          prompt_tokens_details: { cached_tokens: number(response.usage.input_tokens_details?.cached_tokens) },
          completion_tokens_details: { reasoning_tokens: number(response.usage.output_tokens_details?.reasoning_tokens) },
        })
        if (mapped) onFinish(mapped, 'usage')
      }
      const status = response?.status
      const incomplete = response?.incomplete_details?.reason
      onFinish(undefined, 'finish', incomplete === 'max_output_tokens' ? 'length' : status === 'completed' ? 'stop' : status)
      return
    }
    default: return
  }
}

/** Map a provider finish token onto the harness finish reason. */
export function finishReason(token) {
  if (token === 'tool_calls' || token === 'tool_use' || token === 'function_call') return { kind: 'tool-calls' }
  if (token === 'length' || token === 'max_tokens' || token === 'max_output_tokens' || token === 'incomplete') return { kind: 'max-tokens' }
  return { kind: 'stop' }
}

/**
 * Output tokens that can honestly be divided by the measured window.
 *
 * Some models on this lane are billed for reasoning they never stream: measured
 * live, one call reported 422 output tokens of which 291 were reasoning, while
 * zero reasoning frames arrived. Those 291 were produced before the first frame
 * the window starts at, so counting them attributes a whole thinking phase to
 * the seconds the answer text took and published 349 tok/s for a 108 tok/s
 * answer. When reasoning did stream, the window covers it and the full count is
 * the right numerator.
 */
export function windowTokens(usage, sawReasoning) {
  const output = number(usage?.outputTokens) ?? 0
  if (sawReasoning) return output
  return Math.max(0, output - (number(usage?.reasoningTokens) ?? 0))
}

/**
 * Read one streamed response, yielding harness chunks as they are produced.
 *
 * Chunk emission stays synchronous inside the parsing of one payload, and the
 * outbox is drained after every payload, so the generator needs no racing or
 * polling to keep deltas flowing.
 *
 * @param {AsyncIterable<string>} lines - decoded `data:` payloads
 * @param {'chat'|'messages'|'responses'} wire
 * @param {Map<string, string>} renameMap - fingerprint spelling -> caller spelling
 * @param {() => number} [now] - clock stamping the first delivered delta
 * @yields {object} harness StreamChunk
 * @returns {Promise<{ usage: object, finish?: string, sawToolCall: boolean, sawReasoning: boolean, firstDeltaAt?: number }>}
 */
export async function * readStream(lines, wire, renameMap, now = () => Date.now()) {
  const outbox = []
  const sink = new BlockSink(chunk => outbox.push(chunk))
  const state = { usage: undefined, finish: undefined, sawToolCall: false, firstDeltaAt: undefined, sawReasoning: false, sawText: false, brokenToolCall: false }

  const onFinish = (usage, kind, token) => {
    if (kind === 'usage' && usage !== undefined) {
      const carried = state.usage
      // A usage report that names no input side is `message_delta` on the Messages
      // wire: it carries only the output count, and taking it whole dropped the
      // prompt counts `message_start` had already given for every Claude turn.
      state.usage = carried !== undefined && usage.inputTokens === undefined
        ? { ...carried, ...usage, totalTokens: Math.max(0, (carried.totalTokens ?? 0) - (carried.outputTokens ?? 0)) + (usage.outputTokens ?? 0) }
        : usage
    }
    if (kind === 'finish') state.finish = token
  }

  for await (const raw of lines) {
    if (typeof raw !== 'string') continue
    const text = raw.trim()
    if (!text.startsWith('{')) continue
    let payload
    try { payload = JSON.parse(text) } catch { continue }
    if (payload.type === 'error' || payload.error) {
      // Classify an in-stream refusal exactly as an error *envelope* is
      // classified, because everything downstream decides off `code`. This throw
      // used to carry only `llmCode`, which nothing reads: the failure reached
      // `toFailure` unrecognized and came out as `TRANSPORT` — a retryable code —
      // so the harness re-sent a turn whose partial answer had already been
      // streamed, and a mid-turn geography refusal never reached the re-probe
      // that watches for `CODE.region`.
      const failure = payload.error ?? payload
      const classified = classifyFailure(undefined, payload)
      if (typeof failure.message !== 'string') classified.message = 'upstream error'
      throw Object.assign(classified, { upstream: payload })
    }
    if (state.firstDeltaAt === undefined && carriesDelta(payload, wire)) state.firstDeltaAt = now()
    if (wire === 'chat') feedChat(sink, payload, renameMap, onFinish)
    else if (wire === 'messages') feedClaude(sink, payload, onFinish, renameMap)
    else feedResponses(sink, payload, onFinish, renameMap)
    if (sink.sawReasoning) state.sawReasoning = true
    if (sink.sawText) state.sawText = true
    if (sink.brokenToolCall) state.brokenToolCall = true
    for (const block of sink.open.values()) if (block.kind === 'tool-call') state.sawToolCall = true
    while (outbox.length > 0) yield outbox.shift()
  }

  sink.closeAll()
  if (sink.brokenToolCall) state.brokenToolCall = true
  while (outbox.length > 0) yield outbox.shift()
  return { ...state, usage: state.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }
}

function carriesDelta(payload, wire) {
  if (wire === 'chat') return (payload.choices ?? []).some(choice => {
    const delta = choice.delta ?? {}
    return (typeof delta.content === 'string' && delta.content !== '')
      || (typeof delta.reasoning === 'string' && delta.reasoning !== '')
      // feedChat consumes this shape, so the window has to start here too; missing
      // it made the first observed frame the first *visible* one, which on a
      // reasoning-heavy model is minutes after decoding began.
      || (Array.isArray(delta.reasoning_details) && delta.reasoning_details.some(part => typeof part?.text === 'string' && part.text !== ''))
      || (delta.tool_calls ?? []).length > 0
  })
  if (wire === 'responses') return (typeof payload.delta === 'string' && payload.delta !== '') || payload.type === 'response.output_item.added'
  return payload.type === 'content_block_delta' || payload.type === 'content_block_start'
}
