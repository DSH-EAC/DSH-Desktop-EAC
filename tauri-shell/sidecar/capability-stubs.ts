'use strict';

// v6 Task 3.1（ADR 0006 v3 · 严格模式）：被剥能力的统一降级桩。
//
// 「按字面严格解释最简本体」：本体只保留对 dsh 的最简包装 ——
// boot / 壳骨架 / profile 初始化 / 文件树围栏。恢复中心动作面（rc.*）、
// 救援链（rescue.*）、插件保护中心（guard.*）、插件治理三件套
//（companion-sync / plugin-ops / guard-box）全部移出运行面。
//
// 插口契约（Task 3.3/3.5 接回时逐个替换本文件里的桩）：
//   1. 方法名与参数形态不变 —— Rust 壳与恢复中心页面已按此面调用；
//   2. 桩的应答统一 { ok:false, unavailable:true, reason } —— 调用方可
//      据此渲染「能力未安装」而不是把它当运行时错误；
//   3. 接回 = 用真实现覆盖 methods 表里的同名条目 + 在装配清单补模块，
//      不需要动 Rust 壳一行代码。
//
// 各能力的接回任务（看板）：
//   rc.*（恢复中心动作面）    → Task 3.5 内部测试 / 5.x 插件系统接回
//   rescue.*（救援链）        → Task 3.5（崩溃计数与安全模式引导）
//   guard.*（保护中心）       → Task 3.3 插件系统接回
//   插件治理三件套            → Task 2.x / 3.3

export interface StubContext {
  log(tag: string, msg: string): void;
}

/** 生成一个能力桩方法：应答 unavailable，stderr 记一行便于排查。 */
export function stubMethod(capability: string, method: string, log: StubContext['log']): (p?: unknown) => Record<string, unknown> {
  return (): Record<string, unknown> => {
    log('stub', `${method} 属「${capability}」能力面，v6 最简本体未装（接回见 ADR 0006 v3 插口契约）`);
    return { ok: false, unavailable: true, capability, reason: `capability "${capability}" is not bundled in the v6 minimal core` };
  };
}

/** rc.*（恢复中心动作面）桩：页面拿到 unavailable 后渲染「能力未装」提示。 */
export function rcMethods(log: StubContext['log']): Record<string, (p?: unknown) => unknown> {
  return {
    'rc.action': async (): Promise<Record<string, unknown>> =>
      stubMethod('recovery-center', 'rc.action', log)(),
    'rc.close': (): Record<string, unknown> => ({ ok: true }),
  };
}

/** rescue.*（救援链）桩：boot 失败计数/安全模式引导随能力面剥出。 */
export function rescueMethods(log: StubContext['log']): Record<string, (p?: unknown) => unknown> {
  return {
    'rescue.state': stubMethod('rescue', 'rescue.state', log),
    'rescue.confirm': stubMethod('rescue', 'rescue.confirm', log),
    'rescue.diagnose': stubMethod('rescue', 'rescue.diagnose', log),
    'rescue.apply': stubMethod('rescue', 'rescue.apply', log),
    'rescue.safe-mode': stubMethod('rescue', 'rescue.safe-mode', log),
    'rescue.retry': stubMethod('rescue', 'rescue.retry', log),
    'rescue.auto-repair': stubMethod('rescue', 'rescue.auto-repair', log),
  };
}

/** guard.*（插件保护中心）桩。 */
export function guardMethods(log: StubContext['log']): Record<string, (p?: unknown) => unknown> {
  return {
    'guard.ensure': (): Record<string, unknown> => ({ ok: false, unavailable: true, capability: 'plugin-guard' }),
    'guard.action': stubMethod('plugin-guard', 'guard.action', log),
  };
}

/**
 * boot 失败记录桩：真实现（rescue-integration）会累计崩溃计数并引导安全
 * 模式；桩只记日志。guardedStartAndWait 的调用点保持签名不变。
 */
export function makeBootFailureRecorder(log: StubContext['log']): {
  recordBootFailureNow(err: string): void;
  clearRescueState(): void;
} {
  return {
    recordBootFailureNow(err: string): void {
      log('stub', 'boot 失败（救援计数能力未装，仅记录）: ' + err.slice(0, 200));
    },
    clearRescueState(): void { /* 无状态可清 */ },
  };
}

/**
 * preBootSync 的最简实现：只做 profile 初始化（ensureDesktopProfileInit）。
 * 原实现的插件同步/退役清理/宿主依赖落位随三件套剥出；
 * Task 3.3 接回时替换为真 preBootSync。
 */
export function minimalPreBootSync(
  ensureProfile: () => void,
  log: StubContext['log'],
): () => Promise<void> {
  return async (): Promise<void> => {
    try {
      ensureProfile();
    } catch (e) {
      log('boot', 'profile 初始化失败: ' + String(((e as Error).message) || e));
      throw e;
    }
  };
}
