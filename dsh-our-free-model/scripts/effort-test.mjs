/**
 * Proves the effort ladder is the budget the plugin really sends, and that the
 * rung it records is the rung it sent.
 *
 * Reported in issue #2: on `mimo-v2.6-flash-free` thinking cannot be switched
 * off, so the balanced rung's 8192 tokens were one ceiling shared by thinking
 * and the visible answer — 82% of one day's output tokens on that model were
 * reasoning, which left about 1500 tokens of answer and ended long turns with
 * finish `length` every few minutes. The live selftest reproduced it before the
 * change: `light` (2048) truncated on a two-sentence puzzle.
 *
 * Run: node scripts/effort-test.mjs
 */
import { chatFrames, stubUpstream } from './lib/fake-kernel.mjs'

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`)
}

/**
 * The gateway stand-in goes up before the plugin modules are imported, because
 * `src/upstream.js` reads `OUR_FREE_MODEL_BASE` once, at import time — a static
 * import of anything downstream of it would pin the real host.
 */
const stub = await stubUpstream({ listing: ['mimo-v2.6-flash-free'], answer: () => ({ body: chatFrames('done') }) })
process.env.OUR_FREE_MODEL_BASE = stub.base
const { MIN_BUDGET, budgetFor, budgetLadder, resolveLevel } = await import('../src/effort.js')
const { buildCatalog } = await import('../src/catalog.js')
const { FreeModelAdapter, ROUTE_MAIN } = await import('../src/adapter.js')

const catalog = id => buildCatalog([id])[0]
const MIMO = catalog('mimo-v2.6-flash-free')
const MUSE = catalog('muse-spark-1.3-contributor-free')
const UNION = catalog('union-alpha')
const DEFAULTS = 32768

check('the catalog still records that mimo cannot think nothing', MIMO.canDisableThinking, false)
check('muse spark can', MUSE.canDisableThinking, true)

// ── the ladder as the settings page and the picker see it ────────────────────
check('mimo rungs double the shared ceiling', budgetLadder(MIMO, undefined, DEFAULTS).map(row => row.tokens), [4096, 16384, 32768])
check('muse spark keeps the published rungs', budgetLadder(MUSE, undefined, DEFAULTS).map(row => row.tokens), [2048, 8192, 32768])
check('a model with no effort menu spends its whole window on the answer',
  budgetLadder(UNION, undefined, DEFAULTS).map(row => row.tokens), [32768, 32768, 32768])
check('the default rung is marked, so the page cannot pick a different one',
  budgetLadder(MIMO, undefined, DEFAULTS).map(row => row.isDefault), [false, true, false])

const ladder = budgetLadder(MIMO, undefined, DEFAULTS).map(row => row.tokens)
check('the ladder climbs', ladder.every((value, index) => index === 0 || value >= ladder[index - 1]), true)
check('balanced really moved', ladder[1] > 8192, true)

// ── the terms that cap it ────────────────────────────────────────────────────
check('the session ceiling wins over the rung', budgetFor('deep', MIMO, 4000, DEFAULTS), 4000)
check('the plugin default wins over the model capacity', budgetFor('deep', MIMO, undefined, 12000), 12000)
check('a rung never rises above capacity', budgetFor('balanced', MIMO, undefined, 8192), 8192)
check('and never falls below what an answer needs', budgetFor('deep', { maxOutput: 256, reasoning: true }, undefined, undefined), MIN_BUDGET)

// The two ways a ceiling stops being a number. The settings page's own cleared
// input field posts `Number('') || 0`, and a 0 ceiling is not "no ceiling":
// `min(capacity, 0)` came out as the 512-token floor on every model, while the
// picker went on advertising the 4 K / 16 K / 32 K ladder above it.
check('a zero default ceiling reads as unset, not as the floor', budgetFor('balanced', MIMO, undefined, 0), 16384)
check('so does a negative one', budgetFor('balanced', MIMO, undefined, -1), 16384)
check('and one typed rather than chosen', budgetFor('balanced', MIMO, undefined, 'abc'), 16384)
check('while a ceiling that is a number still binds', budgetFor('balanced', MIMO, undefined, 6000), 6000)
check('the same holds for the session’s own maxTokens', budgetFor('balanced', MIMO, 0, DEFAULTS), 16384)
check('an unknown rung resolves to the menu default rather than to no ceiling',
  budgetFor('turbo', MIMO, undefined, DEFAULTS), budgetFor('balanced', MIMO, undefined, DEFAULTS))

// ── the rung in force, which is what gets recorded ───────────────────────────
check('no rung on a menu model means the default rung', resolveLevel(undefined, MIMO)?.id, 'balanced')
check('a rung on a model with no menu is not applied', resolveLevel('light', UNION), undefined)
check('a stale rung name still resolves to the default', resolveLevel('maximum', MIMO)?.id, 'balanced')

// ── what goes on the wire, through the real adapter ─────────────────────────
const entry = MIMO
const records = []
const adapter = new FreeModelAdapter({
  state: () => ({ catalog: [entry], membership: { [ROUTE_MAIN]: [entry.id] }, settings: { enabled: true, defaultMaxTokens: DEFAULTS }, attributionUserAgent: 'test/1.0' }),
  recordUsage: record => records.push(record),
  warn: () => {},
})

/** Send one turn and report the `max_tokens` the adapter put on the request. */
async function sentBudget(options) {
  const before = stub.requests.length
  for await (const chunk of adapter.stream({ provider: ROUTE_MAIN, model: entry.id, messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], ...options })) void chunk
  return stub.requests[before].body
}

check('balanced sends the doubled rung ceiling', (await sentBudget({ reasoningEffort: 'balanced' })).max_tokens, 16384)
check('light sends its doubled rung', (await sentBudget({ reasoningEffort: 'light' })).max_tokens, 4096)
check('deep sends the whole window', (await sentBudget({ reasoningEffort: 'deep' })).max_tokens, 32768)
check('a caller that names no rung gets the default one, not an unbounded call',
  (await sentBudget({})).max_tokens, 16384)
check('the recorded effort is the rung that ran', records.at(-1).effort, 'balanced')

await sentBudget({ reasoningEffort: 'light' })
check('a named rung is recorded as itself', records.at(-1).effort, 'light')
await sentBudget({ reasoningEffort: 'turbo' })
check('a rung the plugin does not declare is recorded as the default it became', records.at(-1).effort, 'balanced')

await stub.close()
console.log(failures === 0 ? '\neffort: the ladder is the budget' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
