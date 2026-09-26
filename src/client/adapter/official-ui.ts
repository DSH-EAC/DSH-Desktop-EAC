/**
 * The client half's only upstream-facing module.
 *
 * Every official client contract this plugin reads or drives is named here and
 * nowhere else, which is the client-side half of the Stage 5 constraint ("所有
 * `@deepseek-ai/*` 依赖只许出现在 adapter/"; the host half is
 * `src/adapter/dsh-0.1.7-host.ts`).
 *
 * What is *not* here matters as much as what is. The plugin reads no DOM, no
 * CSS class, no route and no bundle file: every entry below is a published
 * contract of an official package —
 *
 *   pluginNavigation            cordis `reflect` service provided by
 *                              `@deepseek-ai/dsh-client-ui-plugin-manager`
 *                              (client), `openBundle(packageName)`; the
 *                              official consumer precedent is
 *                              `@deepseek-ai/dsh-experimental-client-ui-voice-input`
 *   layout.selectPanel          documented `ILayout` method of
 *                              `@deepseek-ai/dsh-client-ui-layout`; `'plugins'`
 *                              is the `PANEL_ID` that package's client exports
 *   settings.section            slot declared by
 *                              `@deepseek-ai/dsh-client-ui-settings`, read
 *                              through the documented `slots.entries()` ledger
 *                              inspection API
 *   remote.account              Typert Remote namespace mounted by
 *                              `@deepseek-ai/dsh-api-remotes`
 *
 * Each is probed rather than assumed, and each probe reports the contract it
 * read, so an upstream rename shows up as a named absence instead of a silent
 * mis-drive.
 *
 * @module client/adapter/official-ui
 */

import type { HandoffOutcome, OfficialSurface, OfficialSurfaceReport } from '../../protocol.ts'
import { OFFICIAL_ACCOUNT_NAMESPACE, OFFICIAL_ACCOUNT_SECTION_ID, OFFICIAL_PLUGIN_SECTION_ID, OFFICIAL_SETTINGS_SECTION_SLOT } from '../../protocol.ts'
import { handoffMessage, handoffModeFor, reportOf, type HandoffContext } from '../handoff.ts'

/** Cordis service name of the official plugin-manager client's navigation face. */
export const PLUGIN_NAVIGATION_SERVICE = 'pluginNavigation'

/** Cordis service name of the official layout controller. */
export const LAYOUT_SERVICE = 'layout'

/** Cordis service name of the slot registry. */
export const SLOTS_SERVICE = 'slots'

/** Main-panel id of the official Plugins page (exported `PANEL_ID` of the plugin-manager client). */
export const PLUGINS_PANEL_ID = 'plugins'

/** Sidebar list slot whose entries address main panels. */
export const SIDEBAR_PANEL_SLOT = 'sidebar.panellist'

/**
 * The slice of a client plugin context this module uses.
 *
 * Only `get` is read, and only the way the official packages themselves resolve
 * an optional peer (`@deepseek-ai/dsh-host-plugin-inventory` reads
 * `ctx.get('agentPresets')` the same way). A required `inject` entry would make
 * the whole client half wait for a service a profile may never compose, which
 * is exactly the coupling this seam exists to avoid.
 */
export interface ClientContextLike {
  /**
   * Resolve a provided service, or `undefined` when it is absent or its owner
   * is not active.
   * @param name - cordis service name.
   */
  get(name: string): unknown
}

/** Structural view of the slot ledger inspection API. */
interface SlotLedgerLike {
  entries(key: string): readonly SlotEntryLike[]
}

