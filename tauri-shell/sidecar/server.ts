'use strict';

// L2 Node sidecar 实体化（ADR 0002；T3-a 第二阶段）。
// v6 Task 3.1（ADR 0006）：最简本体版。职责收窄为——
//   1. stdio 行分隔 JSON-RPC 分发器（协议与 ping.js 一致，Rust L1 唯一对话面）
//   2. 挂载最简本体模块（boot-server 及其基础闭包）
//   3. 白名单方法注册表（Rust 壳调用面：boot.* / chrome.init / menu.action /
//      files.* / shell.info / profile.*）
// 剥离面（插件系统 / 更新体系 / 余额 / 手机桥 / 向导 / SDK 隔离宿主）按
// ADR 0006 移出装配；代码保留在仓库原位，由 Task 3.2/3.3/4/5/6 以包接回。
//
// 纪律：stdout 只走协议帧；一切日志/兜底输出走 stderr。

import path = require('node:path');
import os = require('node:os');
import fs = require('node:fs');
import readline = require('node:readline');

// 资源根：开发态 tauri-shell/sidecar → 仓库根/dsh-desktop；
// 打包态 resources/sidecar → resources/dsh-desktop（少一级）。
function resolveDesktopRoot(): string {
  const upTwo = path.resolve(__dirname, '..', '..', 'dsh-desktop');
  if (fs.existsSync(path.join(upTwo, 'package.json'))) return upTwo;
  const upOne = path.resolve(__dirname, '..', 'dsh-desktop');
  if (fs.existsSync(path.join(upOne, 'package.json'))) return upOne;
  return upTwo;
}
const DSH_DESKTOP_ROOT = process.env.DSH_RESOURCE_ROOT
  ? path.join(process.env.DSH_RESOURCE_ROOT, 'dsh-desktop')
  : resolveDesktopRoot();
const LIB = (m: string): string => path.join(DSH_DESKTOP_ROOT, 'lib', 'desktop', m);

function say(s: string): void { process.stderr.write('[sidecar] ' + s + '\n'); }

// ---- 宿主语义（对齐 Electron main.js 的注入值） --------------------------
const log = (tag: string, msg: string): void => say('[' + tag + '] ' + msg);

let pkgVersion = '0.0.0';
try {
  pkgVersion = JSON.parse(fs.readFileSync(path.join(DSH_DESKTOP_ROOT, 'package.json'), 'utf8')).version || pkgVersion;
} catch { /* 保持缺省 */ }

type Mod = { init: (d: unknown) => void } & Record<string, unknown>;
const mount = (name: string): Mod => require(LIB(name)) as Mod;

const procMod = mount('proc');
const platformMod = mount('platform') as Mod & {
  createDesktopPlatform(): {
    userDataDir(): string;
    capabilities(): Record<string, unknown>;
  };
};
const desktopPlatform = platformMod.createDesktopPlatform();
const userDataDir = desktopPlatform.userDataDir();
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const pathsMod = mount('runtime-paths');
const profileMod = mount('profile');
const runtimePatchesMod = mount('runtime-patches');
const bootMod = mount('boot-server');

// v6 Task 3.3：插件治理三件套接回（ADR 0006 v3 插口契约）——
// companion-sync/guard-box 由 guard-box 依赖链引入，plugin-ops 提供插件启停。
const guardBoxMod = mount('guard-box');
const companionSyncMod = mount('companion-sync');
const pluginOpsMod = mount('plugin-ops');
// v6 Task 3.3：files.* 白名单根（files.revert / files.authorize-open 消费）。
const fileRootsMod = mount('file-roots');
// v6 Task 6.2.4：导入管理 UI 的 coordinator RPC 适配层（skin.* 方法族）。
// 本模块只做「定位 manager / 翻译显式意图 / 原样带出 fault」，不另写选择与回滚策略。
const skinManagerMod = mount('skin-manager') as Mod & {
  invoke(method: string, params: unknown): Promise<unknown>;
  SKIN_MANAGER_METHODS: string[];
  acquireHostOwnership(): Promise<{owns(): Promise<boolean>}>;
};

