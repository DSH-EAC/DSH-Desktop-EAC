/**
 * The two Host transports an installation can run over.
 *
 * Both are the *existing* DSH plugin management surface — no bespoke installer:
 *
 *  - {@link createManagerPort} drives the mounted `pluginManager` Cordis
 *    service (`installBundle` / `setPluginEnabled` / `listPlugins`), the same
 *    service the Web plugin manager and the agent tools use. This is the
 *    preferred transport: it reports activation back, so the installer can
 *    honour L3 by installing with activation off.
 *  - {@link createCliPort} shells out to `dsh plugin --profile <name> add
 *    <spec>`, which is pnpm under the profile's own configuration. It is the
 *    fallback for a profile that does not mount `pluginManager`; it cannot see
 *    or set enablement, and says so instead of guessing.
 *
 * Neither factory imports an upstream package: the manager is described by the
 * narrow {@link ManagerLike} interface it must satisfy, so the mapping logic is
 * unit-testable without a live DSH.
 *
 * @module adapter/ports
 */

import type { EnableResult, InstallerPort, PortComponent, PortResult } from '../core/installer.ts'

/** The subset of `PluginManager` this installer uses. */
export interface ManagerChangeResult {
  readonly changed?: boolean
  readonly application?: string
  readonly enabled?: boolean
  readonly error?: { readonly code?: string; readonly diagnostic?: string } | undefined
  readonly warnings?: readonly string[] | undefined
}

/** Structural view of `ctx.pluginManager`. */
export interface ManagerLike {
  installBundle(spec: string, options?: { enabled?: boolean; requestId?: string }): Promise<ManagerChangeResult>
  setPluginEnabled(id: string, enabled: boolean): Promise<ManagerChangeResult>
  listPlugins(): Promise<readonly { readonly id: string; readonly name: string }[]>
}

/** Runner abstraction over `child_process`, so the CLI port is testable. */
export interface CliRunner {
  run(command: string, args: readonly string[]): Promise<{ readonly exitCode: number; readonly output: string }>
}

/** Applications that count as "installed" rather than "failed". */
const SUCCESSFUL_APPLICATIONS = new Set(['applied', 'restart-required', 'overridden'])

function describeChange(result: ManagerChangeResult, fallback: string | null): string | null {
  const diagnostic = result.error?.diagnostic
  if (typeof diagnostic === 'string' && diagnostic.length > 0) return diagnostic
  if (result.error?.code !== undefined) return `${result.error.code}`
  const warning = result.warnings?.[0]
  if (typeof warning === 'string' && warning.length > 0) return warning
  if (result.application === 'restart-required') return '已写入 profile，重启 DSH 后生效'
  return result.changed === false ? fallback : null
}

/**
 * Find the loader entry id of one installed package.
 * @param manager - the mounted plugin manager.
 * @param component - the component whose package name to match.
 * @returns the entry id, or `null` when the package is not in the profile yet.
 */
export async function findEntryId(manager: ManagerLike, component: PortComponent): Promise<string | null> {
  const plugins = await manager.listPlugins()
  const entry = plugins.find((candidate) => candidate.name === component.name)
  return entry?.id ?? null
}

/**
 * The preferred transport: the mounted DSH plugin manager.
 *
 * @param manager - `ctx.pluginManager`.
 * @returns an {@link InstallerPort} that reports activation back.
 */
export function createManagerPort(manager: ManagerLike): InstallerPort {
  return {
    async install(spec, context): Promise<PortResult> {
      try {
        const result = await manager.installBundle(spec, { enabled: context.activate, requestId: context.requestId })
        const application = result.application ?? 'applied'
        if (!SUCCESSFUL_APPLICATIONS.has(application)) {
          return { ok: false, message: describeChange(result, `pluginManager 返回 ${application}`) ?? `pluginManager 返回 ${application}` }
        }
        return {
          ok: true,
          message: describeChange(result, `已安装 ${spec}`),
          enabled: typeof result.enabled === 'boolean' ? result.enabled : null
        }
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) }
      }
    },

    async setEnabled(component, enabled): Promise<EnableResult> {
      try {
        const entryId = await findEntryId(manager, component)
        if (entryId === null) {
          return { ok: false, enabled: null, message: `profile 中找不到 ${component.name} 的加载条目，未启用` }
        }
        const result = await manager.setPluginEnabled(entryId, enabled)
        const application = result.application ?? 'applied'
        if (!SUCCESSFUL_APPLICATIONS.has(application)) {
          return { ok: false, enabled: false, message: describeChange(result, `启用 ${component.name} 失败`) }
        }
        return {
          ok: true,
          enabled: typeof result.enabled === 'boolean' ? result.enabled : enabled,
          message: describeChange(result, null) ?? null
        }
      } catch (error) {
        return { ok: false, enabled: false, message: error instanceof Error ? error.message : String(error) }
      }
    }
  }
}

/**
 * The fallback transport: `dsh plugin --profile <name> add <spec>`.
 *
 * Enablement is outside this transport's reach — the CLI activates what it
 * installs and has no disable verb — so `install` answers `enabled: null` and
 * the progress row reads "已安装，启用状态未知".
 *
 * @param options - profile name, `dsh` command and runner.
 * @returns an {@link InstallerPort} over the CLI.
 */
export function createCliPort(options: { profile: string; dshCommand?: string; runner: CliRunner }): InstallerPort {
  const dshCommand = options.dshCommand ?? 'dsh'
  const args = ['plugin', '--profile', options.profile]

  return {
    async install(spec): Promise<PortResult> {
      const result = await options.runner.run(dshCommand, [...args, 'add', spec])
      if (result.exitCode !== 0) {
        return { ok: false, message: `dsh plugin add 退出码 ${result.exitCode}：${result.output.trim().slice(-500)}` }
      }
      return {
        ok: true,
        message: '已通过 dsh plugin 安装；该路径无法报告启用状态，请在「插件」设置中确认',
        enabled: null
      }
    },

    async setEnabled(component, enabled): Promise<EnableResult> {
      return {
        ok: false,
        enabled: null,
        message: `当前 profile 未挂载 pluginManager，无法自动${enabled ? '启用' : '停用'} ${component.name}；请在「插件」设置中手动切换`
      }
    }
  }
}

/**
 * Pick the transport: the manager when the profile mounts it, the CLI otherwise.
 *
 * @param manager - `ctx.pluginManager`, or `undefined` when the profile has none.
 * @param cliPort - the CLI fallback.
 * @returns the port the engine should drive.
 */
export function selectPort(manager: ManagerLike | undefined, cliPort: InstallerPort): InstallerPort {
  return manager === undefined ? cliPort : createManagerPort(manager)
}
