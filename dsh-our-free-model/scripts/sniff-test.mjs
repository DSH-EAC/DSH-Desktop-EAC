/**
 * The response body decides what it is — not `Content-Type`.
 *
 * Issue #6: under load the gateway answers 200 with a content type that is not
 * `text/event-stream` while the body underneath is an ordinary SSE frame stream.
 * Believing the header took the whole turn down two ways at once — `response.text()`
 * buffered the live stream, and the buffer did not parse as JSON — and the
 * resulting error then read to the availability probe as a refused model, which
 * removed a working model from the picker.
 *
 * These checks drive `postStreamed` against a local stand-in that mislabels its
 * own body, so the lane stays untouched and no quota is spent.
 *
 * Run: node scripts/sniff-test.mjs
 */
import http from 'node:http'
import { chatFrames } from './lib/fake-kernel.mjs'

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`)
}

const bytes = text => Buffer.from(text, 'utf8')

/**
 * One server, one scripted answer per model id: content type, body, and whether
 * the body arrives in one piece.
 */
const scripts = new Map()
const seen = []
const server = http.createServer((req, res) => {
  const chunks = []
  req.on('data', row => chunks.push(row))
  req.on('end', () => {
    let body = {}
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { /* scripted */ }
    seen.push(body.model)
    const script = scripts.get(body.model) ?? { contentType: 'text/event-stream', body: chatFrames() }
    if (script.raw !== undefined) {
      res.writeHead(script.status ?? 200, { 'content-type': script.contentType })
      res.end(Buffer.from(script.raw))
      return
    }
    if (script.holdMs !== undefined) {
      // A status line and headers, then a stall: with no pieces that is the
      // gateway that accepts a request and never starts the body; with pieces the
      // body starts and then stops, which is what an abort has to interrupt.
      res.writeHead(script.status ?? 200, { 'content-type': script.contentType })
      res.flushHeaders?.()
      for (const piece of script.pieces ?? []) res.write(Buffer.from(piece))
      setTimeout(() => res.end(), script.holdMs).unref?.()
      return
    }
    res.writeHead(script.status ?? 200, { 'content-type': script.contentType })
    if (script.pieces !== undefined) {
      // One frame per write, so a chunk boundary can land inside a multi-byte
      // character or in the middle of a `data:` line.
      let index = 0
      const pump = () => {
        if (index >= script.pieces.length) { res.end(); return }
        res.write(Buffer.from(script.pieces[index++]), () => setTimeout(pump, 1))
      }
      pump()
      return
    }
    res.end(script.body)
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
server.unref()
process.env.OUR_FREE_MODEL_BASE = `http://127.0.0.1:${server.address().port}`

const { CODE, postStreamed, sniffBody } = await import('../src/http.js')

/** Ask the real `postStreamed` one question and collect what it handed back. */
async function ask(model, options = {}) {
  const payloads = []
  try {
    await postStreamed({
      path: '/zen/v1/chat/completions',
      body: { model, messages: [{ role: 'user', content: 'hi' }], stream: true },
      session: 's', requestId: 'r', onData: payload => payloads.push(payload), ...options,
    })
    return { payloads }
  } catch (error) {
    return { error, payloads }
  }
}

const framesOf = payloads => payloads
  .map(raw => { try { return JSON.parse(raw).choices?.[0]?.delta?.content ?? '' } catch { return '' } })
  .join('')

// ── the reported case: SSE frames behind a JSON content type ─────────────────
scripts.set('mimo-v2.6-flash-free', { contentType: 'application/json', body: chatFrames('streamed anyway') })
const mislabeled = await ask('mimo-v2.6-flash-free')
check('a 200 with the wrong content type still streams', framesOf(mislabeled.payloads), 'streamed anyway')
check('and never becomes an error', mislabeled.error?.message ?? 'none', 'none')

// The header the plugin used to trust is now only a hint: a correct
// `text/event-stream` label must not change the answer either.
scripts.set('mimo-v2.5-free', { contentType: 'text/event-stream; charset=utf-8', body: chatFrames('labelled right') })
check('an honest content type behaves exactly the same', framesOf((await ask('mimo-v2.5-free')).payloads), 'labelled right')

// ── chunk boundaries: the sniff may not consume a partial frame ──────────────
scripts.set('space-bunny-free', {
  contentType: 'application/json',
  pieces: ['data: {"choices":[{"index":0,"delta":{"content":"你好，世', '界"}}]}\n\ndata: [DONE]\n\n'],
})
const split = await ask('space-bunny-free')
check('a frame split across chunks arrives whole', framesOf(split.payloads), '你好，世界')
check('including a multi-byte character cut in half', split.error?.message ?? 'none', 'none')

