/**
 * Standalone harness for the plugin's Host half: mounts `apply()` against a fake
 * cordis context implementing just enough of `llm`, `webServer` and the timer
 * surface, then drives the adapter, the settings API and the forward listener
 * against the live gateway.
 *
 * Run: node scripts/host-selftest.mjs [--model <id>] [--skip-effort]
 */
import { apply, ANNOUNCEMENT_VERSION } from '../index.js'

const logs = []
const captured = { adapters: [], routes: [], registrations: [], events: [], configurable: null, discovery: null }
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}

function fakeContext() {
  const ctx = {
    logger: {
      warn: m => logs.push(`warn ${m}`),
      info: m => logs.push(`info ${m}`),
      error: m => logs.push(`error ${m}`),
      debug: () => {},
      log: m => logs.push(`log ${m}`),
    },
    fiber: { entry: { options: { id: 'our-free-model' } } },
    // `llm` is the only service the plugin declares; everything optional is
    // reached through get(), so a fake that answers nothing would silently take
    // the headless path and skip the settings-API and forward-port checks below.
    get: name => (name === 'webServer' ? ctx.webServer : undefined),
    on: event => { captured.events.push(event); return () => {} },
    emit: event => { captured.events.push(`emit:${event}`) },
    effect: fn => { try { fn() } catch (e) { logs.push(`effect-error ${e.message}`) } return { [Symbol.dispose]: () => {} } },
    /**
     * cordis' nested fiber: run a callback once the named services exist, on a
     * context that can read exactly them. This composition has all of them, and
     * unlike the real loader this harness wants the routes registered before the
     * first line of checks runs — so it is called inline. `scripts/tui-test.mjs`
     * is where the service-arrives-late case is modelled, against the shared
     * fake in `scripts/lib/fake-kernel.mjs`.
     */
    inject(deps, callback) {
      const scoped = Object.create(ctx)
      for (const name of deps) scoped[name] = ctx[name]
      callback(scoped)
      return { [Symbol.dispose]: () => {} }
    },
    interval: () => () => {},
    timeout: () => () => {},
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
    webServer: { register: route => { ctx.__routes.push(route); return () => {} }, port: 0, host: '127.0.0.1' },
    __routes: [],
  }
  return ctx
}

/** A minimal IncomingMessage stand-in: async-iterable body + method/url headers. */
class Readable_stub {
  constructor(method, url, body) {
    this.method = method
    this.url = url
    // A loopback Host is what the trust fence requires of every caller; the
    // stub plays the part of the app's own web page.
    this.headers = { authorization: 'internal-api', host: '127.0.0.1:3000' }
    this.__body = body === undefined ? null : JSON.stringify(body)
  }

  [Symbol.asyncIterator]() {
    const value = this.__body === null ? [] : [Buffer.from(this.__body)]
    let index = 0
    return { next: async () => index < value.length ? { value: value[index++], done: false } : { done: true, value: undefined } }
  }
}

const ctx = fakeContext()
apply(ctx, {})

/** Drive one request through the mounted prefix route and parse the JSON. */
const call = async (method, url, body) => {
  let status = 0, payload = ''
  const req = new Readable_stub(method, url, body)
  const res = {
    writeHead: code => { status = code },
    end: text => { payload = String(text ?? '') },
    get headersSent() { return status !== 0 },
  }
  await ctx.__routes[0].handler(req, res)
  try { return { status, json: JSON.parse(payload) } } catch { return { status, raw: payload.slice(0, 200) } }
}

// Let the boot refresh finish: listing + a full availability probe.
const deadline = Date.now() + 120000
while (Date.now() < deadline && !(captured.adapters.length > 0 && ctx.__routes.length > 0)) {
  await new Promise(resolve => setTimeout(resolve, 500))
}
// Groups are snapshotted below, so wait until the first probe has landed — a
// picker captured mid-probe would show the fallback catalog and stale grouping.
while (Date.now() < deadline) {
  const summary = await call('GET', '/api/our-free-model/summary').catch(() => ({ json: null }))
  if (summary.json?.probedAt > 0 && Array.isArray(summary.json?.catalog) && summary.json.catalog.length > 0) break
  await new Promise(resolve => setTimeout(resolve, 1000))
}
const boot = captured.adapters[0]
if (boot === undefined) { console.log('FAIL: adapter never registered\n' + logs.join('\n')); process.exit(1) }
const adapter = boot.adapter
console.log('registered routes :', boot.routes.join(', '))
console.log('configurable      :', JSON.stringify(captured.configurable))
console.log('webServer routes  :', ctx.__routes.map(r => `${r.kind} ${r.path}`).join(', '))

