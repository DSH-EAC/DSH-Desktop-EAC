/**
 * Reasoning-effort policy.
 *
 * A live probe of this lane (2026-09-24) settled the design: the gateway accepts
 * `reasoning_effort`, `thinking.budget_tokens`, `enable_thinking` and
 * `thinking_budget` and then ignores all of them — three samples per spelling
 * showed `low` producing *more* reasoning tokens than `xhigh`, and the unknown
 * fields occasionally surfaced as an upstream 503. The single control the pooled
 * account actually enforces is `max_tokens`, and reasoning volume tracks it
 * directly (a 64-token ceiling pulled reasoning from ~397 tokens down to ~63).
 *
 * So an effort level here is a real, enforced generation budget rather than a
 * hint. Every declared level therefore changes measured behaviour; a level that
 * could not be enforced would not be declared, because an effort menu that does
 * nothing is worse to a user than no effort menu at all.
 *
 * Because the ceiling is shared by thinking and the visible answer, a lower
 * level shortens both — that is the only modulation this lane offers, and it is
 * why the levels are stated as token budgets rather than as vague adjectives.
 *
 * A model whose thinking cannot be switched off pays for it out of the same
 * ceiling before the answer starts, so every rung of its ladder is doubled: one
 * rung then leaves the answer about as much room as it has on a model that can
 * think nothing at all. Measured on `mimo-v2.6-flash-free` over the 92 calls of
 * one day: 82% of the output tokens were reasoning, so the un-doubled 8192
 * ceiling left roughly 1500 for the answer and a long turn ended in `length`
 * about every third request.
 *
 * @module src/effort.js
 */

/** Ordered for display: the array order is the picker's order. */
export const LEVELS = [
  { id: 'light', name: 'Light', zh: '精简', ceiling: 2048, hint: 'terse deliberation, the fastest answer here.' },
  { id: 'balanced', name: 'Balanced', zh: '均衡', ceiling: 8192, hint: 'enough to reason through a normal turn.' },
  { id: 'deep', name: 'Deep', zh: '深思', ceiling: undefined, hint: 'the model\'s full output capacity, extended deliberation.' },
]

export const DEFAULT_LEVEL = 'balanced'

/** Rungs of a model that must think are widened by this factor; see the module note. */
export const ALWAYS_THINKING_FACTOR = 2

/** Does this model expose an effort menu at all? */
export function supportsEffort(model) {
  return model?.reasoning === true
}

/**
 * The rung in force for one call, resolved the same way for the budget sent
 * upstream and the effort recorded against it.
 *
 * A model with no effort menu has no rung: its whole output window belongs to the
 * answer, and a level inherited from elsewhere must not shrink it. A model with a
 * menu that the caller did not answer with a level still gets the menu's default.
 * The two each failed differently before: a no-menu model inherited `balanced`
 * and had its window cut by a rung it never offered, while a menu model with no
 * rung sent the full capacity and *logged* the default — so the dashboard showed
 * 均衡 next to a 32K generation that 均衡 had never promised.
 *
 * @param {string|undefined} level - effort id from the harness, when it sent one
 * @param {object} model - catalog entry
 * @returns {object|undefined} the declared level, or undefined when none applies
 */
export function resolveLevel(level, model) {
  if (!supportsEffort(model)) return undefined
  return LEVELS.find(candidate => candidate.id === level)
    ?? LEVELS.find(candidate => candidate.id === DEFAULT_LEVEL)
}

/** The ceiling one rung carries on one model, before capacity is applied. */
function ceilingOf(entry, model) {
  if (entry === undefined || entry.ceiling === undefined) return undefined
  return model?.canDisableThinking === false ? entry.ceiling * ALWAYS_THINKING_FACTOR : entry.ceiling
}

/**
 * Resolve the generation ceiling for one level against one model.
 *
 * The level ceiling is the controlling term; the model's own capacity and the
 * session's request can only lower it further, never raise it. A level with no
 * ceiling inherits the model capacity, which is why "Deep" is the top row.
 *
 * @param {string|undefined} level - the effort id the harness selected
 * @param {object} model - catalog entry, supplying `maxOutput`
 * @param {number|undefined} requested - the session's maxTokens, when it set one
 * @param {number|undefined} fallback - the plugin default ceiling
 * @returns {number} tokens
 */
export function budgetFor(level, model, requested, fallback) {
  // A ceiling that is not a positive number is *no* ceiling. Without this, the
  // settings page's own cleared input — `Number('') || 0` — reached the wire as
  // `min(model capacity, 0)`, and every turn of every model silently came back
  // clamped to `MIN_BUDGET`.
  const capacity = Math.min(
    model?.maxOutput ?? 32768,
    usableTokens(requested),
    usableTokens(fallback),
  )
  const ceiling = ceilingOf(resolveLevel(level, model), model)
  if (ceiling === undefined) return Math.max(MIN_BUDGET, Math.trunc(capacity))
  return Math.max(MIN_BUDGET, Math.trunc(Math.min(ceiling, capacity)))
}

/** A caller-supplied token ceiling, or "none" when it is not a positive number. */
function usableTokens(value) {
  return Number.isFinite(value) && value > 0 ? value : Number.POSITIVE_INFINITY
}

/** Below this the answer itself cannot land, so no level is allowed to go. */
export const MIN_BUDGET = 512

/**
 * The whole ladder as it applies to one model right now, for anything that has
 * to show the user the number that will actually go out on the wire.
 *
 * @param {object} model - catalog entry
 * @param {number|undefined} requested - the session's maxTokens, when it set one
 * @param {number|undefined} fallback - the plugin default ceiling
 * @returns {Array<{id: string, name: string, tokens: number, isDefault: boolean}>}
 */
export function budgetLadder(model, requested, fallback) {
  return LEVELS.map(entry => ({
    id: entry.id,
    name: entry.name,
    tokens: budgetFor(entry.id, model, requested, fallback),
    isDefault: entry.id === DEFAULT_LEVEL,
  }))
}

/**
 * The declared effort list for one model, in picker order.
 *
 * The description is generated from the same `budgetFor` call that will decide
 * the request, not written next to it. A rung that advertises 8K while the plugin
 * sends 16 384 on a thinking-always-on model is the same defect issue #2 reported
 * for the settings page — a number the user reads and the wire does not honour —
 * so this cannot carry a per-level constant.
 *
 * @param {object} model - catalog entry
 * @param {number|undefined} requested - the session's maxTokens, when it set one
 * @param {number|undefined} fallback - the plugin default ceiling
 * @returns {Array<{id:string, name:string, description:string}>|undefined}
 */
export function effortsFor(model, requested, fallback) {
  if (!supportsEffort(model)) return undefined
  return budgetLadder(model, requested, fallback).map(row => ({
    id: row.id,
    name: row.name,
    description: `${kilos(row.tokens)} output ceiling, shared by thinking and the answer`
      + (model.canDisableThinking === false ? ' (thinking cannot be switched off on this model)' : '')
      + `: ${LEVELS.find(level => level.id === row.id)?.hint ?? ''}`,
  }))
}

/** 16384 -> `16 K`, the spelling the settings page and the README both use. */
function kilos(tokens) {
  return `${Math.round(tokens / 1024)} K`
}