// A head longer than the sniff window: the bytes past it must keep streaming.
const long = Array.from({ length: 400 }, (_, index) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: `tok${index}` } }] })}\n\n`).join('')
scripts.set('union-alpha', { contentType: 'application/octet-stream', body: long })
const overflow = await ask('union-alpha')
check('everything past the 4 K sniff window still arrives', framesOf(overflow.payloads),
  Array.from({ length: 400 }, (_, index) => `tok${index}`).join(''))

// ── what is genuinely not a stream still takes the old paths ─────────────────
scripts.set('deepseek-v4-flash-free', { contentType: 'application/json', status: 400, body: JSON.stringify({ error: { type: 'ModelError', message: 'Model is unavailable.' } }) })
check('a refused model is still a classified refusal', (await ask('deepseek-v4-flash-free')).error?.code, CODE.server)
check('and still says the model is unavailable', (await ask('deepseek-v4-flash-free')).error?.message, 'Model is unavailable.')

scripts.set('nemotron-3-ultra-free', { contentType: 'application/json', body: JSON.stringify({ id: 'resp-1', status: 'completed' }) })
const single = await ask('nemotron-3-ultra-free')
check('a single JSON body is still handed over as one payload', single.payloads.length, 1)
check('with no error attached', single.error?.message ?? 'none', 'none')

scripts.set('ling-3.0-flash-fin-free', { contentType: 'text/html', raw: bytes('<html><body>bad gateway</body></html>') })
const junk = await ask('ling-3.0-flash-fin-free')
check('a body that is neither is still an error', junk.error?.code, CODE.server)
check('and the status rides along for the probe to read', junk.error?.status, 200)

scripts.set('muse-spark-1.3-contributor-free', { contentType: 'application/json', raw: bytes('') })
check('an empty body reads as empty, not as a parse failure', (await ask('muse-spark-1.3-contributor-free')).error?.code, CODE.empty)

// A JSON envelope big enough to cross the sniff window, with a multi-byte
// character sitting exactly on the boundary: the head and the remainder share one
// decoder, so this still parses. Built by padding to 4 095 bytes and then writing
// a three-byte character, so the split lands mid-character by construction.
const pad = '{"note":"' + 'x'.repeat(4_086)
check('the boundary really falls mid-character', Buffer.byteLength(pad, 'utf8'), 4_095)
scripts.set('space-bunny-free', { contentType: 'application/json', pieces: [pad, '你好」"}\n'] })
const straddle = await ask('space-bunny-free')
check('a character split by the sniff window survives', straddle.error?.message ?? 'none', 'none')
check('and the JSON it belongs to still parses', straddle.payloads.length, 1)

// Nothing at all after the request: the sniff is the one read that happens before
// `readSse` installs its deadline, so it carries its own. Without one the turn
// would hang here on a connection that accepts and then says nothing.
scripts.set('mimo-v2.6-flash-free', { contentType: 'text/event-stream', holdMs: 600 })
const stalled = await ask('mimo-v2.6-flash-free', { timeoutMs: 200 })
check('a body that never starts is a timeout, not a hang', stalled.error?.code, CODE.timeout)
check('and it says so', /no bytes/.test(stalled.error?.message ?? ''), true)

// A whole answer, then a connection that stays open. The sniff used to fill its
// 4 096-byte window before deciding anything, so a short turn that the gateway
// had already finished typing sat in the head until the deadline — and the cancel
// on the way out threw the frames away with it: a completed turn, reported as a
// retryable timeout, re-sent and paid for twice. Now the body is allowed to
// declare itself a stream as soon as it has.
const shortAnswer = chatFrames('short and finished')
scripts.set('mimo-v2.5-free', { contentType: 'text/event-stream', holdMs: 600, pieces: [shortAnswer] })
const held = await ask('mimo-v2.5-free', { timeoutMs: 200 })
check('a complete answer behind a held connection arrives', framesOf(held.payloads), 'short and finished')
check('instead of timing out with the turn in hand', held.error?.code ?? 'none', 'none')

// ── aborting a stream that was already sniffed ───────────────────────────────
// The replayed head means the reader is owned by a generator rather than by the
// response directly, so cancellation has to reach through both layers.
scripts.set('jev-1.13-free', {
  contentType: 'application/json',
  holdMs: 400,
  // `chatFrames` already spells the frame separators, so the fixture borrows it.
  pieces: [chatFrames('first').split('data: [DONE]')[0]],
})
const controller = new AbortController()
let seenBeforeAbort = 0
const abortedEarly = await new Promise(resolve => {
  setTimeout(() => controller.abort(), 150).unref?.()
  postStreamed({
    path: '/zen/v1/chat/completions',
    body: { model: 'jev-1.13-free', messages: [], stream: true },
    session: 's', requestId: 'r', signal: controller.signal,
    onData: () => { seenBeforeAbort++ },
  }).then(() => resolve('resolved')).catch(error => resolve(error?.code ?? 'uncoded'))
})
check('a stream aborted mid-delivery reads as aborted, not as transport', abortedEarly, CODE.aborted)
// The head is sniffed from the first frame now, so this abort lands *during*
// delivery rather than before it — which is the case that matters, because the
// caller has already been handed text. Nothing is unwound by the cancellation.
check('and what it had already delivered stays delivered', seenBeforeAbort > 0, true)

// The same cancellation one moment later, once the head is past the sniff window
// and `readSse` owns the reader instead of `readHead`: two different layers, and
// both have to report the user's stop as ABORTED rather than as a retryable
// transport failure.
const manyFrames = Array.from({ length: 120 }, (_, index) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: `t${index}` } }] })}

`).join('')
scripts.set('union-alpha', { contentType: 'text/event-stream', holdMs: 400, pieces: [manyFrames] })
const controller2 = new AbortController()
let delivered = 0
const abortedMid = await new Promise(resolve => {
  setTimeout(() => controller2.abort(), 120).unref?.()
  postStreamed({
    path: '/zen/v1/chat/completions',
    body: { model: 'union-alpha', messages: [], stream: true },
    session: 's', requestId: 'r', signal: controller2.signal,
    onData: () => { delivered++ },
  }).then(() => resolve('resolved')).catch(error => resolve(error?.code ?? 'uncoded'))
})
check('a stream aborted after the head reads as aborted too', abortedMid, CODE.aborted)
check('with the tokens it had already streamed', delivered > 0, true)