// v6 Task 3.1（ADR 0006 v3 · 严格模式）：本体只保留对 dsh 的最简包装。
// capability-stubs 仅提供内部 boot glue，不注册公开降级方法。
import stubs = require('./capability-stubs');

const MOUNTED = ['proc', 'platform', 'runtime-paths', 'profile', 'guard-box', 'runtime-patches', 'companion-sync', 'plugin-ops', 'file-roots', 'boot-server', 'skin-manager'];

// 打包态判定 + 资源根：Rust 壳 spawn sidecar 时注入 DSH_SHELL_EXE /
// DSH_RESOURCE_ROOT（main.rs Sidecar::spawn）。DSH_RESOURCE_ROOT 存在即打包态；
// 开发态两者缺省 → isPackaged=false。
function isPackagedRuntime(): boolean {
  return Boolean(process.env.DSH_RESOURCE_ROOT);
}
function resourceRoot(): string {
  return process.env.DSH_RESOURCE_ROOT || '';
}

// ---- ctx 注入（与 main.js 注入块逐项对齐；GUI 类能力走兜底/委托） --------
const desktopProfileFn = profileMod.desktopProfile as () => string;
const notifyFallback = (n: { title: string; body: string }): void => {
  say('[notify] ' + n.title + ': ' + n.body);
  notify('shell.system-notification', { title: n.title, body: n.body });
};

procMod.init({ log, getDshHome: () => dshHome, getDesktopProfile: desktopProfileFn });
pathsMod.init({ log, getUserDataDir: () => userDataDir, isPackaged: () => isPackagedRuntime(), resourcesPath: () => resourceRoot(), platform: process.platform });
profileMod.init({ log, getDshHome: () => dshHome });
runtimePatchesMod.init({ log, getDshHome: () => dshHome, getUserDataDir: () => userDataDir });
// v6 Task 3.3：三件套 init（注入点与 v6 收窄面一致，见 ADR 0006 裁决项 5）。
guardBoxMod.init({
  log,
  getDshHome: () => dshHome,
  getDesktopProfile: desktopProfileFn,
  getDshBin: () => (pathsMod.dshBin as () => string)(),
});
pluginOpsMod.init({ log });
companionSyncMod.init({
  log,
  getDshHome: () => dshHome,
  getUserDataDir: () => userDataDir,
  // v6：皮肤行写入随皮肤系统剥出（Task 3.2 接回），此处保持空实现。
  applyLegacySkinChoice: () => { /* Task 3.2 接回 */ },
  showMainWindow: () => say('showMainWindow (host-delegated)'),
  notify: notifyFallback,
  platform: process.platform,
});
// v6 Task 6.2.4：skin.* 适配层注入点（资源根 / 打包态判定 / 状态根）。
skinManagerMod.init({
  log,
  resourceRoot: () => resourceRoot(),
  isPackaged: () => isPackagedRuntime(),
  userDataDir: () => userDataDir,
});

// ---- boot-server（P2：dsh web 服务编排） --------------------------------
// settings 兼容层：与 updater.js 的 userData/settings.json 同文件同语义
// （load 回退 {}，save 2 空格缩进 + 尾换行）。
let quitting = false;

const settingsFile = path.join(userDataDir, 'settings.json');
const { readJsonFile, writeJsonAtomic } = require(path.join(DSH_DESKTOP_ROOT, 'lib', 'atomic-json.js')) as {
  readJsonFile(file: string): Record<string, unknown> | null;
  writeJsonAtomic(file: string, value: unknown): void;
};
const { verifyBundle } = require(path.join(DSH_DESKTOP_ROOT, 'bundle-integrity.js')) as {
  verifyBundle(
    nodeModulesRoot: string,
    manifest: Record<string, unknown>,
  ): {
    ok: boolean;
    damaged: Array<{ name: string; reason: string; expected?: number; actual?: number }>;
  };
};
function loadSettings(): Record<string, unknown> {
  return readJsonFile(settingsFile) ?? {};
}
function saveSettings(s: Record<string, unknown>): void {
  try { writeJsonAtomic(settingsFile, s); } catch (e) { say('保存 settings 失败: ' + String(e)); }
}