const groups = {}
for (const route of boot.routes) groups[route] = await adapter.listModels(route)
console.log('\n=== picker groups as the app will render them ===')
for (const [route, models] of Object.entries(groups)) {
  console.log(`\n[${adapter.providerInfo(route).name}]  (${models.length})`)
  for (const m of models) console.log(`   ${m.name.padEnd(24)} ${m.id.padEnd(32)} ${m.inputModalities.join('+')}  | ${m.description}`)
}

const preferred = arg('model', 'space-bunny-free')
const flat = Object.entries(groups).flatMap(([route, models]) => models.map(m => ({ route, ...m })))
const target = flat.find(entry => entry.id === preferred && entry.route === 'our-free-model')
  ?? flat.find(entry => entry.route === 'our-free-model')
if (target === undefined) { console.log('\nno usable model'); console.log(logs.join('\n')); process.exit(1) }

console.log(`\n=== 1. plain chat (${target.id}) ===`)
async function drive(messages, options = {}) {
  const started = Date.now()
  let firstToken = 0
  const chunks = []
  for await (const chunk of adapter.stream({
    provider: options.route ?? target.route,
    model: options.model ?? target.id,
    messages,
    sessionId: options.sessionId ?? 'selftest',
    ...options.tools === undefined ? {} : { tools: options.tools },
    ...options.effort === undefined ? {} : { reasoningEffort: options.effort },
  }, null, undefined)) {
    if ((chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') && firstToken === 0) firstToken = Date.now() - started
    chunks.push(chunk)
  }
  return {
    chunks,
    text: chunks.filter(c => c.type === 'text-delta').map(c => c.text).join(''),
    reasoning: chunks.filter(c => c.type === 'reasoning-delta').map(c => c.text).join('').length,
    tools: chunks.filter(c => c.type === 'block-end' && c.block?.type === 'tool-call').map(c => c.block),
    usage: chunks.find(c => c.type === 'usage')?.usage,
    finish: chunks.find(c => c.type === 'finish')?.reason,
    ttft: firstToken,
    total: Date.now() - started,
  }
}

let r = await drive([{ role: 'user', content: 'What is 17*23? Reply with just the number.' }], { sessionId: 'selftest:math' })
console.log(`  text=${JSON.stringify(r.text)} finish=${r.finish?.kind} usage=${JSON.stringify(r.usage)} ttft=${r.ttft}ms`)

console.log('\n=== 2. tool calling (multi-round) ===')
const TOOLS = [{ name: 'get_weather', description: 'Get the weather for a city', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }]
r = await drive([{ role: 'user', content: 'What is the weather in Shanghai? You must call the get_weather tool and wait for its result before answering.' }], { sessionId: 'selftest:tool1', tools: TOOLS })
console.log(`  toolCalls=${JSON.stringify(r.tools)} finish=${r.finish?.kind}`)
if (r.tools.length > 0) {
  const call = r.tools[0]
  const r2 = await drive([
    { role: 'user', content: 'What is the weather in Shanghai? You must call the get_weather tool.' },
    { role: 'assistant', content: [], source: { kind: 'model' }, ...{ content: [{ type: 'tool-call', id: call.id, name: call.name, arguments: call.arguments }] } },
    { role: 'tool', content: [{ type: 'text', text: '{"temp":22,"cond":"sunny"}' }], toolCallId: call.id, source: { kind: 'tool', callId: call.id } },
  ], { sessionId: 'selftest:tool2', tools: TOOLS })
  console.log(`  round2 finish=${r2.finish?.kind} text=${JSON.stringify(r2.text.slice(0, 120))}`)
}

console.log('\n=== 3. effort budget must bind monotonically ===')
const HARD = 'Two trains 300km apart approach at 60 and 90 km/h. A bird flies 120 km/h between them until they meet. How far does the bird travel? Also list every assumption you are making and double check each one.'
if (argv.includes('--skip-effort')) console.log('  skipped')
else for (const effort of ['light', 'balanced', 'deep']) {
  const e = await drive([{ role: 'user', content: HARD }], { sessionId: `selftest:effort:${effort}`, effort })
  console.log(`  ${effort.padEnd(9)} reasoning_tokens=${String(e.usage?.reasoningTokens ?? '?').padStart(5)} output=${String(e.usage?.outputTokens ?? '?').padStart(5)} finish=${e.finish?.kind} ttft=${e.ttft}ms total=${e.total}ms`)
}

console.log('\n=== 4. vision input (image block) ===')
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
r = await drive([{ role: 'user', content: [
  { type: 'text', text: 'Name the single colour of this image in one word.' },
  { type: 'image', attachment: { attachmentId: 'synthetic', mediaType: 'image/png', bytes: 68, width: 1, height: 1, url: `data:image/png;base64,${PNG_1X1}` } },
] }], { sessionId: 'selftest:vision' })
console.log(`  finish=${r.finish?.kind} text=${JSON.stringify(r.text.slice(0, 60))} failure=${JSON.stringify(r.finish?.failure?.message ?? '')}`)

console.log('\n=== 5. region-gated model surfaces as its own group ===')
const region = groups['our-free-model-region'] ?? []
if (region.length === 0) console.log('  (none on this egress)')
else {
  const blocked = region[0]
  const e = await drive([{ role: 'user', content: 'hi' }], { route: 'our-free-model-region', model: blocked.id, sessionId: 'selftest:region' })
  console.log(`  ${blocked.id} -> finish=${e.finish?.kind} code=${e.finish?.failure?.code} msg=${JSON.stringify((e.finish?.failure?.message ?? '').slice(0, 70))}`)
}

console.log('\n=== 6. settings API through the mounted webServer route ===')
const handler = ctx.__routes[0]?.handler
if (handler === undefined) console.log('  no route registered')
else {
  const summary = await call('GET', '/api/our-free-model/summary')
  console.log(`  GET  /summary  -> ${summary.status} models=${summary.json?.catalog?.length} egress=${JSON.stringify(summary.json?.egress)} probedAt=${summary.json?.probedAt > 0}`)
  const stats = await call('GET', '/api/our-free-model/stats')
  console.log(`  GET  /stats    -> ${stats.status} requests=${stats.json?.requests} models=${stats.json?.models?.length} days=${stats.json?.days?.length}`)
  const announce = await call('GET', '/api/our-free-model/announcement')
  console.log(`  GET  /announcement -> ${announce.status} version=${announce.json?.version === ANNOUNCEMENT_VERSION} ack=${announce.json?.acknowledged}`)
  const bench = await call('POST', '/api/our-free-model/bench', { model: target.id, effort: 'light' })
  console.log(`  POST /bench    -> ${bench.status} ${JSON.stringify(bench.json?.ttftMs ?? bench.json?.error)}ms ttft, ${bench.json?.tokensPerSecond === null ? 'no measurable rate' : JSON.stringify(bench.json?.tokensPerSecond)} tok/s`)

  console.log('\n--- 6b. the new distribution surface (meta / announcements / update) ---')
  const meta = await call('GET', '/api/our-free-model/meta')
  console.log(`  GET  /meta          -> ${meta.status} version=${JSON.stringify(meta.json?.version)} generation=${meta.json?.generation}`)
  const anns = await call('GET', '/api/our-free-model/announcements')
  console.log(`  GET  /announcements -> ${anns.status} items=${anns.json?.items?.length} unread=${anns.json?.unread} error=${JSON.stringify(anns.json?.error?.slice(0, 60) ?? '')}`)
  const refreshed = await call('POST', '/api/our-free-model/announcements/refresh')
  console.log(`  POST /announcements/refresh -> ${refreshed.status} items=${refreshed.json?.view?.items?.length} fetchedAt=${refreshed.json?.view?.fetchedAt > 0}`)
  const withArrivals = refreshed.json?.view?.items?.length > 0
  if (withArrivals) {
    const acked = await call('POST', '/api/our-free-model/announcements/ack', { id: refreshed.json.view.items[0].id })
    console.log(`  POST /announcements/ack -> ${acked.status} unread=${acked.json?.view?.unread}`)
  }
  const fence = await (async () => {
    const res = { status: 0, body: '', writeHead: code => { res.status = code }, end: text => { res.body = String(text ?? '') }, get headersSent() { return res.status !== 0 } }
    const hostile = new Readable_stub('GET', '/api/our-free-model/summary')
    hostile.headers = { host: 'evil.example:3000', origin: 'http://evil.example:3000' }
    await handler(hostile, res)
    return res.status
  })()
  console.log(`  GET  /summary from a non-loopback Host -> ${fence} (must be 403)`)
  const update = await call('GET', '/api/our-free-model/update/status')
  console.log(`  GET  /update/status -> ${update.status} current=${JSON.stringify(update.json?.current)} latest=${JSON.stringify(update.json?.latest)} err=${JSON.stringify(update.json?.error?.slice(0, 60) ?? '')}`)
}

console.log('\n=== 7. forward listener (OpenAI compatible) ===')
const turnedOn = await (async () => {
  const res = { writeHead: () => {}, end: () => {}, get headersSent() { return true } }
  await ctx.__routes[0].handler(new Readable_stub('POST', '/api/our-free-model/settings', { forward: { enabled: true, host: '127.0.0.1', port: 18923 } }), res)
  await new Promise(resolve => setTimeout(resolve, 1500))
  return summary2()
})()
async function summary2() {
  const res = { status: 0, body: '' }
  await ctx.__routes[0].handler(new Readable_stub('GET', '/api/our-free-model/summary'), { writeHead: c => { res.status = c }, end: t => { res.body = String(t) } })
  return JSON.parse(res.body)
}
console.log(`  forward: running=${turnedOn.settings?.forward?.running} port=${turnedOn.settings?.forward?.actualPort} err=${JSON.stringify(turnedOn.settings?.forward?.error ?? '')}`)
if (turnedOn.settings?.forward?.running === true) {
  const keyRes = { status: 0, body: '' }
  await ctx.__routes[0].handler(new Readable_stub('GET', '/api/our-free-model/forward/key'), { writeHead: c => { keyRes.status = c }, end: t => { keyRes.body = String(t) } })
  const key = JSON.parse(keyRes.body).key
  const base = `http://127.0.0.1:${turnedOn.settings.forward.actualPort}`
  const models = await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${key}` } })
  const modelList = await models.json()
  console.log(`  GET  ${base}/v1/models -> ${models.status} ${modelList.data?.length} models: ${modelList.data?.slice(0, 3).map(m => m.id).join(', ')}`)
  const noAuth = await fetch(`${base}/v1/models`)
  console.log(`  GET  /v1/models without key -> ${noAuth.status} (must be 401)`)
  const stream = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: target.id, messages: [{ role: 'user', content: 'Say FORWARD-OK' }], stream: true }),
  })
  const raw = await stream.text()
  console.log(`  POST /v1/chat/completions (stream) -> ${stream.status}`)
  console.log(`       ${raw.split('\n').filter(l => l.startsWith('data:')).slice(0, 2).join('\n       ').slice(0, 220)}`)
  const block = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: target.id, messages: [{ role: 'user', content: 'What is 9*9? number only' }] }),
  })
  const bj = await block.json()
  console.log(`  POST /v1/chat/completions (json)  -> ${block.status} content=${JSON.stringify(bj.choices?.[0]?.message?.content ?? bj.error)}`)
}

console.log('\n--- last logs ---')
console.log(logs.slice(-14).join('\n'))
// The stores coalesce writes for 800 ms; exiting now would drop the very file
// this run is meant to leave behind for inspection.
await new Promise(resolve => setTimeout(resolve, 1200))
process.exit(0)
