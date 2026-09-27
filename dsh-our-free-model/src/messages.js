/**
 * Harness message vocabulary <-> upstream wire shapes, plus the SSE readers that
 * turn provider events back into harness `StreamChunk`s.
 *
 * Three provider shapes are in play because the free lane is not one API:
 * `chat` (OpenAI Chat Completions), `responses` (OpenAI Responses) and
 * `messages` (Anthropic Messages). Which one a model answers on is fixed by
 * {@link module:src/upstream~endpointFor}.
 *
 * @module src/messages.js
 */

import { MAX_TOOL_NAME_LEN, baseModelId, restoreToolName } from './upstream.js'

/** Content types an image lane can carry, matched against the verified media type. */
const IMAGE_MEDIA = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** Text of a content block list, joining every text-bearing block. */
function textOf(blocks) {
  const parts = []
  for (const block of blocks ?? []) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

/**
 * Normalise a message's content into a block list.
 *
 * The harness always supplies blocks, but this projector is reused by the forward
 * listener, where an OpenAI caller legitimately sends a bare string.
 */
function blocksOf(content) {
  if (typeof content === 'string') return content === '' ? [] : [{ type: 'text', text: content }]
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return { type: 'text', text: part }
      if (part?.type === 'text' || part?.type === 'input_text' || part?.type === 'output_text') return { type: 'text', text: String(part.text ?? '') }
      return part
    }).filter(block => block !== null && typeof block === 'object')
  }
  return []
}

function hasBlocks(blocks, type) {
  return Array.isArray(blocks) && blocks.some(block => block?.type === type)
}

/**
 * Drop tool calls that were never answered, and answers with no call.
 *
 * Every supported wire enforces that a tool call is followed by its result, and
 * a turn interrupted between the two — the tool failed to start, the user
 * aborted, the harness crashed — leaves exactly that in the durable history.
 * Replaying it is not merely untidy: the free lane answers `400
 * [invalid_request_error]`, which then fails every later turn in that session,
 * not just the one that broke. Repairing here covers all three wires at once.
 */
export function repairToolPairing(messages) {
  const list = messages ?? []
  const answered = new Set()
  for (const message of list) {
    if (message?.role !== 'tool') continue
    const id = callIdOf(message)
    if (id) answered.add(id)
  }

  const keptCalls = new Set()
  const out = []
  for (const message of list) {
    if (message?.role === 'tool') {
      // Resolvable here because a call always precedes its own answer.
      const id = callIdOf(message)
      if (id !== null && keptCalls.has(id)) out.push(message)
      continue
    }
    if (message?.role !== 'assistant') {
      out.push(message)
      continue
    }
    const blocks = blocksOf(message.content)
    const toolBlocks = blocks.filter(block => block?.type === 'tool-call')
    const calls = toolBlocks.filter(block => answered.has(String(block.id ?? '')))
    for (const call of calls) keptCalls.add(String(call.id))
    if (calls.length === toolBlocks.length) {
      // Untouched when nothing was dropped, including the all-text case.
      if (calls.length > 0 || blocks.some(block => block?.type === 'text' && block.text)) out.push(message)
      continue
    }
    if (calls.length === 0) {
      // An assistant turn whose only content was calls that never landed says
      // nothing the model may keep believing.
      if (blocks.some(block => block?.type === 'text' && block.text)) out.push(message)
      continue
    }
    out.push({ ...message, content: blocks.filter(block => block?.type !== 'tool-call' || calls.includes(block)) })
  }

  return out
}

function callIdOf(message) {
  const id = String(message?.toolCallId ?? message?.source?.callId ?? '')
  return id === '' ? null : id
}

/**
 * Project harness messages onto OpenAI Chat Completions.
 *
 * Assistant reasoning is never replayed upstream; only visible text and tool
 * calls are. Tool results are first-class `role: 'tool'` messages keyed by the
 * provider call id they answer.
 */
export function toChatMessages(messages, resolveImage, warnings) {
  const out = []
  for (const message of messages ?? []) {
    const blocks = blocksOf(message.content)
    switch (message.role) {
      case 'system':
      case 'developer': {
        const text = textOf(blocks)
        if (text) out.push({ role: 'system', content: text })
        break
      }
      case 'user': {
        const parts = []
        for (const block of blocks) {
          if (block?.type === 'text' && block.text) parts.push({ type: 'text', text: block.text })
          else if (block?.type === 'image') {
            const url = block.offloaded === true ? undefined : (resolveImage?.(block.attachment) ?? (typeof block.attachment?.url === 'string' ? block.attachment.url : undefined))
            if (url !== undefined) parts.push({ type: 'image_url', image_url: { url } })
            else if (warnings) warnings.push('image-dropped')
          }
        }
        if (parts.length === 0) {
          const fallback = textOf(blocks)
          if (fallback) out.push({ role: 'user', content: fallback })
          break
        }
        out.push({
          role: 'user',
          content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts,
        })
        break
      }
      case 'assistant': {
        const text = textOf(blocks)
        const calls = []
        for (const block of blocks) {
          if (block?.type === 'tool-call') {
            calls.push({
              id: String(block.id ?? ''),
              type: 'function',
              function: { name: String(block.name ?? ''), arguments: typeof block.arguments === 'string' ? block.arguments : '{}' },
            })
          }
        }
        if (!text && calls.length === 0) break
        const entry = { role: 'assistant', content: text || null }
        if (calls.length > 0) entry.tool_calls = calls
        out.push(entry)
        break
      }
      case 'tool': {
        out.push({
          role: 'tool',
          tool_call_id: String(message.toolCallId ?? message.source?.callId ?? ''),
          content: textOf(blocks) || '(no output)',
        })
        break
      }
      default: break
    }
  }
  return out
}

