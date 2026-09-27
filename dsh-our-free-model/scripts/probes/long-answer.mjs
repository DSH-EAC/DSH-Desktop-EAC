/**
 * Evidence script (not part of the package, not a test): does a deliberately
 * long answer still finish, or is it cut by the ceiling the effort rung sends?
 *
 * Issue #2 was a truncation report, so the fix has to be measured with a real
 * long turn on the model it named. `balanced` sends 16 384 tokens on MiMo V2.6
 * Flash after the ladder was doubled; before, the same rung sent 8 192. The
 * prompt below produced 10 164 output tokens, so the old ceiling cut this exact
 * request with finish `length` and the new one let it end with `stop`.
 *
 * Run from the repository root: node scripts/probes/long-answer.mjs [light|balanced|deep]
 * It spends real quota on the free lane and takes minutes.
 */
import { buildCatalog } from '../../src/catalog.js'
import { FreeModelAdapter, ROUTE_MAIN } from '../../src/adapter.js'
import { budgetFor } from '../../src/effort.js'

const level = process.argv[2] ?? 'balanced'
const entry = buildCatalog(['mimo-v2.6-flash-free'])[0]
const settings = { enabled: true, defaultMaxTokens: 32768 }
const records = []
const adapter = new FreeModelAdapter({
  state: () => ({ catalog: [entry], membership: { [ROUTE_MAIN]: [entry.id] }, settings, attributionUserAgent: '' }),
  recordUsage: record => records.push(record),
  warn: message => console.log('warn:', message),
})

const PROMPT = '写一篇不少于 4000 个中文字符的长文，主题是「免费模型反向代理的工程难点」。'
  + '要求分 15 节，每节都必须给出一个具体的工程例子（含代码或协议字段名），不要写总结性结尾，把每一节写满。'

const started = Date.now()
let text = ''
let reasoning = 0
let usage
let finish
for await (const chunk of adapter.stream({
  provider: ROUTE_MAIN,
  model: entry.id,
  messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }] }],
  reasoningEffort: level,
  sessionId: `probes:long-answer:${level}:${Date.now()}`,
})) {
  if (chunk.type === 'text-delta') text += chunk.text
  if (chunk.type === 'reasoning-delta') reasoning += chunk.text.length
  if (chunk.type === 'usage') usage = chunk.usage
  if (chunk.type === 'finish') finish = chunk.reason
}

console.log(JSON.stringify({
  level,
  budget_sent: budgetFor(level, entry, undefined, settings.defaultMaxTokens),
  finish: finish?.kind,
  output_tokens: usage?.outputTokens ?? 0,
  reasoning_tokens: usage?.reasoningTokens ?? 0,
  answer_chars: [...text].length,
  reasoning_chars: reasoning,
  seconds: Math.round((Date.now() - started) / 1000),
  recorded_effort: records.at(-1)?.effort,
}, null, 2))
