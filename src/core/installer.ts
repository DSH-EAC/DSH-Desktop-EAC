/**
 * The installation engine.
 *
 * A run walks the confirmed selection in pack order, one component at a time —
 * the DSH plugin manager serialises profile package operations anyway, and a
 * sequential walk keeps progress honest (one step is ever "installing").
 *
 * Everything the engine needs from the outside world arrives as an
 * {@link InstallerPort}: the Host adapter implements it over the DSH plugin
 * manager / `dsh plugin` CLI, the tests implement it over a fake. That is what
 * keeps this module free of `@deepseek-ai/*` imports.
 *
 * @module core/installer
 */

import type { ComponentState, InstallProgress, InstallRequest, PackComponent, PackView, StepProgress } from '../protocol.ts'
import { decideEnable } from './tier-policy.ts'

/** What one package-manager call reported. */
export interface PortResult {
  readonly ok: boolean
  readonly message?: string | null
  /**
   * Observed enablement after the call. `false`/`true` are facts the port read
   * back; `null`/absent means the transport cannot see enablement (the CLI
   * fallback), which the UI renders as "installed, enablement unknown".
   */
  readonly enabled?: boolean | null
}

/** What one enable call reported. */
export interface EnableResult {
  readonly ok: boolean
  readonly enabled: boolean | null
  readonly message?: string | null
}

/** Identity of one component, as the port needs it to find the plugin again. */
export interface PortComponent {
  /** Catalog record id, e.g. `dev.tt-a1i.archify-dsh`. */
  readonly componentId: string
  /** Package name as published, e.g. `@tt-a1i/archify-dsh`. */
  readonly name: string
}

/** The Host seam the engine drives. */
export interface InstallerPort {
  /**
   * Install one spec.
   * @param spec - registry spec or https tarball URL.
   * @param context - component identity plus the activation the tier policy decided.
   */
  install(
    spec: string,
    context: PortComponent & { readonly requestId: string; readonly activate: boolean }
  ): Promise<PortResult>
  /** Ask for one installed plugin to be enabled. */
  setEnabled(component: PortComponent, enabled: boolean): Promise<EnableResult>
}

/** A running installation, observed by the settings section. */
export interface InstallRun {
  readonly requestId: string
  /** Current immutable snapshot. */
  progress(): InstallProgress
  /** Stop before the next component; the in-flight component still settles. */
  cancel(): void
  /** Settles with the final snapshot. */
  readonly done: Promise<InstallProgress>
}

/** Input of {@link startInstall}. */
export interface StartInstallOptions {
  readonly request: InstallRequest
  readonly pack: PackView
  readonly port: InstallerPort
  readonly requestId?: string
  readonly now?: () => number
  readonly onProgress?: (progress: InstallProgress) => void
}

let sequence = 0

function nextRequestId(): string {
  sequence += 1
  return `pack-install-${Date.now().toString(36)}-${sequence}`
}

function freezeStep(step: StepProgress): StepProgress {
  return Object.freeze({ ...step })
}

function freezeProgress(progress: InstallProgress): InstallProgress {
  return Object.freeze({ ...progress, steps: Object.freeze(progress.steps.map(freezeStep)) })
}

/**
 * Resolve one requested component id against the pack.
 * @throws {Error} for an unknown id or a component with no install spec — the
 *   Host refuses the request instead of installing a subset silently.
 */
function resolveRequested(pack: PackView, componentId: string): PackComponent {
  const component = pack.components.find((candidate) => candidate.id === componentId)
  if (component === undefined) throw new Error(`install request names an unknown component: ${componentId}`)
  if (component.installSpec === null) throw new Error(`install request names a component with no install spec: ${componentId}`)
  return component
}

/**
 * Start one installation.
 *
 * @param options - request, pack, port and observers.
 * @returns a handle whose `done` settles with the final snapshot.
 * @throws {Error} synchronously when the request names an unknown or
 *   uninstallable component, or when the pack does not match the request.
 */
export function startInstall(options: StartInstallOptions): InstallRun {
  const { request, pack, port, onProgress } = options
  const now = options.now ?? (() => Date.now())
  if (request.packId !== pack.id) {
    throw new Error(`install request names pack ${request.packId} but was resolved against ${pack.id}`)
  }

  const planned = request.componentIds.map((componentId) => resolveRequested(pack, componentId))
  const consented = new Set(request.enableComponentIds)
  const requestId = options.requestId ?? nextRequestId()
  const startedAt = now()

  let cancelled = false
  let current: InstallProgress = freezeProgress({
    requestId,
    packId: pack.id,
    state: 'running',
    startedAt,
    finishedAt: null,
    error: null,
    steps: planned.map((component) => ({
      componentId: component.id,
      name: component.name,
      installSpec: component.installSpec,
      state: 'pending' as ComponentState,
      tier: component.tier,
      enableRequested: false,
      enabled: null,
      message: null
    }))
  })

  const publish = (next: InstallProgress): void => {
    current = freezeProgress(next)
    try {
      onProgress?.(current)
    } catch {
      // An observer must never break an installation that is already running.
    }
  }

  publish(current)

  const settle = (state: InstallProgress['state'], error: string | null, fromIndex: number): void => {
    const steps = current.steps.map((step, index) =>
      index >= fromIndex && step.state === 'pending' ? { ...step, state: 'skipped' as ComponentState } : step
    )
    publish({ ...current, state, error, finishedAt: now(), steps })
  }

  const run = async (): Promise<InstallProgress> => {
    for (const [index, component] of planned.entries()) {
      if (cancelled) {
        settle('cancelled', null, index)
        return current
      }

      const decision = decideEnable(component.tier, consented.has(component.id))
      const activate = decision.action === 'enable'

      publish({
        ...current,
        steps: current.steps.map((step, stepIndex) =>
          stepIndex === index ? { ...step, state: 'installing', enableRequested: activate } : step
        )
      })

      const result = await port.install(component.installSpec as string, {
        requestId,
        componentId: component.id,
        name: component.name,
        activate
      })

      if (!result.ok) {
        publish({
          ...current,
          steps: current.steps.map((step, stepIndex) =>
            stepIndex === index ? { ...step, state: 'failed', message: result.message ?? '安装失败' } : step
          )
        })
        settle('failed', `${component.id}: ${result.message ?? '安装失败'}`, index + 1)
        return current
      }

      let state: ComponentState
      let enabled: boolean | null = result.enabled ?? null
      let message: string | null = decision.reason

      if (activate) {
        const enabledResult = await port.setEnabled({ componentId: component.id, name: component.name }, true)
        if (enabledResult.ok) {
          state = 'enabled'
          enabled = enabledResult.enabled ?? true
          message = enabledResult.message ?? decision.reason
        } else {
          state = 'installed'
          enabled = enabledResult.enabled ?? false
          message = enabledResult.message ?? '已安装，但启用失败'
        }
      } else if (result.enabled === false) {
        state = 'disabled'
        message = decision.reason
      } else {
        // The transport cannot see enablement (the `dsh plugin` CLI path).
        state = 'installed'
        enabled = null
        message = result.message ?? decision.reason
      }

      publish({
        ...current,
        steps: current.steps.map((step, stepIndex) => (stepIndex === index ? { ...step, state, enabled, message } : step))
      })
    }

    if (cancelled) {
      settle('cancelled', null, planned.length)
      return current
    }
    settle('completed', null, planned.length)
    return current
  }

  const done = Promise.resolve().then(run)

  return {
    requestId,
    progress: () => current,
    cancel: () => {
      cancelled = true
    },
    done
  }
}
