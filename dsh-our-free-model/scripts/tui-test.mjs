/**
 * The plugin on a composition with no web server — the case issue #4 reported.
 *
 * `inject` used to name `webServer` and `timer` beside `llm`. Cordis withholds a
 * service the plugin does not declare and refuses to activate a plugin that
 * declares one the composition does not mount, so on dsh-tui — which has no HTTP
 * server to register against — the plugin never started and the free lane was
 * simply absent. The fix is the shape of the dependency list, not a try/catch:
 * only `llm` may be hard, and every feature that needs more has to degrade.
 *
 * Run: node scripts/tui-test.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chatFrames, fakeContext, freePort, stubUpstream, until } from './lib/fake-kernel.mjs'

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`)
}

const stub = await stubUpstream({ listing: ['mimo-v2.6-flash-free', 'space-bunny-free'], answer: () => ({ body: chatFrames('hello from the tui') }) })
process.env.OUR_FREE_MODEL_BASE = stub.base
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-tui-'))
process.env.DSH_HOME = scratch
fs.mkdirSync(path.join(scratch, 'our-free-model'), { recursive: true })
// A headless user has no settings page to click, so the file the plugin owns is
// the only way in — write the forward port on before the plugin boots. The port
// is taken from the ephemeral range rather than written down here: two suites
// running side by side used to collide on the literal, the plugin's bind failed
// (correctly, and quietly), and this file then fetched a port a *different*
// process owned — which answered nothing, and the suite hung until the runner
// killed it with nothing printed to say why.
const forwardPort = await freePort()
fs.writeFileSync(path.join(scratch, 'our-free-model', 'settings.json'), JSON.stringify({
  version: 1, enabled: true, forward: { enabled: true, host: '127.0.0.1', port: forwardPort },
}), { mode: 0o600 })

const { apply, inject } = await import('../index.js')
const { ROUTE_MAIN } = await import('../src/adapter.js')

check('only the model lane is a hard requirement', inject, ['llm'])

// Record what the background loops arm themselves with, since a composition
// without the timer service means plain timers instead of ctx.interval.
const realSetTimeout = globalThis.setTimeout
const armed = []
const unrefed = []
globalThis.setTimeout = (fn, ms, ...rest) => {
  const handle = realSetTimeout(fn, ms, ...rest)
  if (ms >= 60_000) armed.push(ms)
  const realUnref = handle.unref?.bind(handle)
  handle.unref = () => { unrefed.push(ms); return realUnref() }
  return handle
}

// Mounted: `llm` and nothing else. The fake throws if the plugin reads a service
// it did not declare, which is the defect that made the plugin wait forever.
const ctx = fakeContext({ inject, mounted: ['llm'] })
let bootError
try { apply(ctx, {}) } catch (error) { bootError = error }
globalThis.setTimeout = realSetTimeout

check('apply() survives a composition with no web server', bootError?.message ?? 'none', 'none')
const adapter = ctx.__captured.adapters[0]?.adapter
check('the adapter still registers', typeof adapter?.listModels, 'function')
check('the probe loop and the egress watch armed on plain timers', armed.sort((a, b) => a - b), [120_000, 900_000, 1_800_000])
check('the probe loop and the egress watch armed on plain timers', armed.sort((a, b) => a - b), [120_000, 900_000, 1_800_000])
// Compared by period, not by count: `armed` holds the three long loops while
// `unrefed` also holds the 40-second and 50-millisecond one-shots, so a count
// comparison stayed true after any one of the three stopped unref'ing itself —
// which is the one property that decides whether the plugin can hold the app
// open past exit.
check('and every one of them is unref’d, so the plugin cannot hold the app open',
  armed.filter(ms => !unrefed.includes(ms)), [])
check('the dashboard half is the only thing left waiting', ctx.__captured.serverRoutes.length, 0)
check('it waits for a service rather than running without one', ctx.__waiting.map(fiber => [...fiber.names]), [['webServer']])

// The web composition has the same problem in mirror image: `webServer` is not
// provided yet while plugins load, so a one-shot read of it at apply time mounted
// no routes at all and the settings page had no data source behind a running web
// server. This is that arrival, late.
ctx.__mountService('webServer')
await until(() => ctx.__captured.serverRoutes.length >= 2, { what: 'the dashboard fiber to run once the server exists' })
check('the settings API mounts when the service does', ctx.__captured.serverRoutes.map(route => route.path).sort(),
  ['/api/our-free-model', '/api/our-free-model/events'])

await until(() => fs.existsSync(path.join(scratch, 'our-free-model', 'availability.json')), { what: 'the boot probe to land' })

const models = await adapter.listModels(ROUTE_MAIN)
check('the picker still gets its models', models.map(model => model.id).sort(), ['mimo-v2.6-flash-free', 'space-bunny-free'])
check('with the capacities the composer shows', models[0].description.includes('context'), true)
const resolved = await adapter.resolveModel(ROUTE_MAIN, 'mimo-v2.6-flash-free')
check('and a model resolves with its effort menu', resolved.reasoning.efforts.map(row => row.id), ['light', 'balanced', 'deep'])

/** One streamed turn through the adapter, the way the harness drives it. */
const chunks = []
for await (const chunk of adapter.stream({
  provider: ROUTE_MAIN,
  model: 'mimo-v2.6-flash-free',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  sessionId: 'tui:one',
})) chunks.push(chunk)
check('a turn streams', chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join(''), 'hello from the tui')
check('and finishes', chunks.find(chunk => chunk.type === 'finish')?.reason, { kind: 'stop' })

