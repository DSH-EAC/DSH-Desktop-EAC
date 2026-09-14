'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.stubMethod = stubMethod;
exports.rcMethods = rcMethods;
exports.rescueMethods = rescueMethods;
exports.guardMethods = guardMethods;
exports.makeBootFailureRecorder = makeBootFailureRecorder;
exports.minimalPreBootSync = minimalPreBootSync;
/** 生成一个能力桩方法：应答 unavailable，stderr 记一行便于排查。 */
function stubMethod(capability, method, log) {
    return () => {
        log('stub', `${method} 属「${capability}」能力面，v6 最简本体未装（接回见 ADR 0006 v3 插口契约）`);
        return { ok: false, unavailable: true, capability, reason: `capability "${capability}" is not bundled in the v6 minimal core` };
    };
}
/** rc.*（恢复中心动作面）桩：页面拿到 unavailable 后渲染「能力未装」提示。 */
function rcMethods(log) {
    return {
        'rc.action': async () => stubMethod('recovery-center', 'rc.action', log)(),
        'rc.close': () => ({ ok: true }),
    };
}
/** rescue.*（救援链）桩：boot 失败计数/安全模式引导随能力面剥出。 */
function rescueMethods(log) {
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
function guardMethods(log) {
    return {
        'guard.ensure': () => ({ ok: false, unavailable: true, capability: 'plugin-guard' }),
        'guard.action': stubMethod('plugin-guard', 'guard.action', log),
    };
}
/**
 * boot 失败记录桩：真实现（rescue-integration）会累计崩溃计数并引导安全
 * 模式；桩只记日志。guardedStartAndWait 的调用点保持签名不变。
 */
function makeBootFailureRecorder(log) {
    return {
        recordBootFailureNow(err) {
            log('stub', 'boot 失败（救援计数能力未装，仅记录）: ' + err.slice(0, 200));
        },
        clearRescueState() { },
    };
}
/**
 * preBootSync 的最简实现：只做 profile 初始化（ensureDesktopProfileInit）。
 * 原实现的插件同步/退役清理/宿主依赖落位随三件套剥出；
 * Task 3.3 接回时替换为真 preBootSync。
 */
function minimalPreBootSync(ensureProfile, log) {
    return async () => {
        try {
            ensureProfile();
        }
        catch (e) {
            log('boot', 'profile 初始化失败: ' + String((e.message) || e));
            throw e;
        }
    };
}
