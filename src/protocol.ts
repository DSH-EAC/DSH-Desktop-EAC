/**
 * Framework-free wire and domain contract of the EAC pack installer.
 *
 * This module is the seam every other layer agrees on: the Host adapter, the
 * Client adapter, the pure core and the embedded snapshot all speak these
 * types. It imports nothing — no `@deepseek-ai/*`, no Node built-ins, no React
 * — so it is safe to evaluate in the browser bundle and in the Host runtime
 * alike.
 *
 * @module protocol
 */

/** Ecosystem convention this plugin implements, recorded in its catalog record. */
export const CONVENTION_ID = 'dsh.ecosystem.pack-installer/v1'

/** Cordis service key and Typert Remote namespace of the Host half. */
export const SERVICE_NAME = 'eacPackInstaller'

/** Settings namespace reserved for the installer's own page. */
export const SETTINGS_NAMESPACE = 'dsh-eac-pack-installer'

/** `settings.section` slot id of the installer page. */
export const SETTINGS_SECTION_ID = 'dsh-eac-pack-installer'

/** Slot order: just after the skin console (90) so the two EAC pages sit together. */
export const SETTINGS_SECTION_ORDER = 91

/** Locale namespace of the installer's dictionaries. */
export const LOCALE_NAMESPACE = 'dsh-eac-pack-installer'

/**
 * Small EAC wordmark the settings section renders in its header.
 *
 * Deliberately text: M5 does no asset-collection work, so the mark is a string
 * the official settings shell styles, not a bundled image.
 */
export const EAC_WORDMARK = 'DSH·EAC'

/** Official slot this plugin registers its page into (reused, never re-implemented). */
export const OFFICIAL_SETTINGS_SECTION_SLOT = 'settings.section'

/** Official settings section id of the DeepSeek account page (sign-in lives there). */
export const OFFICIAL_ACCOUNT_SECTION_ID = 'account'

/** Official Remote namespace of the account controller (`getState`/`startSignIn`/`signOut`). */
export const OFFICIAL_ACCOUNT_NAMESPACE = 'account'

/** Official Cordis service key of the profile plugin manager. */
export const OFFICIAL_PLUGIN_MANAGER_SERVICE = 'pluginManager'

/** Official settings section id of the plugin manager page. */
export const OFFICIAL_PLUGIN_SECTION_ID = 'plugins'

/** A surface an installation hands the user off to. The plugin owns none of them. */
export type OfficialSurface =
  | 'official-account-settings'
  | 'official-plugin-settings'
  | 'official-restart'

/**
 * The seam between this plugin and the official DSH desktop.
 *
 * Every field names an official surface the installer *reuses*. The plugin
 * implements none of them, and `credentials` records the hard rule that
 * sign-in and key storage stay with the official account surface: the
 * installer never asks for, holds or forwards an API key.
 */
export interface OfficialHostSeam {
  /** Which install transport the profile offered. */
  readonly manager: 'pluginManager' | 'cli-fallback'
  /** The official settings shell this plugin's page mounts into, or `null` when absent. */
  readonly settingsShell: string | null
  /** The official account Remote namespace, or `null` when the profile has none. */
  readonly account: string | null
  /** The official account settings section id, or `null` when absent. */
  readonly accountSection: string | null
  /** The official plugin-management UI the installer defers to, or `null`. */
  readonly installUi: 'official-plugin-manager' | null
  /** Always the official account surface: credentials are never plugin-owned. */
  readonly credentials: 'official-account-remote'
  /** Small text wordmark for the section header. */
  readonly wordmark: string
}

/** One closing step shown after an installation. */
export interface PostInstallStep {
  readonly kind: 'sign-in' | 'restart' | 'enable-plugins' | 'done'
  readonly label: string
  readonly detail: string
  /** Official surface this step points at; `null` for a terminal step. */
  readonly target: OfficialSurface | null
}

