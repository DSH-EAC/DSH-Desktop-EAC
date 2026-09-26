/**
 * Selection model of the confirmation dialog.
 *
 * The dialog is the only place a user chooses what an installation contains, so
 * the rules live here rather than in the view: which rows start selected, which
 * rows may be toggled at all, and which rows carry "enable after install"
 * consent. The view renders whatever this module decides and nothing else.
 *
 * @module core/selection
 */

import type { InstallRequest, PackComponent, PackView } from '../protocol.ts'
import { defaultSelected, selectable } from './tier-policy.ts'

/** Immutable selection of one pack. */
export interface SelectionState {
  readonly packId: string
  /** Component id → included in the installation. */
  readonly selected: Readonly<Record<string, boolean>>
  /** Component id → the user consented to enabling it after install. */
  readonly enable: Readonly<Record<string, boolean>>
}

/** One pack's dialog counters. */
export interface SelectionSummary {
  readonly total: number
  readonly selectable: number
  readonly selected: number
  readonly installable: number
  readonly blocked: number
}

/** A row the user can toggle: not required, not L1, and actually installable. */
export function rowSelectable(component: PackComponent): boolean {
  return selectable(component.tier, component.required) && component.installSpec !== null
}

/** Consent is only ever asked for L2; L1 enables by policy and L3 never enables. */
function consents(component: PackComponent): boolean {
  return component.tier === 'L2'
}

/**
 * Build the dialog's opening selection.
 *
 * @param pack - the pack being confirmed.
 * @param options - `installed` component ids are left unchecked, so re-running
 *   a pack does not silently reinstall what is already there.
 * @returns the initial selection.
 */
export function createSelection(pack: PackView, options: { installed?: readonly string[] } = {}): SelectionState {
  const installed = new Set(options.installed ?? [])
  const selected: Record<string, boolean> = {}
  const enable: Record<string, boolean> = {}

  for (const component of pack.components) {
    const included = defaultSelected(component.tier) && component.installSpec !== null && !installed.has(component.id)
    selected[component.id] = included
    enable[component.id] = included && consents(component)
  }

  return { packId: pack.id, selected, enable }
}

/**
 * Flip one row. Required rows, L1 rows, source-pending rows and unknown ids
 * leave the state untouched, so a stale click can never widen an installation.
 *
 * @param state - current selection.
 * @param pack - pack the selection belongs to.
 * @param componentId - row to toggle.
 * @returns the next selection, or `state` itself when the toggle is refused.
 */
export function toggleComponent(state: SelectionState, pack: PackView, componentId: string): SelectionState {
  const component = pack.components.find((candidate) => candidate.id === componentId)
  if (component === undefined || !rowSelectable(component)) return state

  const included = state.selected[componentId] !== true
  return {
    packId: state.packId,
    selected: { ...state.selected, [componentId]: included },
    enable: { ...state.enable, [componentId]: included && consents(component) }
  }
}

/** Selected component ids, in pack order. */
export function selectedIds(state: SelectionState): string[] {
  return Object.keys(state.selected).filter((id) => state.selected[id] === true)
}

/** Component ids the user consented to enable, in pack order. */
export function enableIds(state: SelectionState): string[] {
  return Object.keys(state.enable).filter((id) => state.enable[id] === true && state.selected[id] === true)
}

/** Counters the dialog header shows. */
export function selectionSummary(pack: PackView, state: SelectionState): SelectionSummary {
  const components = pack.components
  return {
    total: components.length,
    selectable: components.filter(rowSelectable).length,
    selected: components.filter((component) => state.selected[component.id] === true).length,
    installable: components.filter((component) => state.selected[component.id] === true && component.installSpec !== null).length,
    blocked: components.filter((component) => component.installSpec === null).length
  }
}

/** Thrown when a confirmation carries nothing to install. */
export class EmptySelectionError extends Error {
  readonly code = 'selection/empty'

  constructor(message = 'selection/empty: 至少选择一个可安装的组件') {
    super(message)
    this.name = 'EmptySelectionError'
  }
}

/**
 * Turn the dialog's state into the request the Host installs.
 *
 * @param pack - the pack being confirmed.
 * @param state - the confirmed selection.
 * @returns the wire request, with ids in pack order.
 * @throws {EmptySelectionError} when nothing installable is selected.
 */
export function toInstallRequest(pack: PackView, state: SelectionState): InstallRequest {
  const ordered = pack.components.filter((component) => state.selected[component.id] === true && component.installSpec !== null)
  if (ordered.length === 0) throw new EmptySelectionError()

  const consented = new Set(enableIds(state))
  return {
    packId: pack.id,
    componentIds: ordered.map((component) => component.id),
    enableComponentIds: ordered.filter((component) => consented.has(component.id)).map((component) => component.id)
  }
}
