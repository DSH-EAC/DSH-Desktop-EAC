/**
 * Test scaffolding shared by the offline suites that mount the plugin's Host
 * half: a gateway stand-in that answers the listing and the probe pings without
 * touching the real free lane, and a cordis-shaped context that withholds the
 * services a headless composition would not mount.
 *
 * Nothing here imports the plugin, because `src/upstream.js` reads
 * `OUR_FREE_MODEL_BASE` once, at import time: a caller sets the environment
 * variable, then imports `../index.js` dynamically.
 */
import http from 'node:http'

/**
 * One healthy SSE body, in the Chat Completions shape every stub model speaks.
 *
 * Usage rides the top level of the final chunk, which is where a real gateway
 * puts it (`stream_options.include_usage`) — `feedChat` reads it from there and
 * nowhere else.
 */
export function chatFrames(text = 'ok') {
  return [
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 11, completion_tokens: 7 } })}\n\n`,
    'data: [DONE]\n\n',
  ].join('')
}

/**
 * Start the stand-in gateway.
 *
 * @param {object} options
 * @param {string[]} options.listing - model ids `GET /zen/v1/models` names
 * @param {(id: string, body: object, api: object) => {status?: number, body?: string, socket?: boolean, contentType?: string}} options.answer
 *   what one `POST` to the model's endpoint looks like; `api.refuseAll` etc. are
 *   readable from the returned object so a test can flip verdicts between rounds
 */
export async function stubUpstream({ listing = [], answer = () => ({ body: chatFrames() }) }) {
  const requests = []
  const api = { refuseAll: false }
  /** The listing the stub names, mutable so a test can make upstream add one. */
  let rows = listing.map(id => ({ id }))
  api.setListing = ids => { rows = ids.map(id => ({ id })) }
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', row => chunks.push(row))
    req.on('end', async () => {
      const url = String(req.url ?? '')
      if (req.method === 'GET' && url === '/zen/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ data: rows }))
        return
      }
      let body = {}
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { /* a malformed body is a scripted failure */ }
      requests.push({ path: url, body })
      const verdict = api.refuseAll ? { status: 400, body: JSON.stringify({ error: { message: 'Model is unavailable.' } }) } : answer(body.model, body, api)
      if (verdict.socket === true) {
        // No answer at all: the transport dies before a status line. The probe
        // must read this as "nothing learned", not as a refused model.
        req.destroy()
        res.destroy()
        return
      }
      const status = verdict.status ?? 200
      const contentType = verdict.contentType ?? (status === 200 ? 'text/event-stream; charset=utf-8' : 'application/json')
      const send = () => {
        res.writeHead(status, { 'content-type': contentType })
        if (verdict.pieces !== undefined) {
          // Deliver in pieces so a test can split a frame across chunk boundaries.
          for (const piece of verdict.pieces) res.write(piece)
          res.end()
          return
        }
        res.end(verdict.body)
      }
      // A held answer keeps one probe round in flight, which is what lets a test
      // look at the state between "the listing named it" and "the probe knows".
      // `wait` is the stronger form: the test holds the door open itself and
      // releases it when it is done looking, so no wall-clock race is involved.
      if (verdict.wait !== undefined) await verdict.wait
      if (verdict.holdMs !== undefined) {
        // Headers now, then the pieces it was given, then silence. A script that
        // asked for both was held to one of them — the pieces were dropped on the
        // floor, so "the answer arrived and then the connection stalled" could
        // only ever be tested as "nothing arrived at all".
        res.writeHead(status, { 'content-type': contentType })
        res.flushHeaders?.()
        for (const piece of verdict.pieces ?? []) res.write(piece)
        setTimeout(() => res.end(), verdict.holdMs).unref?.()
        return
      }
      if (verdict.delayMs === undefined) send()
      else setTimeout(send, verdict.delayMs).unref?.()
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  server.unref()
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    requests,
    api,
    close: () => new Promise(resolve => server.close(resolve)),
  }
}

/**
 * A cordis context for tests.
 *
 * `services` are what the composition mounts; only the names the plugin declares
 * in `inject` appear on its context, and reading a withheld one throws instead of
 * answering `undefined`. That is stricter than cordis, on purpose: "the plugin
 * touched a service it never declared" is the exact defect that keeps a plugin
 * from starting, and a silent `undefined` would let it pass a test and fail a
 * user.
 *
 * `ctx.inject(deps, callback)` is modelled too — including the property the
 * earlier stand-ins lacked and the real kernel taught us: a service the
 * composition does mount is often simply *not provided yet* while plugins load.
 * A nested callback therefore waits, and `__mountService(name)` makes a service
 * appear the way the browser half eventually does. A context where everything is
 * present from the first line cannot tell those two situations apart, and a
 * plugin written against the one breaks in the field because of the other.
 *
 * @param {object} options
 * @param {string[]} options.inject - the plugin's declared services
 * @param {string[]} [options.mounted] - service names this composition provides
 * @param {(route: object) => void} [options.onRegister]
 */
export function fakeContext({ inject, mounted = ['llm', 'webServer', 'timer', 'connection', 'attachments'], onRegister } = {}) {
  const logs = []
  const captured = { adapters: [], routes: [], serverRoutes: [], registrations: [], events: [], configurable: null, discovery: null }
  const disposers = []
  const mountedSet = new Set(mounted)
  const waiting = []

  const services = {
    llm: {
      listProviders: () => captured.routes.map(id => ({ id, name: id })),
      registerAdapter(routes, adapter) {
        captured.adapters.push({ routes, adapter })
        captured.routes.push(...routes)
        return Object.assign(() => {}, { replace: next => captured.registrations.push(next) })
      },
      registerConfigurableProviders(entries) { captured.configurable = entries; return () => {} },
      registerModelDiscovery(ns, fn) { captured.discovery = fn; return () => {} },
    },
    webServer: {
      register(route) { onRegister?.(route); captured.serverRoutes.push(route); return () => {} },
      port: 0,
      host: '127.0.0.1',
    },
    connection: { admit: () => undefined },
    attachments: { imageHostPath: () => undefined },
    timer: { interval: () => () => {} },
  }

  /** Services this composition has, minus the ones one fiber is allowed to read. */
  const withheldFor = names => Object.keys(services).filter(service => mountedSet.has(service) && !names.has(service))

  const base = {
    logger: {
      warn: m => logs.push(`warn ${m}`),
      info: m => logs.push(`info ${m}`),
      error: m => logs.push(`error ${m}`),
      debug: () => {},
      log: m => logs.push(`log ${m}`),
    },
    fiber: { entry: { options: { id: 'our-free-model' } } },
    get: name => (mountedSet.has(name) ? services[name] : undefined),
    on: event => { captured.events.push(event); return () => {} },
    emit: event => { captured.events.push(`emit:${event}`) },
    effect(fn, label) {
      try {
        const disposer = fn()
        if (typeof disposer === 'function') disposers.push(disposer)
        else if (disposer !== undefined && typeof disposer[Symbol.dispose] === 'function') disposers.push(() => disposer[Symbol.dispose]())
      } catch (error) {
        logs.push(`effect-error ${error?.message ?? error}`)
      }
      return { [Symbol.dispose]: () => {} }
    },
    /** Run a callback once every named service exists: cordis' nested fiber. */
    inject(deps, callback) {
      const names = new Set(deps)
      const launch = () => {
        try { callback(wrap(names)) } catch (error) { logs.push(`inject-error ${error?.message ?? error}`) }
      }
      if ([...names].every(name => mountedSet.has(name))) queueMicrotask(launch)
      else waiting.push({ names, launch })
      return { [Symbol.dispose]: () => {} }
    },
    __logs: logs,
    __captured: captured,
    __disposers: disposers,
    __waiting: waiting,
    /**
     * The service table, so a suite can give one of them real behaviour.
     * `connection.admit` answering "admitted" to everything is the difference
     * between a fence that ran and a fence that was skipped: a test that means to
     * check the admission decision has to be able to make it refuse.
     */
    __services: services,
    /** Let a service appear after load, the way `webServer` really does. */
    __mountService(name) {
      mountedSet.add(name)
      for (const [index, fiber] of [...waiting.entries()].reverse()) {
        if (![...fiber.names].every(dependency => mountedSet.has(dependency))) continue
        waiting.splice(index, 1)
        fiber.launch()
      }
    },
  }

  /** The context view one fiber gets: its declared services plus the guard. */
  const wrap = names => new Proxy(base, {
    get(target, key) {
      if (typeof key === 'string' && withheldFor(names).includes(key)) {
        throw new Error(`our-free-model read ctx.${key} without inject (cordis withholds it)`)
      }
      if (typeof key === 'string' && names.has(key) && mountedSet.has(key)) return services[key]
      return Reflect.get(target, key)
    },
    has(target, key) { return Reflect.has(target, key) },
  })

  return wrap(new Set(inject))
}

/** Minimal IncomingMessage stand-in: async-iterable body plus method/url headers. */
export class FakeRequest {
  constructor(method, url, body, headers) {
    this.method = method
    this.url = url
    this.headers = headers ?? { authorization: 'internal-api', host: '127.0.0.1:3000' }
    this.__body = body === undefined ? null : JSON.stringify(body)
  }

  [Symbol.asyncIterator]() {
    const value = this.__body === null ? [] : [Buffer.from(this.__body)]
    let index = 0
    return { next: async () => index < value.length ? { value: value[index++], done: false } : { done: true, value: undefined } }
  }
}

/**
 * A port nobody is holding, for a test that has to name one before the plugin
 * boots. A literal in a suite is a claim that no other process on the machine
 * wants it, which two suites running side by side — or one leftover listener from
 * an earlier run — promptly disprove: the plugin's bind failed, its error was
 * caught by design, and the suite then fetched a port someone else owned.
 */
export async function freePort() {
  const probe = http.createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address()
  await new Promise(resolve => probe.close(resolve))
  return port
}

/** Drive one request through a captured handler and parse the JSON answer. */
export async function callRoute(handler, method, url, body, headers) {
  let status = 0
  let payload = ''
  await handler(new FakeRequest(method, url, body, headers), {
    writeHead: code => { status = code },
    end: text => { payload = String(text ?? '') },
    get headersSent() { return status !== 0 },
  })
  try { return { status, json: JSON.parse(payload) } } catch { return { status, raw: payload.slice(0, 200) } }
}

/** Wait until `check()` says so, or give up and report the failure text. */
export async function until(check, { timeoutMs = 20000, intervalMs = 25, what = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // A probe that throws is not a satisfied condition; it is usually state the
    // plugin has not written yet (a file appears on the first flush).
    try {
      if (await check() === true) return true
    } catch { /* not yet */ }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error(`timed out waiting for ${what}`)
}
