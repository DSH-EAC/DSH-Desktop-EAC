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

// v6 Task 3.3：minimalPreBootSync 已由 server.ts 的真 preBootSync 取代
//（退役清理 → 内置插件同步 → 模块遮蔽修复）。按 ADR 0006「不留无消费者
// 模块」纪律移除，文本可在 git 历史取回。
