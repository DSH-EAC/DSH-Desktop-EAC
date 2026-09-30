/**
 * Tier policy: `distributionClass` → install tier → enable/disable decision.
 *
 * The plan's Stage 5 ruling is explicit (§0.5 + Stage 5 host half): the
 * upstream `distributionClass` field is canonical and no new `tier` field may
 * be invented. This module therefore *derives* the UI tier and the enable
 * decision from `distributionClass`, and nothing else:
 *
 *   builtin     → L1 → enable after install
 *   recommended → L2 → enable only when the user asked for it
 *   external    → L3 → never auto-enabled (installed but left disabled)
 *   (unknown)   → L3 → same fail-safe, reported as `unmapped`
 *
 * @module core/tier-policy
 */

import type { DistributionClass, Tier, TierSource } from '../protocol.ts'

/** Class → tier. Unknown classes fail safe to L3. */
export function tierOf(distributionClass: DistributionClass | null): Tier {
  switch (distributionClass) {
    case 'builtin':
      return 'L1'
    case 'recommended':
      return 'L2'
    case 'external':
      return 'L3'
    default:
      return 'L3'
  }
}

/** Human-facing tier label, used by the settings section's badges. */
export function tierLabel(tier: Tier): string {
  switch (tier) {
    case 'L1':
      return '建议安装'
    case 'L2':
      return '可选'
    case 'L3':
      return '不推荐'
  }
}

/**
 * Whether a row starts selected in the confirmation dialog.
 *
 * L1 and L2 start selected (they are the recommended/reviewed sets); L3 starts
 * cleared, because "not recommended" must mean the user opts in explicitly.
 */
export function defaultSelected(tier: Tier): boolean {
  return tier !== 'L3'
}

/**
 * Whether a row may be deselected by the user. Pack-level `required` wins over
 * the tier default, matching the Mojobox Pack schema's own `required` flag.
 */
export function selectable(tier: Tier, required: boolean): boolean {
  return !required && tier !== 'L1'
}

/** One enable/disable decision, with the reason the UI shows. */
export interface EnableDecision {
  readonly tier: Tier
  readonly action: 'enable' | 'leave-disabled'
  readonly reason: string
}

/**
 * Decide whether a freshly installed plugin is enabled.
 *
 * @param tier - the component's tier.
 * @param userConsent - whether the user ticked "install and enable" for this
 *   row. Only consulted for L2: L1 always enables, L3 never does.
 * @returns the decision plus the sentence the UI shows for it.
 */
export function decideEnable(tier: Tier, userConsent: boolean): EnableDecision {
  switch (tier) {
    case 'L1':
      return { tier, action: 'enable', reason: '内置（L1）：安装后自动启用' }
    case 'L2':
      return userConsent
        ? { tier, action: 'enable', reason: '推荐（L2）：按你的选择启用' }
        : { tier, action: 'leave-disabled', reason: '推荐（L2）：未勾选启用，保持关闭' }
    case 'L3':
      return { tier, action: 'leave-disabled', reason: '不推荐（L3）：安装后保持关闭，可在插件管理中手动启用' }
  }
}

/** Tier provenance label, so a derived tier is never mistaken for an upstream one. */
export function tierSourceLabel(source: TierSource): string {
  switch (source) {
    case 'desktop-sync':
      return '来自 EAC 桌面分级注册表'
    case 'installer-policy':
      // EAC-CORE-SHELL-01 移除了派生的皮肤包，当前快照已无条目使用这个来源；
      // 保留该分支以兼容旧快照（TierSource 枚举仍合法）。
      return '由安装器策略指定（非上游分级）'
    case 'unmapped':
      return '未分类，按 L3 保守处理'
  }
}
