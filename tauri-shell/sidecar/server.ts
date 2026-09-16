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
const runtimePatchesMod = mount('runtime-patches');
const bootMod = mount('boot-server');

// v6 Task 3.1（ADR 0006 v3 · 严格模式）：插件治理三件套（companion-sync /
// plugin-ops / guard-box）、恢复中心（recovery-center）、救援链
//（rescue-integration）全部移出运行面 —— 本体只保留对 dsh 的最简包装。
// 被剥能力经 capability-stubs 的降级桩应答（方法名与参数形态不变，
// Task 3.3/3.5 接回时替换桩即可，插口契约见该文件头注释）。
import stubs = require('./capability-stubs');

const MOUNTED = ['proc', 'platform', 'runtime-paths', 'profile', 'runtime-patches', 'boot-server'];

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
runtimePatchesMod.init({ log, getDshHome: () => dshHome, getUserDataDir: () => userDataDir });

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

// 前置文件树准备（v6 严格最简版）：只做 profile 初始化 —— 插件同步/退役
// 清理/宿主依赖落位随三件套剥出（capability-stubs.minimalPreBootSync）。
const preBootSync = stubs.minimalPreBootSync(
  () => (profileMod.ensureDesktopProfileInit as () => void)(),
  log,
);

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

// （v6 严格模式：rc.* / guard.* 的桩注册移至 methods 声明之后的
//  「能力桩注册」段统一执行；recoveryCenter.init 随恢复中心剥出。）

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
    };
  },
  // 原地重启 Web 服务核心。
  'boot.restart': async (): Promise<RpcResult> => restartWebServiceCore(),
  // （v6 严格模式：rc.action / rc.close 由 capability-stubs 桩注册 ——
  //  恢复中心动作面剥出，方法面与参数形态不变，接回见插口契约。）
  // （v6 严格模式：guard.action 由 capability-stubs 桩注册。）
};

// ---- 救援链 + 能力桩注册（v6 严格模式）-----------------------------------
// rescue-integration 剥出：rescue.* 方法面由桩注册（形态不变），boot 失败
// 记录走桩 recorder（真实现的崩溃计数随 Task 3.5 接回）。
const bootFailureRecorder = stubs.makeBootFailureRecorder(log);

// ---- 能力桩注册：rc.* / rescue.* / guard.*（插口契约见 capability-stubs）----
Object.assign(methods, stubs.rcMethods(log));
Object.assign(methods, stubs.rescueMethods(log));
Object.assign(methods, stubs.guardMethods(log));

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
