/**
 * OpenAI-compatible forward listener.
 *
 * Other local harnesses speak OpenAI at a base URL; this turns one of those
 * requests into a harness-shaped call and streams the answer back in the spelling
 * the caller expects. It exists so the same免密 lane that powers the picker can
 * also serve a `baseURL` in someone else's config.
 *
 * The harness's own web server is deliberately not reused: its port belongs to
 * the application, while this port belongs to the user and has to be settable
 * independently. Authentication is ours to enforce too — the listener is a
 * network-facing door with no session behind it, so every request must present a
 * issued key, compared in constant time.
 *
 * @module src/forward.js
 */

import http from 'node:http'
import crypto from 'node:crypto'
import { baseModelId } from './upstream.js'

const MAX_BODY_BYTES = 8 * 1024 * 1024

/** Mint a forward-proxy key. Not derived from anything user-visible. */
export function generateKey() {
  return `ofm-${crypto.randomBytes(24).toString('base64url')}`
}

/** Constant-time comparison of a bearer token against the issued key. */
export function keyMatches(presented, expected) {
  if (typeof presented !== 'string' || typeof expected !== 'string') return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.byteLength === b.byteLength && crypto.timingSafeEqual(a, b)
}

function bearerOf(req) {
  const header = String(req.headers.authorization ?? '')
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim()
  const key = req.headers['x-api-key']
  return typeof key === 'string' ? key.trim() : ''
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' })
  res.end(body)
}

function openAiError(res, status, type, message) {
  json(res, status, { error: { message, type, param: null, code: null } })
}

/**
 * Start the listener.
 *
 * @param {object} options
 * @param {() => {host: string, port: number, enabled: boolean, key: string}} options.config
 * @param {(request: object, onChunk: (chunk: object) => void) => Promise<object>} options.complete -
 *   runs one completion through the adapter and reports chunks as they arrive
 * @param {() => Array<{id: string, created: number, owned_by: string}>} options.modelRows
 * @param {(message: string) => void} [options.log]
 * @returns {Promise<{server: http.Server, port: number, close: () => Promise<void>}>}
 */
export async function startForwardServer({ config, complete, modelRows, log = () => {} }) {
  const server = http.createServer((req, res) => {
    void handle(req, res).catch(error => {
      log(`request failed: ${error?.message ?? error}`)
      if (!res.headersSent) openAiError(res, 500, 'server_error', String(error?.message ?? error))
      else res.end()
    })
  })

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname.replace(/\/+$/, '') || '/'
    const settings = config()
    if (!settings.enabled) {
      openAiError(res, 503, 'service_unavailable', 'the forward listener is switched off in Our Free Model settings')
      return
    }
    // CORS preflight, so a browser-based harness on another origin can use it.
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders())
      res.end()
      return
    }
    // Liveness only, and deliberately before the key check: a caller probing
    // whether the port is up must not need the key to get an answer. It gets a
    // count of nothing — the model roster is what the authenticated routes serve.
    if (path === '/' || path === '/health') {
      json(res, 200, { ok: true, service: 'our-free-model' })
      return
    }
    if (!authorized(req, settings.key)) {
      openAiError(res, 401, 'invalid_request_error', 'missing or invalid API key')
      return
    }
    if (req.method === 'GET' && (path === '/v1/models' || path === '/models')) {
      json(res, 200, { object: 'list', data: modelRows() })
      return
    }
    if (req.method === 'POST' && (path === '/v1/chat/completions' || path === '/chat/completions')) {
      await chatCompletions(req, res, complete)
      return
    }
    if (req.method === 'POST' && (path === '/v1/responses' || path === '/responses')) {
      await responsesEndpoint(req, res, complete)
      return
    }
    openAiError(res, 404, 'not_found_error', `no route for ${req.method} ${path}`)
  }

  const port = await new Promise((resolve, reject) => {
    const onError = error => reject(error)
    server.once('error', onError)
    const desired = config()
    server.listen(Number.isFinite(desired.port) ? desired.port : 0, desired.host || '127.0.0.1', () => {
      server.off('error', onError)
      server.on('error', error => log(`listener error: ${error?.message ?? error}`))
      resolve(server.address()?.port ?? 0)
    })
  })

  return {
    server,
    port,
    /** The address actually bound, so a caller can tell a restart from a no-op. */
    host: config().host || '127.0.0.1',
    close: () => new Promise(resolve => {
      server.closeAllConnections?.()
      server.close(() => resolve())
    }),
  }
}

function authorized(req, key) {
  if (typeof key !== 'string' || key === '') return false
  return keyMatches(bearerOf(req), key)
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, x-api-key',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '600',
  }
}