// ── the classifier on its own ────────────────────────────────────────────────
check('leading blank lines do not hide it', sniffBody('\n\n  data: {"a":1}'), 'sse')
check('a byte-order mark does not hide it', sniffBody('﻿data: {"a":1}'), 'sse')
check('an `event:` line is a stream too', sniffBody('event: response.created\ndata: {}'), 'sse')
check('so is a keep-alive comment', sniffBody(': ping\n\ndata: {}'), 'sse')
check('an envelope is JSON', sniffBody('{"error":{"type":"RegionError"}}'), 'json')
check('so is a list', sniffBody('[{"id":"a"}]'), 'json')
check('nothing is nothing', sniffBody('   \n '), 'empty')
check('and prose is unrecognised', sniffBody('<html>nope'), 'unknown')

// ── the probe must not punish a model for the gateway's own trouble ──────────
const { probeModel } = await import('../src/probe.js')
const { buildCatalog } = await import('../src/catalog.js')
const entryOf = id => buildCatalog([id])[0]
scripts.set('mimo-v2.6-flash-free', { contentType: 'application/json', body: chatFrames('ok') })
check('a mislabeled stream probes as available', (await probeModel(entryOf('mimo-v2.6-flash-free'))).state, 'available')
scripts.set('mimo-v2.6-flash-free', { contentType: 'application/json', status: 503, body: JSON.stringify({ error: { message: 'Too Many Requests' } }) })
check('a 5xx probes as nothing-learned', (await probeModel(entryOf('mimo-v2.6-flash-free'))).state, 'unknown')
scripts.set('mimo-v2.6-flash-free', { contentType: 'application/json', status: 404, body: JSON.stringify({ error: { message: 'No such model' } }) })
check('a 404 on the id probes as unavailable', (await probeModel(entryOf('mimo-v2.6-flash-free'))).state, 'unavailable')

// The verdict is the status, not the reason phrase. Every reverse proxy answers a
// 503 with "Service Unavailable", and the message fallback read that as the
// gateway naming this model — so an overloaded gateway silently emptied the
// picker one model at a time, and each one stayed out until the next round.
scripts.set('mimo-v2.6-flash-free', { contentType: 'application/json', status: 503, body: JSON.stringify({ error: { message: 'Service Unavailable' } }) })
check('a 503 spelled "Service Unavailable" is still nothing-learned', (await probeModel(entryOf('mimo-v2.6-flash-free'))).state, 'unknown')
scripts.set('mimo-v2.6-flash-free', { contentType: 'text/html', status: 503, body: '<html><head><title>503 Service Unavailable</title></head></html>' })
check('and so is a plaintext proxy page', (await probeModel(entryOf('mimo-v2.6-flash-free'))).state, 'unknown')
// The line is between a reason phrase and a verdict, not between statuses: a
// body that names the model refused is the gateway answering about the model,
// and the classifier's own reading of it is still honoured under a 5xx.
scripts.set('mimo-v2.6-flash-free', { contentType: 'application/json', status: 503, body: JSON.stringify({ error: { type: 'ModelError', message: 'Model is unavailable' } }) })
check('a 5xx that names the model is still a refusal', (await probeModel(entryOf('mimo-v2.6-flash-free'))).state, 'unavailable')
// …while a refusal the classifier did not name, arriving under a 200 envelope,
// still has to be read — that is what the fallback is for.
scripts.set('mimo-v2.6-flash-free', { contentType: 'application/json', status: 200, body: JSON.stringify({ error: { message: 'no such model: mimo-v2.6-flash-free' } }) })
check('a 200 envelope naming the model still probes as unavailable', (await probeModel(entryOf('mimo-v2.6-flash-free'))).state, 'unavailable')

server.close()
console.log(failures === 0 ? '\nsniff: the body decides, and the stream survives looking at it' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