/** Structural view of one ledger entry. */
interface SlotEntryLike {
  readonly options?: { readonly id?: unknown }
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function methodOf(value: unknown, name: string): ((...args: never[]) => unknown) | undefined {
  if (!isRecordLike(value)) return undefined
  const candidate = value[name]
  return typeof candidate === 'function' ? (candidate as (...args: never[]) => unknown) : undefined
}

/** The slots ledger, or `undefined` when the registry is not mounted. */
function ledger(ctx: ClientContextLike): SlotLedgerLike | undefined {
  const slots = ctx.get(SLOTS_SERVICE)
  return methodOf(slots, 'entries') === undefined ? undefined : (slots as SlotLedgerLike)
}

/**
 * Whether one `settings.section` entry with the given id is registered.
 * @param ctx - client context.
 * @param id - section id to look for.
 * @returns whether the section exists in this composition.
 */
export function hasSettingsSection(ctx: ClientContextLike, id: string): boolean {
  const registry = ledger(ctx)
  if (registry === undefined) return false
  try {
    return registry.entries(OFFICIAL_SETTINGS_SECTION_SLOT).some((entry) => entry.options?.id === id)
  } catch {
    return false
  }
}

/** Whether the sidebar lists a main panel with the given id. */
function hasSidebarPanel(ctx: ClientContextLike, id: string): boolean {
  const registry = ledger(ctx)
  if (registry === undefined) return false
  try {
    return registry.entries(SIDEBAR_PANEL_SLOT).some((entry) => entry.options?.id === id)
  } catch {
    return false
  }
}

/** Whether the official account Remote namespace is mounted. */
export function hasAccountRemote(ctx: ClientContextLike): boolean {
  const account = ctx.get(`remote.${OFFICIAL_ACCOUNT_NAMESPACE}`)
  return methodOf(account, 'getState') !== undefined
}

/**
 * Probe the official surfaces this plugin defers to.
 *
 * The probe is read-only and side-effect free: it never opens anything, never
 * mounts anything, and reports `absent` rather than throwing when a profile
 * composes none of the official client.
 *
 * @param ctx - client context.
 * @returns one report per target in {@link OfficialSurface}, in a stable order.
 */
export function probeOfficialUi(ctx: ClientContextLike): readonly OfficialSurfaceReport[] {
  const navigation = methodOf(ctx.get(PLUGIN_NAVIGATION_SERVICE), 'openBundle') !== undefined
  const layout = methodOf(ctx.get(LAYOUT_SERVICE), 'selectPanel') !== undefined && hasSidebarPanel(ctx, PLUGINS_PANEL_ID)
  const pluginSection = hasSettingsSection(ctx, OFFICIAL_PLUGIN_SECTION_ID)
  const accountSection = hasSettingsSection(ctx, OFFICIAL_ACCOUNT_SECTION_ID)
  const accountRemote = hasAccountRemote(ctx)

  return [
    {
      surface: 'official-plugin-settings',
      // `openBundle` focuses one package and selects the panel itself, so it is
      // the preferred contract; `selectPanel` only reaches the page.
      state: navigation || layout ? 'reachable' : pluginSection ? 'referral-only' : 'absent',
      contract: navigation
        ? `${PLUGIN_NAVIGATION_SERVICE}.openBundle(packageName)`
        : layout
          ? `${LAYOUT_SERVICE}.selectPanel("${PLUGINS_PANEL_ID}")`
          : pluginSection
            ? `${OFFICIAL_SETTINGS_SECTION_SLOT} id "${OFFICIAL_PLUGIN_SECTION_ID}"`
            : `${PLUGIN_NAVIGATION_SERVICE}.openBundle | ${LAYOUT_SERVICE}.selectPanel`
    },
    {
      surface: 'official-account-settings',
      // No published contract lets a third-party plugin open another settings
      // section, so even a composed Account page is a referral: the user goes
      // there, the plugin does not drive it.
      state: accountSection || accountRemote ? 'referral-only' : 'absent',
      contract: accountSection
        ? `${OFFICIAL_SETTINGS_SECTION_SLOT} id "${OFFICIAL_ACCOUNT_SECTION_ID}"`
        : accountRemote
          ? `remote.${OFFICIAL_ACCOUNT_NAMESPACE}.getState()`
          : `${OFFICIAL_SETTINGS_SECTION_SLOT} id "${OFFICIAL_ACCOUNT_SECTION_ID}"`
    },
    {
      surface: 'official-restart',
      // A restart is the user's own act; no programmatic seam exists or should.
      state: 'referral-only',
      contract: 'shell restart affordance (no programmatic seam)'
    }
  ]
}

/**
 * Open one reachable official surface.
 *
 * @param ctx - client context.
 * @param surface - target named by the Host's closing step.
 * @param context - facts the sentence mentions.
 * @returns `true` only when the official contract actually acted.
 */
export function openOfficialSurface(ctx: ClientContextLike, surface: OfficialSurface, context: HandoffContext = {}): boolean {
  if (surface !== 'official-plugin-settings') return false

  const packageName = context.packageName
  if (packageName !== undefined && packageName.length > 0) {
    const openBundle = methodOf(ctx.get(PLUGIN_NAVIGATION_SERVICE), 'openBundle')
    if (openBundle !== undefined) {
      try {
        openBundle.call(ctx.get(PLUGIN_NAVIGATION_SERVICE), packageName as never)
        return true
      } catch {
        // Fall through to the panel-only contract rather than reporting failure.
      }
    }
  }

  const layout = ctx.get(LAYOUT_SERVICE)
  const selectPanel = methodOf(layout, 'selectPanel')
  if (selectPanel === undefined) return false
  try {
    selectPanel.call(layout, PLUGINS_PANEL_ID as never)
    return true
  } catch {
    return false
  }
}

/**
 * Probe, then carry one target as far as this client can.
 *
 * The composition of {@link probeOfficialUi} and {@link openOfficialSurface}
 * with the pure policy, so a caller that only wants one outcome does not have
 * to re-derive the mode.
 *
 * @param ctx - client context.
 * @param surface - target named by the Host's closing step.
 * @param context - facts the sentence mentions.
 * @returns the outcome, with the message the view shows.
 */
export function handoffTo(ctx: ClientContextLike, surface: OfficialSurface, context: HandoffContext = {}): HandoffOutcome {
  const report = reportOf(probeOfficialUi(ctx), surface)
  let mode = handoffModeFor(report)
  if (mode === 'opened' && !openOfficialSurface(ctx, surface, context)) mode = 'referred'
  return { surface, mode, message: handoffMessage(surface, mode, context) }
}
