// settings-compat.js — dsh-settings 0.1.2 → 0.1.3 兼容垫片（EAC 插件共享）。
//
// 0.1.3 的 @deepseek-ai/dsh-settings 移除了两个独立导出：
//   · settingsNamespace(value)     —— 纯运行时恒等 + kebab-case 校验（类型层
//     是 SettingsNamespace 品牌标记）；register/update/replace 的参数本来就
//     只做 parseSettingsNamespace 校验，喂裸字符串语义不变。
//   · installSettingsSection(ctx, ns, schema, entry, hooks) —— 收编为
//     SettingsProvider 方法 ctx.settings.installSection(owner, ...)，行为
//     逐行一致（含 isUnloading 的 fallback 语义），只差 ctx.inject(['settings'])
//     外壳需调用方自备。
//
// 本垫片按 0.1.2 的导出形状重建两者，插件 import 从
// '@deepseek-ai/dsh-settings' 改指本文件即可（EAC 插件本就是自包含分发，
// 不进内核包解析链）。

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Brand a raw string as a SettingsNamespace（校验同内核 parseSettingsNamespace）。 */
export function settingsNamespace(value) {
  if (typeof value !== 'string' || !NAMESPACE_PATTERN.test(value)) {
    throw new TypeError(`settings namespace "${String(value)}" must match ${String(NAMESPACE_PATTERN)}`);
  }
  return value;
}

/**
 * 兼容 0.1.2 的 installSettingsSection(ctx, ns, schema, entry, hooks)：
 * inject settings 服务后转发 provider.installSection；settings 服务缺失
 * （provider 未挂载）时静默跳过 —— 0.1.2 的 inject 语义同样不激活。
 */
export function installSettingsSection(ctx, ns, schema, entry, hooks) {
  ctx.inject(['settings'], (sctx) => {
    sctx.settings.installSection(ctx, ns, schema, entry, hooks);
  });
}
