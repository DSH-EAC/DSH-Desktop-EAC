/**
 * DSH 0.1.7-rc.2 Host adapter — the only Host file allowed to import
 * `@deepseek-ai/*` (Stage 5 technical constraint: "所有 `@deepseek-ai/*` 依赖
 * 只许出现在 adapter/").
 *
 * Everything upstream-facing lives here:
 *  - the Cordis service registration (`TypertRemoteService`, service key
 *    `eacPackInstaller`) and its Remote methods;
 *  - the `fetch` catalog transport;
 *  - the `dsh plugin` CLI runner;
 *  - the **official host seam**: presence probes for the official plugin
 *    manager, plugin settings UI, settings shell and account controller.
 *
 * The seam is read-only and ownership-free by design: this adapter reads the
 * official account *status* to decide whether the post-install step should send
 * the user to the official sign-in page. It never stores, forwards or asks for
 * a credential, and it never re-implements the official install UI or login
 * flow — it defers to them. Reuse of the official install UI and login
 * experience is an adapter boundary; concrete wiring is subject to the pinned
 * source and licence audit, so nothing official is copied into this repository.
 *
 * @module adapter/dsh-0.1.7-host
 */

import { spawn } from 'node:child_process'

import type { Context } from '@deepseek-ai/cordis'
import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'

import { findPack } from '../core/catalog.ts'
import { loadCatalog, type CatalogSourcePort } from '../core/catalog-source.ts'
import { describeHostSeam, postInstallSteps, type AccountState, type HostSeamFacts } from '../core/host-seam.ts'
import { startInstall, type InstallRun } from '../core/installer.ts'
import { createCliPort, selectPort, type CliRunner, type ManagerLike } from './ports.ts'
import { markRemoteMethods } from './remote-marker.ts'
import {
  OFFICIAL_ACCOUNT_NAMESPACE,
  OFFICIAL_PLUGIN_MANAGER_SERVICE,
  OFFICIAL_PLUGIN_SECTION_ID,
  OFFICIAL_SETTINGS_SECTION_SLOT,
  SERVICE_NAME,
  type CatalogResult,
  type InstallAccepted,
  type InstallProgress,
  type InstallRequest,
  type InstallResultView,
  type OfficialHostSeam
} from '../protocol.ts'
import { SNAPSHOT_GENERATED_AT, snapshotDocument } from '../data/snapshot.ts'

/** Default online catalog document. */
export const DEFAULT_CATALOG_URL = 'https://mojobox.dev/generated/catalog.json'

/** Host-side configuration, validated by Cordis from the profile patch row. */
export interface Config {
  /** Online catalog document; the embedded snapshot answers whenever this fails. */
  catalogUrl?: string
  /** Set false to skip the online read entirely. */
  onlineEnabled?: boolean
  /** Deadline for the online read, in milliseconds. */
  onlineTimeoutMs?: number
  /** Profile name the CLI fallback passes to `dsh plugin --profile`. */
  profile?: string
  /** `dsh` executable the CLI fallback spawns. */
  dshCommand?: string
}

/** The service's own config schema. */
const ConfigSchema = z.object({
  catalogUrl: z.string().default(DEFAULT_CATALOG_URL),
  onlineEnabled: z.boolean().default(true),
  onlineTimeoutMs: z.number().default(5_000),
  profile: z.string().default('web'),
  dshCommand: z.string().default('dsh')
})

/** How many finished runs stay addressable by `progress`. */
const RETAINED_RUNS = 20

/** The official account controller, narrowed to the one read this adapter makes. */
interface AccountControllerLike {
  getState(): Promise<unknown>
}

/** `child_process.spawn` behind {@link CliRunner}. */
function createSpawnRunner(): CliRunner {
  return {
    run(command, args) {
      return new Promise((resolve) => {
        const child = spawn(command, [...args], { shell: false, windowsHide: true })
        let output = ''
        const collect = (chunk: unknown): void => {
          output = `${output}${String(chunk)}`.slice(-16_384)
        }
        child.stdout?.on('data', collect)
        child.stderr?.on('data', collect)
        child.on('error', (error) => resolve({ exitCode: 127, output: `${output}\n${error.message}` }))
        child.on('close', (code) => resolve({ exitCode: code ?? 1, output }))
      })
    }
  }
}

