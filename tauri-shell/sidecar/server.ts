'use strict';

// L2 Node sidecar 实体化（ADR 0002；T3-a 第二阶段）。
// v6 Task 3.1（ADR 0006）：最简本体版。职责收窄为——
//   1. stdio 行分隔 JSON-RPC 分发器（协议与 ping.js 一致，Rust L1 唯一对话面）
//   2. 挂载最简本体模块（boot-server 及其基础闭包）
//   3. 白名单方法注册表（Rust 壳调用面：boot.* / chrome.init / menu.action /
//      files.* / shell.info / profile.* / rc.* / rescue.*）
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
const guardBoxMod = mount('guard-box');
const runtimePatchesMod = mount('runtime-patches');
const fileRootsMod = mount('file-roots');
const bootMod = mount('boot-server');

// v6 Task 3.1：恢复中心收窄保留三件套（ADR 0006 已裁决项 5）——Rust 壳的
// recovery 链（托盘菜单 / 启动失败 / safe-mode）依赖 rc.action；其动作面
// （插件启停/快照/档案）在最简本体上自然降级为空列表/无操作。
const pluginOpsMod = mount('plugin-ops');
const companionSyncMod = mount('companion-sync');
const recoveryCenter = require(path.join(DSH_DESKTOP_ROOT, 'lib', 'recovery-center', 'register.js')) as {
  init(d: {
    appVersion: string;
    profile: string;
    restartWebService(): Promise<{ ok: boolean; url?: string; error?: string }>;
    requestSafeModeRelaunch(): void;
  }): void;
  handleRcAction(action: string, value?: unknown): Promise<Record<string, unknown>>;
  archivePluginProfiles(): void;
};

const MOUNTED = ['proc', 'platform', 'runtime-paths', 'profile', 'guard-box', 'runtime-patches', 'file-roots', 'companion-sync', 'plugin-ops', 'boot-server'];

// 打包态判定 + 资源根：Rust 壳 spawn sidecar 时注入 DSH_SHELL_EXE /
// DSH_RESOURCE_ROOT（main.rs Sidecar::spawn）。DSH_RESOURCE_ROOT 存在即打包态；
// 开发态两者缺省 → isPackaged=false。
function isPackagedRuntime(): boolean {
  return Boolean(process.env.DSH_RESOURCE_ROOT);
}
function resourceRoot(): string {
  return process.env.DSH_RESOURCE_ROOT || '';
}

const vnextState = require(path.join(DSH_DESKTOP_ROOT, 'lib', 'state.js')) as {
  initVNextState(d: { dshHome?: string; userDataDir?: string; logsDir?: string }): void;
  state: { eacBridge: { url: string; token: string; close(): void } | null; restartingServer: boolean };
};
const vnextLog = require(path.join(DSH_DESKTOP_ROOT, 'lib', 'log.js')) as {
  setLogSink(fn: ((tag: string, msg: string) => void) | null): void;
};

// ---- ctx 注入（与 main.js 注入块逐项对齐；GUI 类能力走兜底/委托） --------
const desktopProfileFn = profileMod.desktopProfile as () => string;
const notifyFallback = (n: { title: string; body: string }): void => {
  say('[notify] ' + n.title + ': ' + n.body);
  notify('shell.system-notification', { title: n.title, body: n.body });
};

procMod.init({ log, getDshHome: () => dshHome, getDesktopProfile: desktopProfileFn });
pathsMod.init({ log, getUserDataDir: () => userDataDir, isPackaged: () => isPackagedRuntime(), resourcesPath: () => resourceRoot(), platform: process.platform });
profileMod.init({ log, getDshHome: () => dshHome });
guardBoxMod.init({
  log,
  getDshHome: () => dshHome,
  getDesktopProfile: desktopProfileFn,
  getDshBin: () => (pathsMod.dshBin as () => string)(),
});
runtimePatchesMod.init({ log, getDshHome: () => dshHome, getUserDataDir: () => userDataDir });
pluginOpsMod.init({ log });
companionSyncMod.init({
  log,
  getDshHome: () => dshHome,
  getUserDataDir: () => userDataDir,
  applyLegacySkinChoice: () => { /* v6：皮肤行写入随皮肤系统剥出（Task 3.2 接回） */ },
  showMainWindow: () => say('showMainWindow (host-delegated)'),
  notify: notifyFallback,
  platform: process.platform,
});