/** Project harness messages onto the Anthropic Messages shape. */
export function toClaudeMessages(messages, resolveImage, warnings) {
  const out = []
  let systemText = ''
  for (const message of messages ?? []) {
    const blocks = blocksOf(message.content)
    if (message.role === 'system' || message.role === 'developer') {
      const text = textOf(blocks)
      if (text) systemText = systemText ? `${systemText}\n\n${text}` : text
      continue
    }
    if (message.role === 'tool') {
      out.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: String(message.toolCallId ?? message.source?.callId ?? ''), content: textOf(blocks) || '(no output)', is_error: message.isError === true }],
      })
      continue
    }
    const content = []
    for (const block of blocks) {
      if (block?.type === 'text' && block.text) content.push({ type: 'text', text: block.text })
      else if (block?.type === 'tool-call') {
        let input = {}
        try { input = JSON.parse(block.arguments || '{}') } catch { input = {} }
        content.push({ type: 'tool_use', id: String(block.id ?? ''), name: String(block.name ?? ''), input })
      } else if (block?.type === 'image') {
        const url = block.offloaded === true ? undefined : (resolveImage?.(block.attachment) ?? (typeof block.attachment?.url === 'string' ? block.attachment.url : undefined))
        if (url !== undefined) {
          const comma = String(url).indexOf(',')
          const head = comma === -1 ? '' : String(url).slice(0, comma)
          const media = head.match(/data:([^;]+)/)?.[1]
          if (media !== undefined && IMAGE_MEDIA.has(media)) {
            content.push({ type: 'image', source: { type: 'base64', media_type: media, data: String(url).slice(comma + 1) } })
          } else if (warnings) warnings.push('image-dropped')
        } else if (warnings) warnings.push('image-dropped')
      }
    }
    if (content.length === 0) continue
    out.push({ role: message.role === 'assistant' ? 'assistant' : 'user', content })
  }
  return { system: systemText || undefined, messages: out }
}

/** Project harness messages onto the OpenAI Responses input item list. */
export function toResponseInput(messages, resolveImage, warnings) {
  const out = []
  for (const message of messages ?? []) {
    const blocks = blocksOf(message.content)
    if (message.role === 'system' || message.role === 'developer') {
      const text = textOf(blocks)
      if (text) out.push({ type: 'message', role: 'system', content: [{ type: 'input_text', text }] })
      continue
    }
    if (message.role === 'tool') {
      out.push({
        type: 'function_call_output',
        call_id: String(message.toolCallId ?? message.source?.callId ?? ''),
        output: textOf(blocks) || '(no output)',
      })
      continue
    }
    if (message.role === 'assistant') {
      const text = textOf(blocks)
      if (text) out.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] })
      for (const block of blocks) {
        if (block?.type === 'tool-call') {
          out.push({ type: 'function_call', call_id: String(block.id ?? ''), name: String(block.name ?? ''), arguments: typeof block.arguments === 'string' ? block.arguments : '{}' })
        }
      }
      continue
    }
    const parts = []
    for (const block of blocks) {
      if (block?.type === 'text' && block.text) parts.push({ type: 'input_text', text: block.text })
      else if (block?.type === 'image') {
        const url = block.offloaded === true ? undefined : (resolveImage?.(block.attachment) ?? (typeof block.attachment?.url === 'string' ? block.attachment.url : undefined))
        if (url !== undefined) parts.push({ type: 'input_image', image_url: url })
        else if (warnings) warnings.push('image-dropped')
      }
    }
    if (parts.length > 0) out.push({ type: 'message', role: 'user', content: parts })
  }
  // Reasoning items from earlier turns carry encrypted content only the issuing
  // account can open; the pooled免密 credential rotates accounts, so echoing them
  // back is a guaranteed 400. They are dropped on the way out by construction.
  return out
}

/** Harness tool schemas -> the shape each provider expects. */
export function toToolDefs(tools, style) {
  const list = []
  for (const tool of tools ?? []) {
    const name = String(tool.name ?? '').trim()
    if (!name) continue
    const parameters = tool.parameters && typeof tool.parameters === 'object' && !Array.isArray(tool.parameters)
      ? tool.parameters
      : { type: 'object', properties: {} }
    const description = typeof tool.description === 'string' ? tool.description : ''
    if (style === 'claude') list.push({ name: name.slice(0, MAX_TOOL_NAME_LEN), description, input_schema: parameters })
    else if (style === 'flat') list.push({ type: 'function', name: name.slice(0, MAX_TOOL_NAME_LEN), description, parameters })
    else list.push({ type: 'function', function: { name: name.slice(0, MAX_TOOL_NAME_LEN), description, parameters } })
  }
  return list
}

/** Does this content list need an image-capable model? */
export function needsVision(messages) {
  return (messages ?? []).some(message => hasBlocks(message.content, 'image') && message.content.some(block => block?.type === 'image' && block.offloaded !== true))
}

export { baseModelId, restoreToolName }