/**
 * The EAC pack installer Host service.
 *
 * Remote methods (namespace `eacPackInstaller`): `catalog`, `install`,
 * `progress`, `cancel`, `hostSeam`.
 */
export class PackInstaller extends TypertRemoteService {
  static Config = ConfigSchema

  private readonly resolved: Required<Config>
  private readonly runner: CliRunner = createSpawnRunner()
  private readonly runs = new Map<string, InstallRun>()
  private lastCatalog: CatalogResult | null = null

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, SERVICE_NAME)
    this.resolved = {
      catalogUrl: config.catalogUrl ?? DEFAULT_CATALOG_URL,
      onlineEnabled: config.onlineEnabled ?? true,
      onlineTimeoutMs: config.onlineTimeoutMs ?? 5_000,
      profile: config.profile ?? 'web',
      dshCommand: config.dshCommand ?? 'dsh'
    }
  }

  /** The mounted official plugin manager, or `undefined` when the profile has none. */
  private manager(): ManagerLike | undefined {
    const candidate: unknown = this.ctx.get(OFFICIAL_PLUGIN_MANAGER_SERVICE)
    if (typeof candidate !== 'object' || candidate === null) return undefined
    const record = candidate as Partial<Record<keyof ManagerLike, unknown>>
    return typeof record.installBundle === 'function' && typeof record.setPluginEnabled === 'function' && typeof record.listPlugins === 'function'
      ? (candidate as ManagerLike)
      : undefined
  }

  /** The online catalog transport over `fetch`. */
  private onlinePort(): CatalogSourcePort {
    const url = this.resolved.catalogUrl
    return {
      async fetchOnline(signal) {
        const response = await fetch(url, { signal, headers: { accept: 'application/json' } })
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
        return await response.json()
      }
    }
  }

  /**
   * Read the catalog: online first, embedded snapshot as the floor.
   * @returns the snapshot that answered and where it came from.
   */
  async catalog(): Promise<CatalogResult> {
    const result = await loadCatalog({
      embedded: snapshotDocument,
      port: this.resolved.onlineEnabled ? this.onlinePort() : null,
      enabled: this.resolved.onlineEnabled,
      timeoutMs: this.resolved.onlineTimeoutMs,
      generatedAt: SNAPSHOT_GENERATED_AT
    })
    this.lastCatalog = result
    return result
  }

  /** The install transport this profile offers, and what the official seam looks like. */
  hostSeam(): OfficialHostSeam {
    return describeHostSeam(this.seamFacts())
  }

  /**
   * Start installing the confirmed selection.
   * @param request - pack and component ids the user confirmed.
   * @returns the request id `progress` and `cancel` address.
   * @throws {RemoteError} `gateway/bad-request` for an unknown pack or an empty selection.
   */
  async install(request: InstallRequest): Promise<InstallAccepted> {
    const catalog = this.lastCatalog ?? (await this.catalog())
    const pack = findPack(catalog.snapshot, request.packId)
    if (pack === undefined) {
      throw new RemoteError('gateway/bad-request', `pack/unknown: 目录中没有 Pack ${request.packId}`, {})
    }

    const port = selectPort(
      this.manager(),
      createCliPort({ profile: this.resolved.profile, dshCommand: this.resolved.dshCommand, runner: this.runner })
    )

    let run: InstallRun
    try {
      run = startInstall({ request, pack, port })
    } catch (error) {
      throw new RemoteError('gateway/bad-request', error instanceof Error ? error.message : String(error), {})
    }

    this.runs.set(run.requestId, run)
    void run.done.then(
      () => this.prune(),
      () => this.prune()
    )
    return { requestId: run.requestId }
  }

  /**
   * Read one run's progress.
   * @param requestId - id returned by {@link install}.
   * @throws {RemoteError} `gateway/bad-request` when no active run has that id.
   */
  async progress(requestId: string): Promise<InstallProgress> {
    const run = this.runs.get(requestId)
    if (run === undefined) {
      throw new RemoteError('gateway/bad-request', `install/unknown-request: 未找到安装请求 ${requestId}`, {})
    }
    return run.progress()
  }

  /**
   * Read one settled run as the settings section's result panel shows it:
   * the progress snapshot, the closing steps and the official seam.
   *
   * The steps are computed here rather than in the view so the rule "the
   * installer ends at the official sign-in surface" is testable and cannot
   * drift per render.
   *
   * @param requestId - id returned by {@link install}.
   * @throws {RemoteError} `gateway/bad-request` when no run has that id.
   */
  async result(requestId: string): Promise<InstallResultView> {
    const run = this.runs.get(requestId)
    if (run === undefined) {
      throw new RemoteError('gateway/bad-request', `install/unknown-request: 未找到安装请求 ${requestId}`, {})
    }
    const progress = run.progress()
    const account = await this.accountState()
    return {
      progress,
      steps: postInstallSteps({
        installedCount: progress.steps.filter((step) => step.state === 'installed' || step.state === 'enabled' || step.state === 'disabled').length,
        enabledCount: progress.steps.filter((step) => step.state === 'enabled').length,
        unknownEnablementCount: progress.steps.filter((step) => step.state === 'installed' && step.enabled === null).length,
        restartRequired: progress.steps.some((step) => (step.message ?? '').includes('重启')),
        account
      }),
      seam: this.hostSeam()
    }
  }

  /**
   * Stop a run before its next component.
   * @param requestId - id returned by {@link install}.
   * @returns `cancelled` when the run existed, `not-running` otherwise.
   */
  async cancel(requestId: string): Promise<{ status: 'cancelled' | 'not-running' }> {
    const run = this.runs.get(requestId)
    if (run === undefined) return { status: 'not-running' }
    run.cancel()
    return { status: 'cancelled' }
  }

  /** Keep only the most recent runs addressable. */
  private prune(): void {
    while (this.runs.size > RETAINED_RUNS) {
      const oldest = this.runs.keys().next()
      if (oldest.done === true) return
      this.runs.delete(oldest.value)
    }
  }

  /** Probe the official surfaces this plugin defers to. */
  private seamFacts(): HostSeamFacts {
    return {
      managerMounted: this.manager() !== undefined,
      accountMounted: this.ctx.get('accountController') !== undefined
    }
  }

  /**
   * Read the official account state, read-only.
   *
   * Only the one status value the official account UI itself keys on
   * (`credential-stored`) is treated as signed in; every other shape — an
   * absent service, a rejected call, an unrecognised status — is reported as
   * `unknown` rather than guessed at.
   *
   * @returns the observed account state.
   */
  async accountState(): Promise<AccountState> {
    const controller: unknown = this.ctx.get('accountController')
    if (typeof controller !== 'object' || controller === null) return 'unknown'
    const getState = (controller as Partial<AccountControllerLike>).getState
    if (typeof getState !== 'function') return 'unknown'

    try {
      const state: unknown = await getState.call(controller)
      if (typeof state !== 'object' || state === null) return 'unknown'
      const view = (state as { view?: unknown }).view
      const status = typeof view === 'object' && view !== null ? (view as { status?: unknown }).status : undefined
      if (status === 'credential-stored') return 'signed-in'
      if (typeof status === 'string') return 'signed-out'
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }
}

/**
 * Remote method markers. Written by hand because the upstream Typert code
 * generator is not published for third-party packages; see
 * `./remote-marker.ts` and its round-trip test.
 */
markRemoteMethods(PackInstaller.prototype, ['catalog', 'install', 'progress', 'result', 'cancel', 'hostSeam'])

/** Re-exported so the manifest can be checked against the service key. */
export { OFFICIAL_ACCOUNT_NAMESPACE, OFFICIAL_PLUGIN_SECTION_ID, OFFICIAL_SETTINGS_SECTION_SLOT, SERVICE_NAME }

export default PackInstaller
