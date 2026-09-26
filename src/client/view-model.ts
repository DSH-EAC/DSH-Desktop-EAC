/**
 * Settings-section view model.
 *
 * Pure data shaping for the React section: the section renders what these
 * functions return and decides nothing itself. That keeps the UI rules
 * (tier labels, which rows are selectable, how a run's state reads) in one
 * place that unit tests can hold, with no DOM and no React in the way.
 *
 * @module client/view-model
 */

import type {
  CatalogSnapshot,
  ComponentState,
  InstallProgress,
  InstallState,
  PackCategory,
  PackView
} from '../protocol.ts'
import { createSelection, selectionSummary, rowSelectable, type SelectionState, type SelectionSummary } from '../core/selection.ts'
import { defaultSelected, tierLabel, tierSourceLabel } from '../core/tier-policy.ts'

/** One component row of a pack card. */
export interface ComponentRowView {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly tier: string
  readonly tierLabel: string
  readonly tierSourceLabel: string
  readonly distributionClass: string | null
  readonly selected: boolean
  readonly selectable: boolean
  readonly installable: boolean
  readonly required: boolean
  readonly sourcePending: boolean
  readonly reason: string | null
  /** Whether this row's tier asks for consent to enable after install. */
  readonly enableAfterInstall: boolean
  /** Live step state, or `null` before the row has been planned. */
  readonly state: ComponentState | null
  readonly message: string | null
}

/** One pack card. */
export interface PackCardView {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly version: string
  readonly category: PackCategory
  readonly categoryLabel: string
  readonly provenanceLabel: string
  readonly locked: boolean
  readonly lockedLabel: string
  readonly summary: SelectionSummary
  readonly rows: readonly ComponentRowView[]
}

/** Pack category label. */
export function categoryLabel(category: PackCategory): string {
  switch (category) {
    case 'appearance':
      return '皮肤外观'
    case 'function':
      return '功能增强'
    case 'workflow':
      return '工作流'
  }
}

function provenanceLabel(pack: PackView): string {
  return pack.provenance.kind === 'snapshot-derived' ? `派生视图：${pack.provenance.reason}` : pack.provenance.reason
}

function lockedLabel(pack: PackView): string {
  if (pack.provenance.kind === 'snapshot-derived') return '未锁定（派生视图，无 Pack Lock）'
  return pack.provenance.locked ? '已锁定（Pack Lock）' : '未锁定（draft / source-pending）'
}

/**
 * Build one pack card.
 *
 * @param pack - the pack.
 * @param selection - the pack's current dialog selection.
 * @param progress - the run in flight or just finished, when it belongs to this pack.
 * @returns the card the section renders.
 */
export function buildPackCard(pack: PackView, selection: SelectionState, progress: InstallProgress | null): PackCardView {
  const live = progress !== null && progress.packId === pack.id ? progress : null
  const stepByComponent = new Map((live?.steps ?? []).map((step) => [step.componentId, step]))

  const rows: ComponentRowView[] = pack.components.map((component) => {
    const step = stepByComponent.get(component.id)
    return {
      id: component.id,
      name: component.name,
      version: component.version,
      tier: component.tier,
      tierLabel: tierLabel(component.tier),
      tierSourceLabel: tierSourceLabel(component.tierSource),
      distributionClass: component.distributionClass,
      selected: selection.selected[component.id] === true,
      selectable: rowSelectable(component),
      installable: component.installSpec !== null,
      required: component.required,
      sourcePending: component.sourcePending,
      reason: component.reason,
      enableAfterInstall: component.tier === 'L2' && defaultSelected(component.tier),
      state: step?.state ?? null,
      message: step?.message ?? null
    }
  })

  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    version: pack.version,
    category: pack.category,
    categoryLabel: categoryLabel(pack.category),
    provenanceLabel: provenanceLabel(pack),
    locked: pack.provenance.locked,
    lockedLabel: lockedLabel(pack),
    summary: selectionSummary(pack, selection),
    rows
  }
}

/**
 * Build every pack card, defaulting the selection of a pack the user has not
 * opened yet so the wall renders a usable starting point.
 *
 * @param snapshot - the catalog that answered.
 * @param selections - per-pack selection state, keyed by pack id.
 * @param progress - the run in flight or just finished.
 * @returns cards in catalog order.
 */
export function buildPackCards(
  snapshot: CatalogSnapshot,
  selections: Readonly<Record<string, SelectionState>>,
  progress: InstallProgress | null
): PackCardView[] {
  return snapshot.packs.map((pack) => buildPackCard(pack, selections[pack.id] ?? createSelection(pack), progress))
}

/** Card subtitle: member count and how many are recommended. */
export function packCardSubtitle(card: PackCardView): string {
  const recommended = card.rows.filter((row) => row.tier === 'L1' || row.tier === 'L2').length
  return `${card.rows.length} 个组件 · ${recommended} 个建议安装 · ${card.summary.blocked} 个暂不可安装`
}

/** How a run's state reads in the progress panel. */
export interface InstallStateLabel {
  readonly state: InstallState | 'idle'
  readonly label: string
  readonly detail: string
}

/**
 * Turn a progress snapshot into the panel's heading.
 * @param progress - the snapshot, or `null` before any run.
 * @returns the state, its label and the detail line.
 */
export function installStateLabel(progress: InstallProgress | null): InstallStateLabel {
  if (progress === null) {
    return { state: 'idle', label: '尚未安装', detail: '选择一个整合包并确认要安装的组件。' }
  }
  const done = progress.steps.filter((step) => step.state === 'enabled' || step.state === 'installed' || step.state === 'disabled').length
  const total = progress.steps.length

  switch (progress.state) {
    case 'running':
      return { state: 'running', label: '正在安装', detail: `正在安装：已完成 ${done}/${total} 个组件，请勿关闭窗口。` }
    case 'completed':
      return { state: 'completed', label: '安装完成', detail: `已处理 ${done}/${total} 个组件。` }
    case 'failed':
      return { state: 'failed', label: '安装失败', detail: progress.error ?? '未知错误' }
    case 'cancelled':
      return { state: 'cancelled', label: '已取消', detail: `已取消，完成 ${done}/${total} 个组件。` }
  }
}