const forward = await fetch(`http://127.0.0.1:${forwardPort}/v1/models`, { headers: { authorization: 'Bearer local-test-key' } })
check('the forward listener came up without a web server', forward.status, 401)
const key = JSON.parse(fs.readFileSync(path.join(scratch, 'our-free-model', 'settings.json'), 'utf8')).forwardKey
const rows = await (await fetch(`http://127.0.0.1:${forwardPort}/v1/models`, { headers: { authorization: `Bearer ${key}` } })).json()
check('and lists the usable models with the real key', rows.data.map(row => row.id).sort(), ['mimo-v2.6-flash-free', 'space-bunny-free'])
const answered = await (await fetch(`http://127.0.0.1:${forwardPort}/v1/chat/completions`, {
  method: 'POST',
  headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'space-bunny-free', messages: [{ role: 'user', content: 'hi' }] }),
})).json()
check('a non-streaming call answers', String(answered.choices?.[0]?.message?.content ?? ''), 'hello from the tui')
check('usage comes back in the OpenAI spelling the caller reads', [answered.usage?.prompt_tokens, answered.usage?.completion_tokens], [11, 7])

// A turn the lane refuses must not arrive as an empty 200.
stub.api.refuseAll = true
const refused = await fetch(`http://127.0.0.1:${forwardPort}/v1/chat/completions`, {
  method: 'POST',
  headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'space-bunny-free', messages: [{ role: 'user', content: 'hi' }] }),
})
const refusedBody = await refused.json()
check('a refused forward call is a failure', refused.status, 502)
check('and says what the gateway said', /unavailable/i.test(refusedBody.error?.message ?? ''), true)
stub.api.refuseAll = false

// The same refusal on the streaming side, where the status line was already spent
// on the SSE headers: it has to say so in the body rather than close the stream as
// though the model had answered with an empty turn.
stub.api.refuseAll = true
const streamedRefusal = await fetch(`http://127.0.0.1:${forwardPort}/v1/chat/completions`, {
  method: 'POST',
  headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'space-bunny-free', messages: [{ role: 'user', content: 'hi' }], stream: true }),
})
const streamedText = await streamedRefusal.text()
check('a refused streaming call carries an error frame', /"error"/.test(streamedText), true)
check('and not a clean stop', /finish_reason":"stop/.test(streamedText), false)
stub.api.refuseAll = false

for (const dispose of ctx.__disposers.reverse()) dispose()
await stub.close()
fs.rmSync(scratch, { recursive: true, force: true })
console.log(failures === 0 ? '\ntui: the lane works with no browser half' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
