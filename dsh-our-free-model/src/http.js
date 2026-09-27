/**
 * Outbound HTTP for the free lane: request posting, SSE line extraction, and the
 * classification of gateway failures into the harness's provider-neutral codes.
 *
 * The gateway reports a refusal as a JSON error envelope whose `type` is the
 * machine-readable discriminator. Three of them matter operationally and are
 * distinguished here because they need different handling:
 *
 * - `RegionError`  — the model exists but this egress country is excluded. Not a
 *   credential or capacity problem, and it clears the moment the user's egress
 *   changes, so it feeds the availability probe rather than a retry.
 * - `FreeUsageLimitError` / 429 — the per-session quota is spent; retrying with
 *   a fresh session makes it worse, which is why the session id is stable.
 * - `ModelError` / "Model is unavailable" — the pooled account no longer routes
 *   that id at all.
 *
 * How a 2xx body is read is decided by the body, not by `Content-Type`: this
 * gateway is observed answering 200 with a JSON content type over an SSE frame
 * stream, and believing the header cost the whole turn (issue #6). The head is
 * sniffed and then replayed into the stream reader, so no token is buffered.
 *
 * @module src/http.js
 */

import { CLIENT_UA, UPSTREAM_BASE, gatewayHeaders, truncateSession } from './upstream.js'

/** Harness-neutral failure codes (packages/llm/llm/src/error.ts vocabulary). */
export const CODE = {
  region: 'REGION_BLOCKED',
  quota: 'RATE_LIMIT',
  credential: 'INVALID_CREDENTIAL',
  transport: 'TRANSPORT',
  timeout: 'TIMEOUT',
  server: 'SERVER',
  empty: 'EMPTY_RESPONSE',
  aborted: 'ABORTED',
}

export class UpstreamError extends Error {
  constructor(message, code, details = {}) {
    super(message)
    this.name = 'UpstreamError'
    this.code = code
    Object.assign(this, details)
  }
}

/** Turn a gateway JSON error envelope into a classified failure. */
export function classifyFailure(status, payload, retryAfterMs) {
  const error = payload?.error ?? payload ?? {}
  const type = typeof error.type === 'string' ? error.type : ''
  const message = typeof error.message === 'string' ? error.message : `upstream HTTP ${status}`
  const flat = message.toLowerCase()
  if (type === 'RegionError' || /not available in your country|region/i.test(flat)) {
    return new UpstreamError(message, CODE.region, { status, type })
  }
  if (status === 429 || type === 'FreeUsageLimitError' || /usage limit|rate limit/i.test(flat)) {
    return new UpstreamError(message, CODE.quota, { status, type, providerRetryAfterMs: retryAfterMs })
  }
  if (status === 401 || status === 403) return new UpstreamError(message, CODE.credential, { status, type })
  if (type === 'ModelError' || /model is unavailable|not supported/.test(flat)) {
    return new UpstreamError(message, CODE.server, { status, type, unavailable: true })
  }
  return new UpstreamError(message, CODE.server, { status, type })
}

/** Parse `Retry-After` into milliseconds, when the header carries a number. */
function retryAfter(header) {
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds > 0 ? Math.trunc(seconds * 1000) : undefined
}

/**
 * How many bytes to look at before deciding what the body is.
 *
 * The gateway is known to answer 200 with a `Content-Type` that is not
 * `text/event-stream` while the body underneath is a perfectly normal SSE
 * stream (issue #6, most visible on the chat wire under load). Trusting the
 * header threw the whole turn away, so the body's own shape decides — and the
 * bytes that were spent looking at it are replayed into the reader, never
 * swallowed by a `response.text()`, which would buffer a live stream to the end
 * before yielding a single token.
 */
const SNIFF_BYTES = 4096

/**
 * Classify the beginning of a response body by shape.
 *
 * @param {string} text - the decoded head, possibly a partial stream
 * @returns {'sse'|'json'|'empty'|'unknown'}
 */
