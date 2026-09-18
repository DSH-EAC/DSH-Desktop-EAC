'use strict';

// v6 最简本体的内部 boot glue。这里不注册公开 RPC 方法。

export interface StubContext {
  log(tag: string, msg: string): void;
}

/**
 * 最简 boot 失败记录器：只记日志，不暴露恢复/救援方法面。
 */
export function makeBootFailureRecorder(log: StubContext['log']): {
  recordBootFailureNow(err: string): void;
  clearRescueState(): void;
} {
  return {
    recordBootFailureNow(err: string): void {
      log('boot', 'boot 失败: ' + err.slice(0, 200));
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
