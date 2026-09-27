/**
 * Does replaying a tool call whose result never arrived (or arrived as an error)
 * make the free lane reject the request?
 *
 * The AIO session that started failing had one crashed turn: the model emitted a
 * Bash tool call, the tool itself failed to start, and the turn aborted. Every
 * later request in that session replays that dangling call.
 *
 * Run: node scripts/probes/dangling-tool-call.mjs
 */

import { postStreamed, UpstreamError } from '../../src/http.js'
import { applyFingerprint, mintSessionId, mintRequestId } from '../../src/upstream.js'

const MODEL = 'space-bunny-free'
const CALL = { id: 'call_test_1', type: 'function', function: { name: 'bash', arguments: '{"command":"ls"}' } }

const CASES = [
  ['control: plain', [{ role: 'user', content: 'say OK' }]],
  ['paired tool result', [
    { role: 'user', content: 'list files' },
    { role: 'assistant', content: '', tool_calls: [CALL] },
    { role: 'tool', tool_call_id: 'call_test_1', content: 'a.txt b.txt' },
    { role: 'user', content: 'thanks, say OK' },
  ]],
  ['dangling: no tool result', [
    { role: 'user', content: 'list files' },
    { role: 'assistant', content: '', tool_calls: [CALL] },
    { role: 'user', content: 'say OK instead' },
  ]],
  ['dangling: null content on assistant', [
    { role: 'user', content: 'list files' },
    { role: 'assistant', tool_calls: [CALL] },
    { role: 'user', content: 'say OK instead' },
  ]],
]

for (const [label, messages] of CASES) {
  const body = { model: MODEL, messages, stream: true, max_tokens: 64 }
  applyFingerprint(body, false)
  let outcome
  try {
    await postStreamed({
      path: '/zen/v1/chat/completions', body,
      session: mintSessionId(), requestId: mintRequestId(), onData: () => {},
    })
    outcome = 'ACCEPTED'
  } catch (error) {
    const message = error instanceof UpstreamError ? error.message : String(error?.message ?? error)
    outcome = `REJECTED ${error?.status ?? ''}: ${message.slice(0, 100)}`
  }
  console.log(`${label.padEnd(32)} ${outcome}`)
}