/** 无 id 的 JSON-RPC 通知帧（Rust 侧经 WS 广播给页面，并自行订阅壳层事件）。 */
function notify(method: string, params: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method, params: params == null ? {} : params }) + '\n');
}

// 全局兜底：sidecar 裸崩 = 整壳失去桥能力。unhandledRejection 记日志继续跑；
// uncaughtException 记日志后退场 —— 壳层 reader 广播 boot.server-died 走
// /died 恢复链，好过无声僵死。
process.on('unhandledRejection', (reason) => {
  log('fatal', 'unhandledRejection: ' + String((reason instanceof Error ? reason.stack : reason) || reason));
});
process.on('uncaughtException', (err) => {
  try { log('fatal', 'uncaughtException: ' + String((err && err.stack) || err)); } catch { /* 尽力而为 */ }
  process.exit(1);
});

bootMod.init({
  log,
  getUserDataDir: () => userDataDir,
  getDesktopProfile: desktopProfileFn,
  desktopProfileDir: () => (profileMod.desktopProfileDir as () => string)(),
  nodeExe: () => (pathsMod.nodeExe as () => string)(),
  dshBin: () => (pathsMod.dshBin as () => string)(),
  loadSettings,
  saveSettings,
  isQuitting: () => quitting,
  onServerDied: (info: unknown) => {
    notify('boot.server-died', info);
  },
});

say('modules mounted (v6 minimal core); dshHome=' + dshHome + '; profile=' + desktopProfileFn());

// ---- SessionWatcher（保留：ADR 0006 已裁决项 1） ---------------------------
// 会话任务完成通知：2s 轮询 <dshHome>/sessions，turn/end 时经壳层系统通知
// 提醒（notifyOnTurnEnd 设置项控制，同会话 30s 限频）。输入是内核自有数据，
// 不依赖插件面 —— 属「完成一轮对话」最简路径的体验闭环。
const sessionWatcherMod = require(path.join(DSH_DESKTOP_ROOT, 'session-watcher.js')) as {
  SessionWatcher: new (opts: {
    sessionsDir: string;
    log: (tag: string, msg: string) => void;
    onTurnEnd: (info: { sessionId: string; title?: string; body?: string }) => void;
  }) => { start(): void; stop(): void };
};
let sessionWatcher: { start(): void; stop(): void } | null = null;
const turnEndNotifyAt = new Map<string, number>();
function startSessionWatcher(): void {
  if (sessionWatcher) return;
  try {
    const s = loadSettings() as { notifyOnTurnEnd?: boolean };
    if (s.notifyOnTurnEnd === false) return;
    sessionWatcher = new sessionWatcherMod.SessionWatcher({
      sessionsDir: path.join(dshHome, 'sessions'),
      log,
      onTurnEnd: (info) => {
        if (quitting) return;
        const now = Date.now();
        const last = turnEndNotifyAt.get(info.sessionId) || 0;
        if (now - last < 30000) return; // 同会话至多一条 toast / 30s
        if (turnEndNotifyAt.size >= 500) {
          const oldest = [...turnEndNotifyAt.entries()].sort((a, b) => a[1] - b[1]).slice(0, 250);
          for (const [k] of oldest) turnEndNotifyAt.delete(k);
        }
        turnEndNotifyAt.set(info.sessionId, now);
        notifyFallback({
          title: info.title || 'DSH 任务完成',
          body: info.body || '会话任务已完成',
        });
      },
    });
    sessionWatcher.start();
  } catch (e) {
    say('SessionWatcher 启动失败（不影响主流程）: ' + String(((e as Error).message) || e));
  }
}

// 前置文件树准备（v6 Task 3.3 接回版）：退役清理 → 内置插件同步 → 模块遮蔽修复。
// 与 v6 收窄面一致（ADR 0006 裁决项 5）；boot.start 与重启共用。
async function preBootSync(): Promise<void> {
  (profileMod.ensureDesktopProfileInit as () => void)();
  (companionSyncMod.retireRemovedBuiltinPluginsGated as (dir: string) => void)(
    (profileMod.desktopProfileDir as () => string)(),
  );
  (companionSyncMod.syncCompanionPlugins as () => void)();
  (companionSyncMod.healProfileModules as () => void)();
}

