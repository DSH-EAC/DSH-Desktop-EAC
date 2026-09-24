'use strict';

// 插件保护中心入口（ADR 0002 L2 业务服务层；Wave 1 自 guard-box.js 类型化迁出）：
// 快照 / 回滚 / 静态体检 / 自动修复 / 守护启动 / 事故报告。
// 实例延迟创建（依赖 dshHome 与 settings 就绪）。

// CJS 直译导入：emit 结果与手写 require 逐行一致，避免 importStar 样板。
import path = require('node:path');
import os = require('node:os');

// plugin-guard.js 尚未类型化（Wave 3 收编），先以窄签名消费；届时改为
// import { createGuard } 的具名导入并获得真实返回类型。
const { createGuard } = require('../../plugin-guard') as {
  createGuard: (opts: GuardDeps) => GuardInstance;
};

/** 注入接口：由宿主（Electron main / Tauri sidecar）在启动时提供。 */
export interface GuardBoxCtx {
  log(tag: string, msg: string): void;
  getDshHome(): string | null;
  getDesktopProfile(): string;
  getDshBin(): string;
}

interface GuardDeps {
  getHome(): string;
  getProfile(): string;
  dshBin(): string;
  log(tag: string, msg: string): void;
}

/** 静态体检发现项（与 plugin-guard.ts 的 Finding 同形态；该模块尚未类型化）。 */
export interface Finding {
  code: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  fixable: boolean;
}

/** 保护中心快照档案（对应 plugin-guard 的 meta.json 形态）。 */
export interface GuardSnapshot {
  id: string;
  reason: string;
  at: string;
  files: string[];
  pluginRows: string[];
}

/** 保护中心实例的已消费面（vnext-absorb：恢复中心补全快照/回滚/事故读取）。 */
export interface GuardInstance {
  snapshot(label: string): GuardSnapshot | null;
  listSnapshots(): GuardSnapshot[];
  restore(id: string): { ok: boolean; restored?: string[]; error?: string };
  lastGoodSnapshot(): GuardSnapshot | null;
  listIncidents(): { id: string; title: string }[];
  junctionFindings(): unknown[];
  repairJunctions(): { repaired: string[] };
  /** 5.3.3 接线：boot 成功后把启动快照标为「最后良好」。此前 guardedBoot
   * 在 Tauri 化时断线（无人调用），lastGood 恒空，恢复中心的
   * 「回退最后良好快照」空转。 */
  markGood(id: string): void;
  /** 5.3.3 接线：boot 失败落事故留痕（供恢复中心展示）。 */
  reportIncident(title: string, detail: string): { ok: boolean; file?: string; error?: string };
  // ---- v6 Task 3.3：插件保护中心 UI（dsh-plugin-shield）消费的动作面 ----
  // 底层 plugin-guard 的 GuardApi 已实现这些方法；此前未在中间层暴露，
  // 导致 guard.action 的 check / repair / incident / resolve-incident 四个
  // 动作无法转发（UI 点了没反应）。
  /** 静态体检：返回 findings 列表供 UI 渲染。 */
  healthCheck(): { at: string; profile: string; findings: Finding[] };
  /** 按体检结果自动修复；未传 findings 时由引擎自行体检。 */
  repair(findings?: Finding[]): { applied: string[] };
  /** 读取单条事故详情（UI 的「事故报告」展开）。 */
  readIncident(id: string): { ok: boolean; content?: string; error?: string };
  /** 标记事故已解决。 */
  resolveIncident(id: string): { ok: boolean; error?: string };
}

let ctx!: GuardBoxCtx;

export function init(d: GuardBoxCtx): void {
  ctx = d;
}

let guardInstance: GuardInstance | null = null;

export function ensureGuard(): GuardInstance {
  if (!guardInstance) {
    guardInstance = createGuard({
      getHome: () => ctx.getDshHome() || path.join(os.homedir(), '.dsh'),
      getProfile: () => ctx.getDesktopProfile(),
      dshBin: () => ctx.getDshBin(),
      log: ctx.log,
    });
  }
  return guardInstance;
}