/** Upstream `.sync/plugin-distribution.json` classification, canonical per plan §0.5. */
export type DistributionClass = 'builtin' | 'recommended' | 'external'

/**
 * Install tier derived from {@link DistributionClass} (plan Stage 5: L1 启用 /
 * L2 按用户选择 / L3 禁用).
 */
export type Tier = 'L1' | 'L2' | 'L3'

/** Where a component's tier came from, so the UI never implies authority it lacks. */
export type TierSource =
  /** Mapped from the EAC desktop `.sync/plugin-distribution.json` registry. */
  | 'desktop-sync'
  /** Decided by this installer's documented policy (no upstream record exists). */
  | 'installer-policy'
  /** No upstream classification and no policy rule: fail-safe to L3. */
  | 'unmapped'

/** Pack category as Mojobox spells it. */
export type PackCategory = 'appearance' | 'function' | 'workflow'

/** Per-component state machine during an installation. */
export type ComponentState =
  | 'pending'
  | 'installing'
  | 'installed'
  | 'enabled'
  | 'disabled'
  | 'skipped'
  | 'failed'

/** Whole-run state machine. */
export type InstallState = 'running' | 'completed' | 'failed' | 'cancelled'

/** One installable member of a pack, resolved against the catalog. */
export interface PackComponent {
  /** Mojobox catalog id, e.g. `dev.tt-a1i.archify-dsh`. */
  readonly id: string
  /** Package name as published, e.g. `@tt-a1i/archify-dsh`. */
  readonly name: string
  /** Exact version the catalog pins. */
  readonly version: string
  /**
   * Spec handed to the DSH plugin manager verbatim: a registry spec
   * (`@scope/name@1.2.3`) or an https tarball URL. `null` when the catalog
   * record has no distributable artifact yet (source-pending).
   */
  readonly installSpec: string | null
  readonly artifactUrl: string | null
  readonly artifactDigest: string | null
  /** Upstream classification, or `null` when nothing upstream classifies it. */
  readonly distributionClass: DistributionClass | null
  readonly tierSource: TierSource
  readonly tier: Tier
  /** Pack-level `required` flag: not user-deselectable. */
  readonly required: boolean
  /** True when the catalog record has no installable artifact yet. */
  readonly sourcePending: boolean
  /** Human-readable reason for a source-pending or downgraded row. */
  readonly reason: string | null
}

/** How a pack view came to exist, so the UI can label drafts honestly. */
export interface PackProvenance {
  /** `mojobox-pack` = read from a real `catalog/packs/*.pack.json`; `snapshot-derived` = a view assembled from real catalog records. */
  readonly kind: 'mojobox-pack' | 'snapshot-derived'
  /** Whether a real Pack Lock backs every member. */
  readonly locked: boolean
  /** Why the pack is not locked / why the view was derived. */
  readonly reason: string
  /** Catalog record ids this view was built from. */
  readonly sources: readonly string[]
}

/** One pack card in the settings section. */
export interface PackView {
  readonly id: string
  readonly version: string
  readonly name: string
  readonly description: string
  readonly category: PackCategory
  readonly provenance: PackProvenance
  readonly components: readonly PackComponent[]
}

/** The catalog as the installer uses it, online or embedded. */
export interface CatalogSnapshot {
  readonly apiVersion: string
  readonly generatedAt: string
  readonly packs: readonly PackView[]
}

/** Which source answered a catalog read, and what was wrong with the preferred one. */
export interface CatalogResult {
  readonly source: 'online' | 'snapshot'
  /** True when the preferred source failed and the fallback answered. */
  readonly degraded: boolean
  /** Non-fatal problems, in the order they were observed. */
  readonly warnings: readonly string[]
  readonly snapshot: CatalogSnapshot
}