// 原地重启（= main.js restartWebServiceCore，v6 最简版）：前置同步 → 拉起。
async function restartWebServiceCore(): Promise<{ ok: boolean; webUrl?: string; port?: number; error?: string }> {
  const running = (bootMod.state as () => { running: boolean })().running;
  (bootMod.setIsRestarting as (v: boolean) => void)(true);
  try {
    if (!running) {
      log('service', '请求启动 dsh web 服务（未在运行）');
      await preBootSync();
      const r = await guardedStartAndWait([]);
      log('service', 'dsh web 服务已启动: ' + r.webUrl);
      notify('boot.web-ready', r);
      return { ok: true, webUrl: r.webUrl, port: r.port };
    }
    log('service', '请求重启 dsh web 服务');
    await (bootMod.killAndWaitForRestart as () => Promise<void>)();
    const r = await guardedStartAndWait([]);
    log('service', 'dsh web 服务已重启: ' + r.webUrl);
    notify('boot.web-ready', r);
    return { ok: true, webUrl: r.webUrl, port: r.port };
  } catch (e) {
    log('service', '重启失败: ' + String(((e as Error).message) || e));
    return { ok: false, error: String(((e as Error).message) || e) };
  } finally {
    (bootMod.setIsRestarting as (v: boolean) => void)(false);
  }
}

function verifyBundleIntegrity(): void {
  if (!isPackagedRuntime()) return;
  const manifestFile = path.join(DSH_DESKTOP_ROOT, 'bundle-manifest.json');
  if (!fs.existsSync(manifestFile)) {
    say('bundle integrity skipped: bundle-manifest.json missing (legacy install)');
    return;
  }
  const manifest = readJsonFile(manifestFile);
  if (!manifest || manifest.version !== 1 || !manifest.packages || typeof manifest.packages !== 'object') {
    throw new Error('bundle integrity check failed: bundle-manifest.json is invalid');
  }
  const result = verifyBundle(path.join(DSH_DESKTOP_ROOT, 'node_modules'), manifest);
  if (result.ok) {
    say('bundle integrity check passed');
    return;
  }
  const summary = result.damaged.slice(0, 10).map((item) =>
    `${item.name}: ${item.reason} (expected=${item.expected ?? 'n/a'}, actual=${item.actual ?? 'n/a'})`
  ).join('; ');
  const omitted = result.damaged.length > 10 ? `; ${result.damaged.length - 10} more` : '';
  throw new Error(`bundle integrity check failed: ${summary}${omitted}`);
}

// ---- 守护启动（v6 严格模式：无快照/事故面 —— guard-box 随插件保护中心剥出；
// overlay 失败隔离（runtime-paths 自带）保留 —— 那是 boot 链的一部分）----
async function guardedStartAndWait(overlays: string[]): Promise<{ webUrl: string; port: number }> {
  const startedWithOverlay = (pathsMod.isUsingOverlay as () => boolean)();
  try {
    let r: { webUrl: string; port: number };
    try {
      r = await (bootMod.startAndWait as (o: string[]) => Promise<{ webUrl: string; port: number }>)(overlays);
    } catch (overlayError) {
      if (!startedWithOverlay) throw overlayError;
      // 乐观优先：真实启动失败后才隔离 overlay，用内置内核重试一次。
      try { await (bootMod.stopServer as () => Promise<void>)(); }
      catch (stopError) { log('update', '停止失败 overlay 的残留进程失败: ' + String(((stopError as Error).message) || stopError)); }
      const quarantine = (pathsMod.quarantineBrokenOverlay as (reason: unknown) => { quarantined: boolean; path?: string; error?: string })(overlayError);
      log('update', '外部 DSH 启动失败，正在使用内置 DSH 重试' + (quarantine.path ? `（问题副本：${quarantine.path}）` : ''));
      try {
        r = await (bootMod.startAndWait as (o: string[]) => Promise<{ webUrl: string; port: number }>)(overlays);
      } catch (bundledError) {
        throw new Error(
          '外部 DSH 启动失败，切换内置 DSH 后仍无法启动。' +
          `外部错误：${String(((overlayError as Error).message) || overlayError)}；` +
          `内置错误：${String(((bundledError as Error).message) || bundledError)}`,
        );
      }
    }
    return r;
  } catch (e) {
    throw e;
  }
}