// ---- boot-server（P2：dsh web 服务编排） --------------------------------
// settings 兼容层：与 updater.js 的 userData/settings.json 同文件同语义
// （load 回退 {}，save 2 空格缩进 + 尾换行）。
let quitting = false;

const settingsFile = path.join(userDataDir, 'settings.json');
const { readJsonFile } = require(path.join(DSH_DESKTOP_ROOT, 'lib', 'plugin-copy.js')) as {
  readJsonFile(file: string): Record<string, unknown> | null;
};
const { writeJsonAtomic } = require(path.join(DSH_DESKTOP_ROOT, 'lib', 'atomic-json.js')) as {
  writeJsonAtomic(file: string, value: unknown): void;
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

// ---- vnext 初始化：日志 sink + 共享状态 ------------------------------------
vnextLog.setLogSink(log);
vnextState.initVNextState({ dshHome, userDataDir, logsDir: path.join(userDataDir, 'logs') });

// 前置文件树准备（v6 最简版）：退役清理 → 配套插件同步（收窄面：无内置插件
// 资产时为空转）→ 模块遮蔽修复。市场排队 / SDK 残余清扫 / 技能同步随插件
// 系统剥出。boot.start 与 restart 共用。
async function preBootSync(): Promise<void> {
  (companionSyncMod.retireRemovedBuiltinPluginsGated as (dir: string) => void)((profileMod.desktopProfileDir as () => string)());
  (companionSyncMod.syncCompanionPlugins as () => void)();
  (companionSyncMod.healProfileModules as () => void)();
}

// 原地重启（= main.js restartWebServiceCore，v6 最简版）：前置同步 → 拉起。
async function restartWebServiceCore(): Promise<{ ok: boolean; webUrl?: string; port?: number; error?: string }> {
  const running = (bootMod.state as () => { running: boolean })().running;
  (bootMod.setIsRestarting as (v: boolean) => void)(true);
  vnextState.state.restartingServer = true;
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
    (companionSyncMod.syncCompanionPlugins as () => void)();
    (companionSyncMod.healProfileModules as () => void)();
    const r = await guardedStartAndWait([]);
    log('service', 'dsh web 服务已重启: ' + r.webUrl);
    notify('boot.web-ready', r);
    return { ok: true, webUrl: r.webUrl, port: r.port };
  } catch (e) {
    log('service', '重启失败: ' + String(((e as Error).message) || e));
    return { ok: false, error: String(((e as Error).message) || e) };
  } finally {
    (bootMod.setIsRestarting as (v: boolean) => void)(false);
    vnextState.state.restartingServer = false;
  }
}

// ---- 守护启动（快照 + 最后良好 + 事故留痕；无 updater 面的最简版）----------
async function guardedStartAndWait(overlays: string[]): Promise<{ webUrl: string; port: number }> {
  const g = (guardBoxMod.ensureGuard as () => {
    snapshot(r: string): { id: string } | null;
    markGood(id: string): void;
    reportIncident(t: string, d: string): { ok: boolean };
  })();
  const snap = g.snapshot('boot');
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
    if (snap) g.markGood(snap.id);
    return r;
  } catch (e) {
    try {
      g.reportIncident('boot-failed', 'dsh web 服务拉起失败。\n\n错误：\n' + String(((e as Error).message) || e));
    } catch { /* 尽力而为 */ }
    throw e;
  }
}

