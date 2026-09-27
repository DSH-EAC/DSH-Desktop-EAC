/**
 * Does the free lane reject tool names that are legal for the harness but not
 * for an OpenAI-style validator? The AIO install registers plugin tools with
 * dotted and non-ASCII names, and its turns fail with `[invalid_request_error]`
 * while a tool-free bench call to the same model succeeds.
 *
 * Run: node scripts/probes/tool-name-charset.mjs
 */

import { postStreamed, UpstreamError } from '../../src/http.js'
import { applyFingerprint, mintSessionId, mintRequestId } from '../../src/upstream.js'

const MODEL = 'space-bunny-free'

const fn = name => ({ type: 'function', function: { name, description: 'Echo a word.', parameters: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'] } } })

const CASES = [
  ['plain (control)', [fn('speak')]],
  ['dotted', [fn('webui.speak')]],
  ['colon', [fn('dsh-memory:inject')]],
  ['non-ascii', [fn('小鲸鱼记账')]],
  ['hyphen+digit', [fn('get-weather_v2')]],
  ['long 70 chars', [fn('a'.repeat(70))]],
  ['long 64 chars', [fn('b'.repeat(64))]],
]

for (const [label, tools] of CASES) {
  const body = { model: MODEL, messages: [{ role: 'user', content: 'say OK' }], stream: true, max_tokens: 16 }
  body.tools = tools
  applyFingerprint(body, false)
  let outcome
  try {
    await postStreamed({
      path: '/zen/v1/chat/completions',
      body,
      session: mintSessionId(),
      requestId: mintRequestId(),
      onData: () => {},
    })
    outcome = 'ACCEPTED'
  } catch (error) {
    const message = error instanceof UpstreamError ? error.message : String(error?.message ?? error)
    outcome = `REJECTED ${error?.status ?? ''}: ${message.slice(0, 90)}`
  }
  console.log(`${label.padEnd(16)} ${outcome}`)
}