// ---- 方法注册表 -----------------------------------------------------------
interface RpcReq { id: number | null; method: string; params?: Record<string, unknown> }
type RpcResult = Record<string, unknown>;
type RpcParams = Record<string, unknown> | undefined;

// 图标 dataUri 模块级缓存：壳栏（bridge injectChrome）与关于页经 boot.state 读取。
let chromeIconDataUri: string | null = null;
function chromeIcon(): string {
  if (chromeIconDataUri !== null) return chromeIconDataUri;
  try {
    const buf = fs.readFileSync(path.join(DSH_DESKTOP_ROOT, 'assets', 'icon.png'));
    chromeIconDataUri = buf.length > 0 && buf[0] === 0x89 && buf[1] === 0x50
      ? 'data:image/png;base64,' + buf.toString('base64')
      : '';
  } catch { chromeIconDataUri = ''; /* 无图标不致命 */ }
  return chromeIconDataUri;
}

const methods: Record<string, (p: RpcParams) => unknown> = {
  // 壳自检（--bridge-test）与排障用：只暴露身份与挂载面，不含业务能力。
  'shell.info': (): RpcResult => ({
    sidecar: 'server.ts',
    node: process.version,
    platform: process.platform,
    pid: process.pid,
    version: pkgVersion,
    modules: MOUNTED,
  }),
  'profile.name': (): RpcResult => ({ name: desktopProfileFn() }),
  // ---- boot.*（P2：dsh web 服务编排，Rust 壳的启动主链路） ----
  'boot.start': async (p): Promise<RpcResult> => {
    const overlays = Array.isArray(p && p.overlays) ? (p!.overlays as string[]) : [];
    verifyBundleIntegrity();
    // 前置文件树准备（v6 最简版，见 preBootSync）。
    try {
      await preBootSync();
    } catch (e) {
      say('boot 前置准备失败（继续尝试拉起服务）: ' + String(((e as Error).message) || e));
    }

    let r: { webUrl: string; port: number };
    try {
      r = await guardedStartAndWait(overlays);
    } catch (e) {
      // 崩溃循环计数随救援链剥出（v6 严格模式）：桩只记日志。
      bootFailureRecorder.recordBootFailureNow(String(((e as Error).message) || e));
      notify('boot.failed', { error: String(((e as Error).message) || e) });
      throw e;
    }
    bootFailureRecorder.clearRescueState();
    notify('boot.web-ready', r);
    // 应答必须立刻返回：boot.start 是 Rust 壳 180s 超时的同步等待点。
    setImmediate(() => {
      // 会话任务完成通知（notifyOnTurnEnd 设置项控制）。
      try { startSessionWatcher(); } catch (e) {
        say('会话监听启动失败（不影响启动）: ' + String(((e as Error).message) || e));
      }
    });
    return { ok: true, webUrl: r.webUrl, port: r.port };
  },
  'boot.stop': async (): Promise<RpcResult> => {
    await (bootMod.stopServer as () => Promise<void>)();
    return { ok: true };
  },
  // v6 Task 3.1（ADR 0006 v5）：boot.state 是壳最小控制面的唯一信息接口
  //（chrome.init 已删）—— 在服务状态之上承载壳栏/关于页所需的版本与图标，
  // 以及关窗策略 exitAction（Rust 壳 apply_exit_policy 读取）。
  'boot.state': (): RpcResult => {
    const base = (bootMod.state as () => Record<string, unknown>)();
    const s = loadSettings() as {
      closeToTray?: boolean; exitAction?: string; notifyOnTurnEnd?: boolean;
    };
    const exitAction = s.exitAction === 'ask' || s.exitAction === 'minimize' || s.exitAction === 'quit'
      ? s.exitAction
      : s.closeToTray === false ? 'quit' : s.closeToTray === true ? 'minimize' : 'ask';
    return {
      ...base,
      appVersion: pkgVersion,
      agentVersion: (pathsMod.dshVersion as () => string)(),
      agentSource: (pathsMod.dshVersionSource as () => string)(),
      iconDataUri: chromeIcon(),
      exitAction,
      // v6 Task 3.3：插件（dsh-client-file-changes）经 bridge.getInfo() 读
      // staticPort 拼静态预览 URL。静态预览服务随插件面剥出，故恒 0 ——
      // 客户端按既有契约回退宿主 /dsh-files/static/ 路由（非错误路径）。
      staticPort: 0,
    };
  },
  // ---- 插件管理（v6 Task 3.3 接回）----------------------------------------
  // 仅供本机 Web UI 经 bridge 调用；Rust 壳不直接消费这些方法
  //（main.rs 仅测试断言出现 plugins.list）。
  'plugins.list': (): RpcResult => ({
    list: (pluginOpsMod.pluginManagerCollect as () => unknown[])(),
  }),
  'plugins.set-enabled': (p): RpcResult =>
    (pluginOpsMod.pluginManagerSetEnabled as (id: string, en: boolean) => Record<string, unknown>)(
      String((p && p.id) || ''), !!(p && p.enabled),
    ),
  'plugins.set-removed': (p): RpcResult =>
    (pluginOpsMod.pluginManagerSetRemoved as (id: string, rm: boolean) => Record<string, unknown>)(
      String((p && p.id) || ''), !!(p && p.removed),
    ),
  // 保护中心动作面（guard-box 真实现覆盖 v6 桩）。
  'guard.ensure': (): RpcResult => ({
    ok: !!(guardBoxMod.ensureGuard as () => unknown)(),
  }),
  'guard.action': (p): RpcResult => {
    const action = String((p && p.action) || '');
    // v6 Task 3.3 修复：插件侧 bridge.guard.action(action, value) 只传两个位置参数
    //（见 dsh-plugin-shield/lib/client.js 的 `var call = function (action, value)`），
    // 因此取参必须是 p.value —— 原实现读 p.label / p.id 会让 snapshot 丢参、
    // restore 直接失效。动作集合按 v5 对齐（保护中心 UI 的 7 个动作）。
    const value = p && p.value;
    const g = (guardBoxMod.ensureGuard as () => Record<string, (...a: unknown[]) => unknown>)();
    switch (action) {
      case 'status': {
        const st = loadSettings() as { shareWebProfile?: boolean };
        return {
          ok: true,
          profile: desktopProfileFn(),
          shareWebProfile: st.shareWebProfile === true,
          // 上限 20 条：快照/事故目录可能很长，避免一次回传压垮 UI。
          snapshots: (g.listSnapshots as () => unknown[])().slice(0, 20),
          incidents: (g.listIncidents as () => unknown[])().slice(0, 20),
          lastGood: (g.lastGoodSnapshot as () => unknown)(),
        };
      }
      case 'snapshot': {
        const s = (g.snapshot as (r: string) => unknown)(String(value || 'manual'));
        return { ok: !!s, snapshot: s };
      }
      case 'restore': {
        // 服务在跑时不允许回滚（文件被占用且随即会被重写）。
        const running = (bootMod.state as () => { running: boolean })().running;
        if (running) {
          return { ok: false, error: 'service-running', hint: '请先重启 Web 服务（或让回滚在重启间隙执行）' };
        }
        return (g.restore as (v: unknown) => Record<string, unknown>)(value) as Record<string, unknown>;
      }
      case 'check':
        return { ok: true, report: (g.healthCheck as () => unknown)() };
      case 'repair': {
        const r = (g.repair as () => { applied: unknown })();
        return { ok: true, applied: r.applied };
      }
      case 'incident':
        return (g.readIncident as (v: unknown) => Record<string, unknown>)(value) as Record<string, unknown>;
      case 'resolve-incident':
        return (g.resolveIncident as (v: unknown) => Record<string, unknown>)(value) as Record<string, unknown>;
      // 以下为 v6 特有的无 UI 消费方动作，保留以兼容既有调用方。
      case 'last-good':
        return { ok: true, snapshot: (g.lastGoodSnapshot as () => unknown)() };
      case 'diagnostics':
        return { ok: true, junctions: (g.junctionFindings as () => unknown[])() as unknown[] };
      case 'repair-junctions':
        return { ok: true, ...(g.repairJunctions as () => Record<string, unknown>)() };
      default:
        return { ok: false, error: 'unknown action' };
    }
  },
  // ---- 文件能力（v6 Task 3.3 接回；dsh-client-file-changes 消费）----
  // files.open 走 Rust L1 的 ShellExecuteW；本方法只做「授权判定」，返回
  // 归一化后的绝对路径供壳层打开（授权必须先于打开，见 main.rs files.open）。
  'files.authorize-open': (p): RpcResult => {
    let fp = (p && p.path) as string;
    if (typeof fp !== 'string' || !path.isAbsolute(fp)) return { ok: false, error: 'path must be absolute' };
    // 归一化必须先于前缀比对：原始串可携带 `..`/大小写变体/符号链接骗过
    // 字面前缀命中。realPath 跟随符号链接与 ..；叶子不存在时用已解析的父
    // 目录拼回（随后 existsSync 把关）。
    try {
      fp = fs.realpathSync(fp);
    } catch {
      try {
        fp = path.resolve(fs.realpathSync(path.dirname(fp)), path.basename(fp));
      } catch { /* 父目录也不可解析：保持原串，交给下方围栏判定 */ }
    }
    const lower = (x: string): string => (process.platform === 'win32' ? x.toLowerCase() : x);
    const skillsRoots = [
      path.join(dshHome, 'skills'),
      path.join(process.env.DSH_AGENTS_HOME || path.join(os.homedir(), '.agents'), 'skills'),
    ].map((r) => lower(path.resolve(r)));
    const fpL = lower(fp);
    const underSkillsRoot = skillsRoots.some((r) => fpL === r || fpL.startsWith(r + path.sep));
    if (!underSkillsRoot && !(fileRootsMod.isUnderFileRoots as (x: string) => boolean)(fp)) {
      return { ok: false, error: 'path outside session workspace' };
    }
    if ((fileRootsMod.DANGEROUS_EXT as RegExp).test(fp)) {
      return { ok: false, error: 'executable files are not openable from the file view' };
    }
    if (!fs.existsSync(fp)) return { ok: false, error: 'file not found' };
    return { ok: true, path: fp };
  },
  // 文件逐项还原（内容精确匹配后替换；上限与 v5 一致）。
  'files.revert': (p): RpcResult => {
    const changes = (p && p.changes) as Array<{ path?: string; oldText?: string; newText?: string }>;
    if (!Array.isArray(changes) || changes.length === 0 || changes.length > 300) return { results: [] };
    const results: Record<string, unknown>[] = [];
    for (const c of changes) {
      const fp = String((c && c.path) || '');
      const oldText = String((c && c.oldText) ?? '');
      const newText = String((c && c.newText) ?? '');
      if (!path.isAbsolute(fp) || oldText.length > 400000 || newText.length > 400000) {
        results.push({ path: fp, status: 'invalid' });
        continue;
      }
      if (!(fileRootsMod.isUnderFileRoots as (x: string) => boolean)(fp)) {
        results.push({ path: fp, status: 'forbidden' });
        continue;
      }
      try {
        const exists = fs.existsSync(fp);
        const content = exists ? fs.readFileSync(fp, 'utf8') : null;
        if (oldText === '' && newText !== '') {
          if (content !== null && content === newText) { fs.rmSync(fp); results.push({ path: fp, status: 'reverted' }); }
          else results.push({ path: fp, status: content === null ? 'missing' : 'conflict' });
        } else if (newText === '' && oldText !== '') {
          if (content === null) { fs.writeFileSync(fp, oldText, 'utf8'); results.push({ path: fp, status: 'reverted' }); }
          else results.push({ path: fp, status: 'conflict' });
        } else {
          if (content !== null && content.includes(newText)) {
            const occurrences = content.split(newText).length - 1;
            fs.writeFileSync(fp, content.replace(newText, () => oldText), 'utf8');
            results.push(occurrences > 1
              ? { path: fp, status: 'reverted', occurrences, note: 'oldText 多处匹配，仅回滚第一处' }
              : { path: fp, status: 'reverted' });
          } else {
            results.push({ path: fp, status: content === null ? 'missing' : 'conflict' });
          }
        }
      } catch (e) {
        results.push({ path: fp, status: 'error', error: String(((e as Error).message) || e) });
      }
    }
    return { results };
  },
  // 注：shell.open-external 与 files.open 属 L1 域，由 Rust handle_shell_method
  // 直接拦截（ShellExecuteW），不经 sidecar。sidecar 只在内部需要打开外链时
  // 用 notify('shell.open-external') 通知壳层执行（见 clientUpdateMod.init）。
  // 拖入文件落盘（dsh-file-drop-eac 消费；上限与 data URL 校验在 plugin-ops）。
  'file-drop.save': (p): RpcResult => {
    try {
      return (pluginOpsMod.fileDropSave as (d: string, n: string) => Record<string, unknown>)(
        String((p && p.dataUrl) || ''), String((p && p.name) || '拖入文件'),
      );
    } catch (e) {
      return { ok: false, error: String(((e as Error).message) || e) };
    }
  },
  // 原地重启 Web 服务核心。
  'boot.restart': async (): Promise<RpcResult> => restartWebServiceCore(),
};