recoveryCenter.init({
  appVersion: pkgVersion,
  profile: desktopProfileFn(),
  restartWebService: async () => restartWebServiceCore(),
  requestSafeModeRelaunch: () => notify('shell.relaunch-safe-mode', {}),
});

// ---- 方法注册表 -----------------------------------------------------------
interface RpcReq { id: number | null; method: string; params?: Record<string, unknown> }
type RpcResult = Record<string, unknown>;
type RpcParams = Record<string, unknown> | undefined;

// 图标 dataUri 模块级缓存：bridge openMenu 每次开菜单都调 chrome.init。
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
  'shell.info': (): RpcResult => ({
    sidecar: 'server.ts',
    node: process.version,
    platform: process.platform,
    pid: process.pid,
    dshHome,
    userDataDir,
    capabilities: desktopPlatform.capabilities(),
    version: pkgVersion,
    modules: MOUNTED,
  }),
  'profile.name': (): RpcResult => ({ name: desktopProfileFn() }),
  'profile.dir': (): RpcResult => ({ dir: (profileMod.desktopProfileDir as () => string)() }),
  'runtime.nodeExe': (): RpcResult => ({ exe: (pathsMod.nodeExe as () => string)() }),
  'runtime.dshBin': (): RpcResult => ({ bin: (pathsMod.dshBin as () => string)() }),
  'plugins.removedIds': (): RpcResult => ({ ids: (companionSyncMod.removedPluginIds as () => unknown[])() }),
  'guard.ensure': (): RpcResult => ({ ok: !!(guardBoxMod.ensureGuard as () => unknown)() }),
  // ---- boot.*（P2：dsh web 服务编排，Rust 壳的启动主链路） ----
  'boot.start': async (p): Promise<RpcResult> => {
    const overlays = Array.isArray(p && p.overlays) ? (p!.overlays as string[]) : [];
    // 前置文件树准备（v6 最简版，见 preBootSync）。
    try {
      await preBootSync();
    } catch (e) {
      say('boot 前置准备失败（继续尝试拉起服务）: ' + String(((e as Error).message) || e));
    }
    // 恢复中心直开模式（Rust 壳检测 DSH_DESKTOP_RECOVERY=1 已打开恢复中心
    // 窗口）：跳过 dsh web 启动，sidecar 只保持存活供恢复中心动作调用。
    if (process.env.DSH_DESKTOP_RECOVERY === '1') {
      say('[vnext] DSH_DESKTOP_RECOVERY=1，跳过 dsh web 启动（恢复中心直开模式）');
      return { ok: true, recoveryMode: true };
    }
    let r: { webUrl: string; port: number };
    try {
      r = await guardedStartAndWait(overlays);
    } catch (e) {
      // 崩溃循环计数：连续失败达阈值后，救援页据 rescue.state.crash 引导安全模式。
      rescueIntegration.recordBootFailureNow(String(((e as Error).message) || e));
      notify('boot.failed', { error: String(((e as Error).message) || e) });
      throw e;
    }
    rescueIntegration.clearRescueState?.();
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
  'boot.state': (): RpcResult => (bootMod.state as () => unknown)() as RpcResult,
  // ---- chrome.init（getInfo；字段集对齐 main.js chrome:init handler） ----
  'chrome.init': (): RpcResult => {
    const s = loadSettings() as {
      closeToTray?: boolean; exitAction?: string; shortcutPolicy?: string;
      notifyOnTurnEnd?: boolean; repos?: { github?: string; gitee?: string };
    };
    const iconDataUri = chromeIcon();
    const exitAction = s.exitAction === 'ask' || s.exitAction === 'minimize' || s.exitAction === 'quit'
      ? s.exitAction
      : s.closeToTray === false ? 'quit' : s.closeToTray === true ? 'minimize' : 'ask';
    return {
      appVersion: pkgVersion,
      agentVersion: (pathsMod.dshVersion as () => string)(),
      agentSource: (pathsMod.dshVersionSource as () => string)(),
      notifyOnTurnEnd: s.notifyOnTurnEnd !== false,
      closeToTray: s.closeToTray !== false,
      exitAction,
      shortcutPolicy: s.shortcutPolicy === 'never' ? 'never' : 'auto',
      capabilities: desktopPlatform.capabilities(),
      iconDataUri,
      repoUrls: { github: '', gitee: '' }, // v6：更新源区随更新体系剥出（v6.1 Task 8 接回）
      staticPort: 0, // v6：预览静态服务随插件面剥出；0 = 客户端回退宿主路由（降级契约）
    };
  },
  // 原地重启 Web 服务核心。
  'boot.restart': async (): Promise<RpcResult> => restartWebServiceCore(),
  // bridge.ts 的 restartService() 调 service.restart：与 boot.restart 同一核心。
  'service.restart': async (): Promise<RpcResult> => restartWebServiceCore(),
  // ---- 恢复中心（收窄保留）：Rust 壳创建的恢复中心窗口经专用 preload
  // （WS JSON-RPC）调用这两个方法；动作分发在 lib/recovery-center。----
  'rc.action': async (p): Promise<RpcResult> => {
    const action = String((p && p.action) || '');
    return await recoveryCenter.handleRcAction(action, p && p.value);
  },
  'rc.close': (): RpcResult => ({ ok: true }),
  // ---- 文件树基础能力（files.*：会话工作区围栏，内核文件树 UI 消费） ----
  'files.revert': (p): Record<string, unknown> => {
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
          } else if (content !== null && content === oldText) {
            results.push({ path: fp, status: 'skipped' });
          } else {
            results.push({ path: fp, status: content === null ? 'missing' : 'conflict' });
          }
        }
      } catch (err) {
        results.push({ path: fp, status: 'failed', error: String(((err as Error).message) || err) });
      }
    }
    log('file-revert', JSON.stringify(results.slice(0, 20)));
    return { results };
  },
  'files.authorize-open': (p): Record<string, unknown> => {
    let fp = (p && p.path) as string;
    if (typeof fp !== 'string' || !path.isAbsolute(fp)) return { ok: false, error: 'path must be absolute' };
    // 归一化必须先于前缀比对：原始串可携带 `..`/大小写变体/符号链接骗过
    // 字面前缀命中。realPath 跟随符号链接与 ..；叶子不存在时用已解析的
    // 父目录拼回（随后 existsSync 把关）。
    try {
      fp = fs.realpathSync(fp);
    } catch {
      try {
        fp = path.resolve(fs.realpathSync(path.dirname(fp)), path.basename(fp));
      } catch { /* 连父目录都不可解析：保持原串，交给下方围栏判定 */ }
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
  // ---- 插件 IPC 桩（保留方法面，收窄语义：粘贴/拖放在本体上仍可用，
  // plugin-ops 的落盘实现保留；这是 dsh Web UI 原生交互面的基础能力）----
  'image-paste.save': (p): Record<string, unknown> => {
    try {
      return (pluginOpsMod.imagePasteSave as (d: string, n: string) => Record<string, unknown>)(String((p && p.dataUrl) || ''), String((p && p.name) || '粘贴图片'));
    } catch (e) {
      return { ok: false, error: String(((e as Error).message) || e) };
    }
  },
  'file-drop.save': (p): Record<string, unknown> => {
    try {
      return (pluginOpsMod.fileDropSave as (d: string, n: string) => Record<string, unknown>)(String((p && p.dataUrl) || ''), String((p && p.name) || '拖入文件'));
    } catch (e) {
      return { ok: false, error: String(((e as Error).message) || e) };
    }
  },
  'guard.action': (p): Record<string, unknown> => {
    const action = String((p && p.action) || '');
    const value = p && p.value;
    const g = (guardBoxMod.ensureGuard as () => Record<string, (...a: unknown[]) => unknown>)();
    switch (action) {
      case 'status': {
        const st = loadSettings() as { shareWebProfile?: boolean };
        return {
          ok: true,
          profile: desktopProfileFn(),
          shareWebProfile: st.shareWebProfile === true,
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
      default:
        return { ok: false, error: 'unknown action' };
    }
  },
  'menu.action': async (p): Promise<Record<string, unknown> | null> => {
    const action = String((p && p.action) || '');
    const s = loadSettings() as { notifyOnTurnEnd?: boolean; shortcutPolicy?: string; exitAction?: string; closeToTray?: boolean };
    switch (action) {
      case 'toggle-notify': {
        s.notifyOnTurnEnd = s.notifyOnTurnEnd === false;
        saveSettings(s as Record<string, unknown>);
        return { notifyOnTurnEnd: s.notifyOnTurnEnd, exitAction: s.exitAction || 'ask' };
      }
      case 'toggle-shortcut-policy': {
        s.shortcutPolicy = s.shortcutPolicy === 'never' ? 'auto' : 'never';
        saveSettings(s as Record<string, unknown>);
        return { shortcutPolicy: s.shortcutPolicy, exitAction: s.exitAction || 'ask' };
      }
      case 'set-exit-action': {
        const v = String((p && p.value) || '');
        if (v !== 'ask' && v !== 'minimize' && v !== 'quit') return null;
        s.exitAction = v;
        s.closeToTray = v !== 'quit';
        saveSettings(s as Record<string, unknown>);
        return { notifyOnTurnEnd: s.notifyOnTurnEnd !== false, closeToTray: s.closeToTray !== false, exitAction: v };
      }
      case 'restart-service': {
        const r = await (methods['boot.restart'] as (p2?: unknown) => Promise<Record<string, unknown>>)({} as Record<string, unknown>);
        return r;
      }
      // ---- P4 更新链（v6：更新体系剥出，返回 noop；v6.1 Task 8/9 接回） ----
      case 'check-client-update':
      case 'check-agent-update': {
        say('[update] 更新体系已随 v6 最简本体剥出（menu no-op）');
        return { ok: true, noop: true };
      }
      case 'export-logs': {
        const f = methods['recovery.export-logs'] as () => Promise<Record<string, unknown>>;
        return typeof f === 'function' ? await f() : { ok: false, error: 'unavailable' };
      }
      case 'about': {
        notify('shell.about', {});
        return { ok: true };
      }
      default:
        return null;
    }
  },
};

// ---- 救援链（保留：Rust 壳 /died 页 + crash 计数消费；ADR 0006 已裁决项 5）--
const rescueIntegration = require('./rescue-integration') as {
  initRescue(host: unknown): void;
  rescueMethods(): Record<string, (p: Record<string, unknown> | undefined) => unknown>;
  recordBootFailureNow(errText: string): void;
  shouldEnterRescueNow(): boolean;
  clearRescueState(): void;
};
rescueIntegration.initRescue({
  dshHome,
  userDataDir,
  pkgVersion,
  desktopProfile: desktopProfileFn,
  desktopProfileDir: () => (profileMod.desktopProfileDir as () => string)(),
  dshVersion: () => (pathsMod.dshVersion as () => string)(),
  dshVersionSource: () => (pathsMod.dshVersionSource as () => string)(),
  log,
  notify,
  mods: {
    boot: {
      ...bootMod,
      // rescue retry / recovery.reload 直调 startAndWait 统一走守护启动链。
      startAndWait: async (overlays: string[]) => {
        const r = await guardedStartAndWait(overlays);
        return r;
      },
    },
    guardBox: guardBoxMod, pluginOps: pluginOpsMod, companionSync: companionSyncMod,
  },
  bootRestart: () => (methods['boot.restart'] as (p?: unknown) => Promise<Record<string, unknown>>)({} as Record<string, unknown>),
});
Object.assign(methods, rescueIntegration.rescueMethods());

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
