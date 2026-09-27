/**
 * Proves the pairing repair: the same history the free lane rejects with
 * `400 [invalid_request_error]` must be accepted once unanswered tool calls are
 * dropped. Runs the real converter chain against the real upstream.
 *
 * Run: node scripts/probes/pairing-repair.mjs
 */

import { postStreamed, UpstreamError } from '../../src/http.js'
import { applyFingerprint, mintSessionId, mintRequestId } from '../../src/upstream.js'
import { toChatMessages, repairToolPairing } from '../../src/messages.js'

const MODEL = 'space-bunny-free'
const CALL = { type: 'tool-call', id: 'call_dangling_1', name: 'bash', arguments: '{"command":"ls"}' }

const BROKEN = [
  { role: 'user', content: [{ type: 'text', text: '列出文件' }] },
  { role: 'assistant', content: [CALL] },
  { role: 'user', content: [{ type: 'text', text: '只回答 OK' }] },
]

const PAIRED = [
  { role: 'user', content: [{ type: 'text', text: '列出文件' }] },
  { role: 'assistant', content: [CALL] },
  { role: 'tool', toolCallId: 'call_dangling_1', content: [{ type: 'text', text: 'a.txt' }] },
  { role: 'user', content: [{ type: 'text', text: '只回答 OK' }] },
]

async function ask(label, harnessMessages) {
  const body = {
    model: MODEL,
    messages: toChatMessages(harnessMessages, undefined, []),
    stream: true,
    max_tokens: 64,
  }
  applyFingerprint(body, false)
  try {
    await postStreamed({
      path: '/zen/v1/chat/completions', body,
      session: mintSessionId(), requestId: mintRequestId(), onData: () => {},
    })
    console.log(`${label.padEnd(34)} ACCEPTED`)
    return true
  } catch (error) {
    const message = error instanceof UpstreamError ? error.message : String(error?.message ?? error)
    console.log(`${label.padEnd(34)} REJECTED ${error?.status ?? ''}: ${message.slice(0, 70)}`)
    return false
  }
}

// The repair must be inert on history that is already well formed.
const pairedUntouched = JSON.stringify(repairToolPairing(PAIRED)) === JSON.stringify(PAIRED)
console.log(`repair leaves valid history alone: ${pairedUntouched ? 'yes' : 'NO — regression'}`)
console.log(`repair drops the unanswered call : ${JSON.stringify(repairToolPairing(BROKEN).map(m => m.role))}`)

const rejectedRaw = await ask('raw dangling history', BROKEN)
const acceptedRepaired = await ask('after repairToolPairing', repairToolPairing(BROKEN))

const ok = !rejectedRaw && acceptedRepaired && pairedUntouched
console.log(ok
  ? '\npairing-repair: broken history now sends cleanly'
  : `\npairing-repair: FAILED (rawAccepted=${rejectedRaw} repairedAccepted=${acceptedRepaired} untouched=${pairedUntouched})`)
process.exit(ok ? 0 : 1)