// v6 Task 6.2.4：skin.* 方法族（导入管理 UI 的 coordinator RPC）。
//
// 单一入口转给适配层：这里不解析业务语义、不做策略判断，只把参数原样传下去、
// 把结构化结果（含 ok:false 的 fault）原样带回来。UI 需要的是 code + nextStep，
// 不是一句被 transport 抹平的 message，所以失败也走正常结果而不是 JSON-RPC error。
// One lifetime owner per canonical resolved root. Do not use the publisher lock:
// recovery and force rollback acquire that lock internally. Share the acquisition
// Promise so simultaneous initial RPCs cannot contend with this process itself.
let skinOwnership: Promise<{owns(): Promise<boolean>}> | undefined;
for (const method of skinManagerMod.SKIN_MANAGER_METHODS) {
  methods[method] = async (p: RpcParams): Promise<unknown> => {
    try {
      skinOwnership ??= skinManagerMod.acquireHostOwnership();
      const owner = await skinOwnership;
      if (!await owner.owns()) throw new Error('Sidecar no longer owns the skin root');
    } catch (error) {
      // A rejected sidecar stays rejected; restart it after the owner exits.
      return {ok: false, ready: false, fault: {
        code: 'SKIN_OWNER_UNAVAILABLE',
        message: String(error instanceof Error ? error.message : error),
        nextStep: 'Close the other skin host, then restart this host',
      }};
    }
    return skinManagerMod.invoke(method, p);
  };
}