export function sniffBody(text) {
  const head = String(text ?? '').replace(/^﻿/, '').trimStart()
  if (head === '') return 'empty'
  if (head.startsWith(':') || /^(?:data|event|id|retry)[ \t]*:/m.test(head.slice(0, 64))) return 'sse'
  if (head.startsWith('{') || head.startsWith('[')) return 'json'
  return 'unknown'
}

/**
 * Take the first `limit` bytes of a body without losing the rest of it.
 *
 * Stops as soon as the head has said it is a stream: a short answer whose server
 * keeps the connection open would otherwise sit here until the deadline, and the
 * cancel on the way out discards everything already read — a complete turn,
 * reported as a retryable timeout. Frames arrive as they are read, so the first
 * token is not held back for the rest of the sniff window either.
 *
 * @param {ReadableStream} stream
 * @param {number} limit
 * @param {object} options
 * @param {AbortSignal} [options.signal]
 * @param {number} options.timeoutMs - how long to wait for anything at all
 * @returns {Promise<{reader:object, chunks:Uint8Array[], done:boolean, text:string, decoder:TextDecoder}>}
 */
async function readHead(stream, limit, { signal, timeoutMs }) {
  const reader = stream.getReader()
  const chunks = []
  // One decoder for the whole body: flushing here would corrupt a multi-byte
  // character whose tail arrives in the next chunk.
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  let done = false
  try {
    while (size < limit) {
      const row = await headRead(reader, signal, deadlineFor(timeoutMs))
      if (row.done) { done = true; break }
      if (row.value === undefined) continue
      chunks.push(row.value)
      size += row.value.byteLength ?? 0
      text += decoder.decode(row.value, { stream: true })
      if (sniffBody(text) === 'sse') break
    }
  } catch (error) {
    // Abandoning the body: cancel it so the connection is not held, and do not
    // let a lock-release complaint replace the failure the caller has to
    // classify (a raw TypeError here would reach the harness unclassified).
    await reader.cancel().catch(() => {})
    try { reader.releaseLock?.() } catch { /* mid-teardown */ }
    throw classifyStreamFailure(error, signal)
  }
  return { reader, chunks, done, text, decoder }
}

/**
 * Normalize anything the body reads can throw into an `UpstreamError`.
 *
 * This matters beyond tidiness: aborting a request rejects the pending
 * `reader.read()` with the signal's own `DOMException`, whose `code` is the
 * *numeric* legacy `20`. The adapter's `toFailure` only carries a string code, so
 * anything it does not recognize is reported as `TRANSPORT` — and `TRANSPORT` is
 * in the retryable set, which would have the harness retry a turn the user
 * deliberately cancelled.
 */
export function classifyStreamFailure(error, signal) {
  if (error instanceof UpstreamError) return error
  if (signal?.aborted === true || error?.name === 'AbortError') return new UpstreamError('request aborted', CODE.aborted)
  return new UpstreamError(`our-free-model: upstream stream read failed: ${error?.message ?? error}`, CODE.transport)
}

/** The head is the one read with no line-level deadline behind it, so it needs its own. */
function deadlineFor(timeoutMs) {
  return Date.now() + timeoutMs
}

/**
 * One read off the body while deciding what it is, bounded by the same deadline
 * and abort signal `readSse` would have honoured. Without this a connection that
 * accepts the request and then never sends a byte would hang the turn here, in
 * the few lines of code that run before any watchdog exists.
 */
async function headRead(reader, signal, deadline) {
  if (signal?.aborted) throw new UpstreamError('request aborted', CODE.aborted)
  let timer
  let onAbort
  const pending = reader.read()
  const halted = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new UpstreamError('our-free-model: upstream sent no bytes before its deadline', CODE.timeout)),
      Math.max(0, deadline - Date.now()))
    timer.unref?.()
    onAbort = () => {
      void reader.cancel().catch(() => {})
      reject(new UpstreamError('request aborted', CODE.aborted))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([pending, halted])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    // The losing read settles on its own once the reader is cancelled or closed;
    // nothing is waiting on it, so its outcome must not surface as a rejection.
    pending.catch(() => {})
  }
}