/** One component's progress row, as the settings section renders it. */
export interface StepProgress {
  readonly componentId: string
  readonly name: string
  readonly installSpec: string | null
  readonly state: ComponentState
  readonly tier: Tier
  /** Whether this installer asked for the plugin to be enabled. */
  readonly enableRequested: boolean
  /** Observed enablement after the step; `null` while unknown. */
  readonly enabled: boolean | null
  readonly message: string | null
}

/** Whole-run progress snapshot. */
export interface InstallProgress {
  readonly requestId: string
  readonly packId: string
  readonly state: InstallState
  readonly steps: readonly StepProgress[]
  readonly startedAt: number
  readonly finishedAt: number | null
  readonly error: string | null
}

/** What the client asks the Host to install. */
export interface InstallRequest {
  readonly packId: string
  /** Selected component ids; unknown ids are reported, not guessed. */
  readonly componentIds: readonly string[]
  /** Component ids the user asked to have enabled after install (L2 consent). */
  readonly enableComponentIds: readonly string[]
}

/** Everything the settings section shows once a run settles. */
export interface InstallResultView {
  readonly progress: InstallProgress
  /** Closing steps, each pointing at an official surface. */
  readonly steps: readonly PostInstallStep[]
  /** What this profile's official seam looks like, for the footer. */
  readonly seam: OfficialHostSeam
}

/** Accepted-install receipt. */
export interface InstallAccepted {
  readonly requestId: string
}

/** Every failure this installer reports to the client, with a stable code. */
export type InstallerErrorCode =
  | 'catalog/invalid'
  | 'pack/unknown'
  | 'selection/empty'
  | 'install/unknown-request'
  | 'install/busy'
  | 'install/no-transport'
  | 'install/failed'

/** Runtime check used by the core before trusting a catalog read. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/* ------------------------------------------------------------------------- *
 * Host/Client protocol revision
 *
 * The two halves ship in one package but run in different processes, and a
 * running Web client keeps its already-fetched `client.js` across a Host
 * restart. Each half therefore states the revision it was built with, and the
 * pair refuses to work together when the majors differ — the alternative is a
 * client rendering fields a newer Host no longer sends, or (worse) a client
 * that believes it drove a surface whose contract changed shape.
 * ------------------------------------------------------------------------- */

/** Revision of the Host↔Client contract in this package. */
export const PROTOCOL_VERSION = '1.0.0'

/** Which half is speaking. */
export type ProtocolSide = 'host' | 'client'

/** What each half announces before any other call is trusted. */
export interface ProtocolHello {
  readonly side: ProtocolSide
  /** Exact {@link PROTOCOL_VERSION} the half was built with. */
  readonly protocol: string
  /** Ecosystem convention id, so a foreign namespace is rejected by name. */
  readonly convention: string
}

/** Result of comparing two hellos. */
export interface ProtocolCheck {
  readonly ok: boolean
  /** Why the pair was refused, or `null` when it was accepted. */
  readonly reason: string | null
}

/** Major component of a `major.minor.patch` revision, or `null` when malformed. */
export function majorOf(version: string): number | null {
  const match = /^(\d+)\.\d+\.\d+$/.exec(version)
  if (match === null) return null
  const major = Number.parseInt(match[1] as string, 10)
  return Number.isSafeInteger(major) ? major : null
}

/** This package's hello for one side. */
export function hello(side: ProtocolSide): ProtocolHello {
  return { side, protocol: PROTOCOL_VERSION, convention: CONVENTION_ID }
}

/**
 * Compare the two halves' revisions.
 *
 * The rule is major equality only: a minor bump may add an optional field, but
 * a major bump may remove or reinterpret one, which a stale half cannot survive.
 *
 * @param host - the Host half's hello.
 * @param client - the Client half's hello.
 * @returns whether the pair may proceed, with the reason when it may not.
 */