// ---- 内部 boot glue --------------------------------------------------------
const bootFailureRecorder = stubs.makeBootFailureRecorder(log);

function respond(msg: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line: string) => { void handleLine(line); });
rl.on('close', () => { void gracefulExit(); });

async function gracefulExit(): Promise<void> {
  quitting = true;
  try { if (sessionWatcher) { sessionWatcher.stop(); sessionWatcher = null; } } catch { /* 尽力回收 */ }
  try { await (bootMod.stopServer as () => Promise<void>)(); } catch { /* 尽力回收 */ }
  process.exit(0);
}

async function handleLine(line: string): Promise<void> {
  const text = line.trim();
  if (!text) return;
  let req: RpcReq;
  try { req = JSON.parse(text); } catch {
    return respond({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
  }
  const { id, method, params } = req;
  try {
    if (method === 'ping') return respond({ jsonrpc: '2.0', id, result: { pong: true, ts: Date.now() } });
    if (method === 'shutdown') {
      respond({ jsonrpc: '2.0', id, result: { bye: true } });
      rl.close();
      return;
    }
    const fixed = methods[method];
    if (fixed) {
      const result = await fixed(params);
      return respond({ jsonrpc: '2.0', id, result: result === undefined ? null : result });
    }
    respond({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } });
  } catch (e) {
    respond({ jsonrpc: '2.0', id, error: { code: -32000, message: String(((e as Error).message) || e) } });
  }
}
