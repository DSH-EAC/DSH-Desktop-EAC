/**
 * Handoff policy: what this plugin does about a job it does not own.
 *
 * The Host half ends a run at a {@link PostInstallStep} whose `target` names an
 * official surface (`core/host-seam.ts`). This module decides what the client
 * half *does* with that target, and it is pure on purpose: the rule "the
 * installer never re-implements the official install UI or login form" is then
 * a testable function rather than a habit spread across components.
 *
 * The three modes are deliberately not interchangeable:
 *
 *   opened      an official contract acted — its page or panel is now showing
 *   referred    nothing could be driven; the user is told which official page
 *               owns the job, and the plugin still does nothing itself
 *   unavailable no such surface is composed here; the plugin refuses rather
 *               than growing a fallback of its own
 *
 * `referred` and `unavailable` both end with the plugin doing nothing. That is
 * the point: a missing official surface must never turn into a private copy.
 *
 * @module client/handoff
 */

import type { HandoffMode, HandoffOutcome, OfficialSurface, OfficialSurfaceReport, PostInstallStep } from '../protocol.ts'

/** Facts the messages need, none of which changes the policy. */
export interface HandoffContext {
  /** Package the official install page should focus on, when one is known. */
  readonly packageName?: string
}

/**
 * The effect one reachable surface needs.
 *
 * @param surface - the target the Host named.
 * @returns `true` only when the official surface actually acted. A driver that
 *   cannot act returns `false` instead of throwing, and the outcome degrades to
 *   a referral — an official surface failing to open is not an installer error.
 */
export type SurfaceOpener = (surface: OfficialSurface) => boolean

/** The probe result for one surface, or `undefined` when nothing probed it. */
export function reportOf(reports: readonly OfficialSurfaceReport[], surface: OfficialSurface): OfficialSurfaceReport | undefined {
  return reports.find((report) => report.surface === surface)
}

/**
 * The mode one surface reaches under one probe result.
 *
 * A `reachable` surface is still only *optimistic*: the opener decides whether
 * the official call actually landed, and {@link runHandoffs} downgrades the
 * outcome when it did not.
 *
 * @param report - the probe result, or `undefined` when the surface was never probed.
 * @returns the mode this surface reaches without an opener.
 */
export function handoffModeFor(report: OfficialSurfaceReport | undefined): HandoffMode {
  if (report === undefined || report.state === 'absent') return 'unavailable'
  return report.state === 'referral-only' ? 'referred' : 'opened'
}

/**
 * The sentence the settings section shows for one outcome.
 *
 * Every branch names the official owner of the job. None of them offers a
 * plugin-owned substitute, because there is none to offer.
 *
 * @param surface - the target the Host named.
 * @param mode - how far the handoff got.
 * @param context - optional facts the sentence mentions.
 * @returns the message.
 */
export function handoffMessage(surface: OfficialSurface, mode: HandoffMode, context: HandoffContext = {}): string {
  const packageName = context.packageName

  switch (surface) {
    case 'official-plugin-settings':
      if (mode === 'opened') {
        return packageName === undefined || packageName.length === 0
          ? '已打开官方「插件」面板，请在那里完成安装与启用。'
          : `已在官方「插件」页打开 ${packageName}，请在那里完成安装与启用。`
      }
      if (mode === 'referred') {
        return '请打开官方「设置 → 插件」页完成安装与启用；安装界面由官方插件管理器持有，本插件不重复实现。'
      }
      return '当前客户端没有官方插件安装界面；本插件不会自行实现一个，请改用官方桌面端。'

    case 'official-account-settings':
      if (mode === 'opened') return '官方账号界面已打开，请在那里完成登录。'
      if (mode === 'referred') {
        return '登录与凭据由官方「设置 → 账户」持有；请在那里完成登录，本插件不接触任何密钥。'
      }
      return '当前客户端没有官方账号界面；本插件不提供登录表单，请改用官方桌面端登录。'

    case 'official-restart':
      return '请重启 DSH 使新插件生效。'
  }
}

/** One handoff, with the contract it was based on, for the diagnostics line. */
export interface HandoffRecord extends HandoffOutcome {
  /** Contract the probe read, or `null` when the surface was never probed. */
  readonly contract: string | null
}

/**
 * Carry out every closing step's handoff.
 *
 * Order is the Host's step order, and every step produces exactly one record —
 * including the ones that do nothing, so the view can state *why* a target was
 * not opened instead of silently omitting it.
 *
 * @param steps - closing steps from the Host's result view.
 * @param reports - the client's probe results.
 * @param open - the effect for a reachable surface; omitted means "refer only".
 * @param context - optional facts the messages mention.
 * @returns one record per step that names a target, in step order.
 */
export function runHandoffs(
  steps: readonly PostInstallStep[],
  reports: readonly OfficialSurfaceReport[],
  open?: SurfaceOpener,
  context: HandoffContext = {}
): readonly HandoffRecord[] {
  const records: HandoffRecord[] = []

  for (const step of steps) {
    const surface = step.target
    if (surface === null) continue

    const report = reportOf(reports, surface)
    let mode = handoffModeFor(report)

    if (mode === 'opened') {
      const acted = open === undefined ? false : safeOpen(open, surface)
      if (!acted) mode = 'referred'
    }

    records.push({
      surface,
      mode,
      message: handoffMessage(surface, mode, context),
      contract: report?.contract ?? null
    })
  }

  return records
}

/** An opener that throws is a refusal, not a crash: the run degrades to a referral. */
function safeOpen(open: SurfaceOpener, surface: OfficialSurface): boolean {
  try {
    return open(surface) === true
  } catch {
    return false
  }
}

/** True when no handoff could be performed, so the view should say so plainly. */
export function allUnavailable(records: readonly HandoffRecord[]): boolean {
  return records.length > 0 && records.every((record) => record.mode === 'unavailable')
}