function sendSse(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function openStreamHeaders(res) {
  res.writeHead(200, {
    ...corsHeaders(),
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
}

/** Drive one chat-completion through `complete`, in either response style. */
async function chatCompletions(req, res, complete) {
  const body = await readBody(req)
  const model = baseModelId(String(body.model ?? ''))
  if (model === '') {
    openAiError(res, 400, 'invalid_request_error', '`model` is required')
    return
  }
  const id = `chatcmpl-${crypto.randomBytes(8).toString('hex')}`
  const created = Math.floor(Date.now() / 1000)
  const wantsStream = body.stream === true

  if (!wantsStream) {
    const outcome = await complete({ model, openAi: body })
    // A turn the lane refused has to come back as a failure. `complete` reports
    // it in `outcome.error`, and without this guard the caller got 200 with
    // `content: null` and `finish_reason: stop` — indistinguishable from a model
    // that chose to say nothing.
    if (outcome.error !== undefined && (outcome.text ?? '') === '' && (outcome.toolCalls?.length ?? 0) === 0) {
      openAiError(res, 502, 'server_error', outcome.error)
      return
    }
    const text = [outcome.text ?? '', ...(outcome.toolCalls ?? []).map(() => '')].join('')
    json(res, 200, {
      id, object: 'chat.completion', created, model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: text === '' ? null : text,
          ...(outcome.toolCalls?.length ? { tool_calls: outcome.toolCalls.map((call, i) => ({ id: call.id || `call_${i}`, type: 'function', function: { name: call.name, arguments: call.arguments } })) } : {}),
        },
        finish_reason: outcome.toolCalls?.length ? 'tool_calls' : outcome.truncated ? 'length' : 'stop',
      }],
      usage: outcome.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    })
    return
  }

  openStreamHeaders(res)
  sendSse(res, { id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })
  const seenToolStart = new Set()
  let forwarded = false
  const outcome = await complete({ model, openAi: body }, (chunk) => {
    if (chunk.type === 'text-delta') {
      if (chunk.text !== '') forwarded = true
      sendSse(res, { id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content: chunk.text }, finish_reason: null }] })
      return
    }
    if (chunk.type === 'reasoning-delta') {
      if (chunk.text !== '') forwarded = true
      sendSse(res, { id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { reasoning: chunk.text }, finish_reason: null }] })
      return
    }
    if (chunk.type === 'tool-call-delta') {
      forwarded = true
      const first = !seenToolStart.has(chunk.index)
      if (first) seenToolStart.add(chunk.index)
      sendSse(res, {
        id, object: 'chat.completion.chunk', created, model,
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: chunk.index,
              ...(first ? { id: chunk.id, function: { name: chunk.name ?? '', arguments: '' } } : {}),
            }],
          },
          finish_reason: null,
        }],
      })
      if (chunk.argumentsDelta) {
        sendSse(res, { id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { tool_calls: [{ index: chunk.index, function: { arguments: chunk.argumentsDelta } }] }, finish_reason: null }] })
      }
      return
    }
    if (chunk.type === 'usage') {
      sendSse(res, { id, object: 'chat.completion.chunk', created, model, choices: [], usage: toOpenAiUsage(chunk.usage) })
    }
  })
  if (outcome.error !== undefined) {
    // The status line went out with the first SSE header, so 200 is already spent
    // — but a turn the lane refused must still say so. Answering a refusal with a
    // clean `finish_reason: stop` and no content is the empty-200 this endpoint's
    // non-streaming branch fixed, arriving by the other door.
    sendSse(res, { error: { message: String(outcome.error), type: 'server_error' } })
    if (!forwarded) {
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }
  }
  sendSse(res, {
    id, object: 'chat.completion.chunk', created, model,
    choices: [{ index: 0, delta: {}, finish_reason: outcome.toolCalls?.length || seenToolStart.size > 0 ? 'tool_calls' : outcome.truncated ? 'length' : 'stop' }],
  })
  res.write('data: [DONE]\n\n')
  res.end()
}

/** Responses-API spelling, so Codex-shaped local clients work too. */
async function responsesEndpoint(req, res, complete) {
  const body = await readBody(req)
  const model = baseModelId(String(body.model ?? ''))
  const id = `resp-${crypto.randomBytes(8).toString('hex')}`
  const outcome = await complete({ model, openAi: { ...body, input: body.input ?? body.messages ?? [] }, responses: true })
  if (outcome.error !== undefined && (outcome.text ?? '') === '' && (outcome.toolCalls?.length ?? 0) === 0) {
    openAiError(res, 502, 'server_error', outcome.error)
    return
  }
  json(res, 200, {
    id, object: 'response', created_at: Math.floor(Date.now() / 1000), model, status: 'completed',
    output: [
      ...(outcome.text ? [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: outcome.text }] }] : []),
      ...(outcome.toolCalls ?? []).map((call, i) => ({ type: 'function_call', call_id: call.id || `call_${i}`, name: call.name, arguments: call.arguments })),
    ],
    usage: {
      input_tokens: outcome.usage?.prompt_tokens ?? 0,
      output_tokens: outcome.usage?.completion_tokens ?? 0,
      total_tokens: outcome.usage?.total_tokens ?? 0,
    },
  })
}

export function toOpenAiUsage(usage) {
  if (usage === undefined) return undefined
  return {
    prompt_tokens: (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0),
    completion_tokens: usage.outputTokens ?? 0,
    total_tokens: (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.outputTokens ?? 0),
    prompt_tokens_details: { cached_tokens: usage.cacheReadTokens ?? 0 },
    completion_tokens_details: { reasoning_tokens: usage.reasoningTokens ?? 0 },
  }
}