/**
 * Turn a head that was already read, plus the reader that follows it, back into
 * one byte stream.
 */
async function* replayStream(head) {
  try {
    for (const chunk of head.chunks) yield chunk
    if (head.done) return
    while (true) {
      const row = await head.reader.read()
      if (row.done) return
      if (row.value !== undefined) yield row.value
    }
  } finally {
    if (!head.done) await head.reader.cancel().catch(() => {})
    head.reader.releaseLock?.()
  }
}

/**
 * Read the rest of a body that is not a stream, as text.
 *
 * Continues on the decoder the head used, so a character split across the sniff
 * boundary still decodes.
 */
async function readRemainder(head, signal) {
  let text = head.text
  try {
    if (!head.done) {
      while (true) {
        const row = await head.reader.read()
        if (row.done) break
        if (row.value !== undefined) text += head.decoder.decode(row.value, { stream: true })
      }
    }
  } catch (error) {
    await head.reader.cancel().catch(() => {})
    throw classifyStreamFailure(error, signal)
  }
  return text + head.decoder.decode()
}

/**
 * POST one request and stream back decoded SSE `data:` payloads.
 *
 * @param {object} options
 * @param {string} options.path - gateway path
 * @param {object} options.body - JSON request body
 * @param {string} options.session - canonical upstream session id
 * @param {string} options.requestId - per-turn request id
 * @param {string} [options.attributionUserAgent] - harness User-Agent merged into the request
 * @param {AbortSignal} [options.signal]
 * @param {(payload: string) => void} options.onData - one `data:` payload, in order
 * @returns {Promise<{status:number, headers:Headers}>}
 */
/**
 * Compose the request User-Agent.
 *
 * Two independent requirements meet in one header: the harness mandates an
 * attribution User-Agent on every provider request, and the gateway identifies a
 * desktop client by an `opencode/<version>` token (>= 1.17). The gateway tests
 * with a search rather than an anchored match, so one value can satisfy both —
 * verified live against this lane.
 */
function userAgentWith(attribution) {
  if (typeof attribution !== 'string' || attribution === '') return CLIENT_UA
  return attribution.includes('opencode/') ? attribution : `${attribution} ${CLIENT_UA}`
}