export function checkProtocol(host: ProtocolHello, client: ProtocolHello): ProtocolCheck {
  if (host.convention !== CONVENTION_ID || client.convention !== CONVENTION_ID) {
    return { ok: false, reason: `协议约定不匹配：期望 ${CONVENTION_ID}` }
  }
  if (host.side !== 'host' || client.side !== 'client') {
    return { ok: false, reason: '协议握手的两侧身份不正确' }
  }
  const hostMajor = majorOf(host.protocol)
  const clientMajor = majorOf(client.protocol)
  if (hostMajor === null || clientMajor === null) {
    return { ok: false, reason: `协议版本号不可解析：host=${host.protocol} client=${client.protocol}` }
  }
  if (hostMajor !== clientMajor) {
    return { ok: false, reason: `协议主版本不一致（host=${host.protocol} client=${client.protocol}）；请重启 DSH 让两半同时更新` }
  }
  return { ok: true, reason: null }
}

/* ------------------------------------------------------------------------- *
 * Client-side reachability of the official surfaces
 *
 * {@link OfficialSurface} is the *target* vocabulary the Host already publishes
 * (`core/host-seam.ts`). What the Host cannot know is whether the browser half
 * can actually reach each target: the Host sees a mounted Cordis service, while
 * opening a page is a client-side act. This block is that second half of the
 * contract, and it is deliberately a *probe result* rather than a promise — an
 * unreachable surface degrades to a referral, never to a re-implementation.
 * ------------------------------------------------------------------------- */

/** What a client-side probe found about one official surface. */
export type OfficialSurfaceState =
  /** An official contract can act: the page or panel can be opened from here. */
  | 'reachable'
  /** The surface exists, but no public contract lets this plugin open it: the user must go there. */
  | 'referral-only'
  /** The surface is not composed in this client at all. */
  | 'absent'

/** One probe result, carrying the published contract it read. */
export interface OfficialSurfaceReport {
  readonly surface: OfficialSurface
  readonly state: OfficialSurfaceState
  /**
   * The upstream contract the probe read, spelled out so a failure names a
   * versioned surface instead of "the UI changed".
   */
  readonly contract: string
}

/** How far a handoff got. The three modes are deliberately not interchangeable. */
export type HandoffMode =
  /** The official surface acted: its page or panel is now open. */
  | 'opened'
  /** Nothing could be driven; the user is told which official page owns the job. */
  | 'referred'
  /** The surface is absent, so the plugin does nothing rather than fake one. */
  | 'unavailable'

/** What happened when the client handed a user to an official surface. */
export interface HandoffOutcome {
  readonly surface: OfficialSurface
  readonly mode: HandoffMode
  /** What to show the user; never claims this plugin performed the official job. */
  readonly message: string
}

/* ------------------------------------------------------------------------- *
 * EAC brand layer
 *
 * The wordmark is a *separate layer*: its own module, its own slot, its own
 * registration and its own enable flag. It therefore composes, moves or drops
 * without touching the installer section — and it never fights the single
 * occupants (`sidebar.brand.mark` / `sidebar.brand.name`) that
 * `@deepseek-ai/dsh-client-ui-brand-official` already fills.
 * ------------------------------------------------------------------------- */

/** Layer identity: DOM id prefix, style element id and diagnostic name. */
export const BRAND_LAYER_ID = 'dsh-eac-brand-layer'

/**
 * The slot the wordmark occupies.
 *
 * `sidebar.footer.action` is a `list` seat declared by
 * `@deepseek-ai/dsh-client-ui-sidebar` beside the Settings trigger. A list seat
 * is additive, so the wordmark composes with the official occupants instead of
 * shadowing them.
 */
export const BRAND_SLOT_ID = 'sidebar.footer.action'

/** Ascending order inside {@link BRAND_SLOT_ID}; after the official footer actions. */
export const BRAND_LAYER_ORDER = 50

/** Accessible name of the wordmark, so the abbreviation is never read bare. */
export const BRAND_WORDMARK_ARIA_LABEL = 'DSH EAC 生态'

/** Id of the one style element the brand layer owns. */
export const BRAND_STYLE_ID = `${BRAND_LAYER_ID}-style`
