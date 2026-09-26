/**
 * The official-host seam: what this plugin reuses, what it must never own.
 *
 * Hard requirements folded into M5:
 *  - the official desktop's installation UI and post-install sign-in are
 *    *reused*, not reimplemented;
 *  - a signed-in DeepSeek account carries model use, so the installer must end
 *    at the official sign-in surface — never at a plugin-owned credential form;
 *  - the plugin owns no credentials and stores none.
 *
 * This module only *describes* that seam. Nothing here imports, copies or
 * mirrors official implementation code: the surface names below are the
 * publicly visible Cordis service / slot / Remote identifiers. Reuse of the
 * official install UI and login experience is an adapter boundary whose
 * concrete wiring is subject to the pinned-source and licence audit.
 *
 * @module core/host-seam
 */

import {
  EAC_WORDMARK,
  OFFICIAL_ACCOUNT_NAMESPACE,
  OFFICIAL_ACCOUNT_SECTION_ID,
  OFFICIAL_SETTINGS_SECTION_SLOT,
  type OfficialHostSeam,
  type OfficialSurface,
  type PostInstallStep
} from '../protocol.ts'

/** What the Host adapter observed about the running DSH. */
export interface HostSeamFacts {
  /** Whether `pluginManager` is mounted (manager transport) or only the CLI is reachable. */
  readonly managerMounted: boolean
  /** Whether the official account controller is mounted. */
  readonly accountMounted: boolean
}

/** What the installer may say about the signed-in DeepSeek account. */
export type AccountState =
  /** The official account Remote reports a stored credential: model use needs no API key. */
  | 'signed-in'
  /** The official account Remote reports no credential: the user must sign in. */
  | 'signed-out'
  /** The account surface is absent or unreadable; the installer must not guess. */
  | 'unknown'

/** Facts one finished installation contributes to the closing steps. */
export interface PostInstallFacts {
  readonly installedCount: number
  readonly enabledCount: number
  /** Steps whose enablement the transport could not observe. */
  readonly unknownEnablementCount: number
  /** Whether any step reported that a restart is required. */
  readonly restartRequired: boolean
  readonly account: AccountState
}

/**
 * Describe the seam for the settings section's footer and for diagnostics.
 *
 * `settingsShell` and `installUi` are *targets this plugin declares*, not
 * runtime probes: the plugin mounts into the official settings shell and defers
 * to the official plugin manager by construction. `account` is a probe, because
 * whether the official account surface is mounted genuinely varies by profile —
 * and an unmounted account surface must read as absent, never as signed in.
 *
 * @param facts - what the adapter observed.
 * @returns the seam descriptor, including the wordmark the section renders.
 */
export function describeHostSeam(facts: HostSeamFacts): OfficialHostSeam {
  return {
    manager: facts.managerMounted ? 'pluginManager' : 'cli-fallback',
    settingsShell: OFFICIAL_SETTINGS_SECTION_SLOT,
    account: facts.accountMounted ? OFFICIAL_ACCOUNT_NAMESPACE : null,
    accountSection: OFFICIAL_ACCOUNT_SECTION_ID,
    installUi: 'official-plugin-manager',
    credentials: 'official-account-remote',
    wordmark: EAC_WORDMARK
  }
}

/**
 * The closing steps an installation hands the user to.
 *
 * Ordering is deliberate: sign-in comes last-but-one because model use depends
 * on it, and the plugin's own job ends there. Every step names an official
 * surface; the plugin never asks for a key, a token or a password.
 *
 * @param facts - what the finished run observed.
 * @returns the steps to show, in order; empty when nothing is left to do.
 */
export function postInstallSteps(facts: PostInstallFacts): PostInstallStep[] {
  const steps: PostInstallStep[] = []

  if (facts.installedCount === 0) {
    return [
      {
        kind: 'done',
        label: '没有需要安装的组件',
        detail: '所选项都已安装，无需改动。',
        target: null
      }
    ]
  }

  if (facts.unknownEnablementCount > 0) {
    steps.push({
      kind: 'enable-plugins',
      label: '确认插件启用状态',
      detail: `${facts.unknownEnablementCount} 个组件通过 dsh plugin CLI 安装，该路径无法报告启用状态；请在官方「插件」设置中确认。`,
      target: 'official-plugin-settings'
    })
  }

  if (facts.restartRequired) {
    steps.push({
      kind: 'restart',
      label: '重启 DSH',
      detail: 'profile 已写入，重启 DSH 后新插件生效。',
      target: 'official-restart'
    })
  }

  if (facts.account === 'signed-out') {
    steps.push({
      kind: 'sign-in',
      label: '登录 DeepSeek 账号',
      detail: '登录后即可直接使用模型，无需填写 API Key。登录入口与凭据由官方账号界面持有，本插件不接触任何密钥。',
      target: 'official-account-settings'
    })
  } else if (facts.account === 'unknown') {
    steps.push({
      kind: 'sign-in',
      label: '确认 DeepSeek 账号登录状态',
      detail: '无法读取官方账号状态；若尚未登录，请在官方「账号」设置中登录，登录后无需 API Key 即可使用模型。',
      target: 'official-account-settings'
    })
  }

  if (steps.length === 0) {
    steps.push({
      kind: 'done',
      label: '安装完成',
      detail: `已安装并启用 ${facts.enabledCount} 个组件；DeepSeek 账号已登录，可直接使用模型。`,
      target: null
    })
  }

  return steps
}

/** The official surface a step hands off to, or `null` for a terminal step. */
export function surfaceOf(step: PostInstallStep): OfficialSurface | null {
  return step.target
}