export async function postStreamed({ path, body, session, requestId, attributionUserAgent, signal, onData, timeoutMs = 300000 }) {
  const headers = gatewayHeaders({ session: truncateSession(session), requestId, stream: true })
  headers['user-agent'] = userAgentWith(attributionUserAgent)
  let response
  try {
    response = await fetch(`${UPSTREAM_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal })
  } catch (error) {
    // The signal's own reason is what fetch rejects with, and Node's is a
    // `TimeoutError`/user Error rather than `AbortError` — testing the name alone
    // reported a cancelled turn as `TRANSPORT`, which is retryable.
    if (signal?.aborted === true || error?.name === 'AbortError') throw new UpstreamError('request aborted', CODE.aborted)
    throw new UpstreamError(`our-free-model: upstream request failed: ${error?.message ?? error}`, CODE.transport)
  }

  const setRetry = retryAfter(response.headers.get('retry-after'))
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let payload
    try { payload = JSON.parse(text) } catch { payload = { error: { message: text.slice(0, 300) || `HTTP ${response.status}` } } }
    throw classifyFailure(response.status, payload, setRetry)
  }
  if (response.body === null) throw new UpstreamError('our-free-model: upstream returned no body', CODE.empty)

  // `Content-Type` is a hint, not a verdict: take the first bytes and let the body
  // say what it is. Whatever was spent reading them is replayed in front of the
  // stream, so nothing is buffered away and no frame is dropped.
  const head = await readHead(response.body, SNIFF_BYTES, { signal, timeoutMs })
  const shape = sniffBody(head.text)
  if (shape === 'empty') throw new UpstreamError('our-free-model: upstream returned no body', CODE.empty)
  if (shape === 'sse') {
    await readSse(replayStream(head), onData, signal, timeoutMs)
    return { status: response.status, headers: response.headers }
  }

  const text = head.done ? head.text : await readRemainder(head, signal)
  if (shape !== 'json') throw new UpstreamError(`our-free-model: unexpected non-SSE response: ${text.slice(0, 200)}`, CODE.server, { status: response.status })
  let payload
  try { payload = JSON.parse(text) } catch {
    throw new UpstreamError(`our-free-model: unexpected non-SSE response: ${text.slice(0, 200)}`, CODE.server, { status: response.status })
  }
  if (payload.error) throw classifyFailure(response.status, payload, setRetry)
  onData(JSON.stringify(payload))
  return { status: response.status, headers: response.headers }
}

/**
 * Split an SSE byte stream into `data:` payload strings; comment lines ignored.
 *
 * The source is anything that yields byte chunks: a `ReadableStream` (Node's own
 * response body) or an async iterable, which is what lets a head that was already
 * sniffed be replayed in front of the live reader.
 */
export async function readSse(source, onData, signal, timeoutMs = 300000) {
  const reader = typeof source?.getReader === 'function' ? source.getReader() : null
  const iterator = reader ?? (typeof source?.[Symbol.asyncIterator] === 'function' ? source[Symbol.asyncIterator]() : source)
  const decoder = new TextDecoder()
  let buffer = ''
  let deadline = Date.now() + timeoutMs
  const stop = () => {
    if (reader !== null) void reader.cancel().catch(() => {})
    else void iterator?.return?.()
  }
  const onAbort = () => { stop() }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    while (true) {
      const { value, done } = await iterator.next()
      if (done) break
      if (Date.now() > deadline) throw new UpstreamError('our-free-model: upstream stream idle past its deadline', CODE.timeout)
      if (value !== undefined) buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        emit(line, onData)
        newline = buffer.indexOf('\n')
      }
      deadline = Date.now() + timeoutMs
    }
    // Flush the decoder so a multi-byte character split over the last two chunks
    // is not silently dropped from the final payload.
    buffer += decoder.decode()
    emit(buffer, onData)
  } catch (error) {
    throw classifyStreamFailure(error, signal)
  } finally {
    signal?.removeEventListener('abort', onAbort)
    if (reader !== null) reader.releaseLock?.()
    else void iterator?.return?.()
  }
}

function emit(line, onData) {
  const text = line.trim()
  if (text === '' || text.startsWith(':')) return
  if (text.startsWith('data:')) {
    const payload = text.slice(5).trim()
    if (payload === '' || payload === '[DONE]') return
    onData(payload)
  }
}

/** Fetch a small JSON document from the gateway with the fingerprint headers. */
export async function getJson(path, { session, requestId, attributionUserAgent, signal, timeoutMs = 15000 } = {}) {
  const headers = gatewayHeaders({ session: truncateSession(session ?? ''), requestId: requestId ?? '', stream: false, accept: 'application/json' })
  headers['user-agent'] = userAgentWith(attributionUserAgent)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  timer.unref?.()
  // Which of the two aborted decides the code: this call's own deadline is a
  // retryable timeout, the caller ending the request is not a failure at all.
  let callerAborted = false
  const onCallerAbort = () => { callerAborted = true; controller.abort() }
  signal?.addEventListener('abort', onCallerAbort, { once: true })
  try {
    const response = await fetch(`${UPSTREAM_BASE}${path}`, { headers, redirect: 'error', signal: controller.signal })
    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = { error: { message: text.slice(0, 200) } } }
    if (!response.ok) throw classifyFailure(response.status, payload)
    return payload
  } catch (error) {
    if (error instanceof UpstreamError) throw error
    if (callerAborted || signal?.aborted === true) throw new UpstreamError('request aborted', CODE.aborted)
    if (error?.name === 'AbortError') throw new UpstreamError('our-free-model: upstream GET timed out', CODE.timeout)
    throw new UpstreamError(`our-free-model: upstream GET failed: ${error?.message ?? error}`, CODE.transport)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener?.('abort', onCallerAbort)
  }
}
