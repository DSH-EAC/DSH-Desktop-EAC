'use strict';
// ---------------------------------------------------------------------------
// 首次启动「插件分发选择向导」—— 纯逻辑层（无 fs / electron 依赖，可直接
// 被 node --test 单元测试）。
//
// COMPANION_PLUGINS 在迁移期仍覆盖全部 vendored 资产；向导目录只消费生成的
// distribution builtin 与推荐 pack registry，避免把外部按需资产误称为内置。
// ---------------------------------------------------------------------------

const {
  DISTRIBUTION_BUILTIN_PLUGIN_IDS,
  RECOMMENDED_PACK_PLUGIN_IDS,
} = require('../lib/desktop/plugin-sync-registry');

const CORE_PLUGIN_IDS = new Set(DISTRIBUTION_BUILTIN_PLUGIN_IDS);
const RECOMMENDED_PLUGIN_IDS = new Set(RECOMMENDED_PACK_PLUGIN_IDS);

function onboardingPlugins(registry, coreIds = CORE_PLUGIN_IDS, recommendedIds = RECOMMENDED_PLUGIN_IDS) {
  return (registry || []).filter((plugin) => coreIds.has(plugin.id) || recommendedIds.has(plugin.id));
}

/**
 * 新老用户判定（纯函数）：
 *   - 已确认过向导（settings.pluginOnboardingDone === true）→ 不再展示
 *   - settings.json 已存在（任意老版本用户）→ 跳过，保持现状全量插件
 *   - web-desktop 专属 profile 已存在（v3.1.0+ 老用户）→ 跳过
 *   - 共享 web profile 已存在（v3.1.0 之前的老用户）→ 跳过
 *   - 其余 → 全新安装用户，需要向导
 *
 * 注意：调用方必须在任何写盘（run-state / migrate 标记 / 稳定端口）之前调用
 * —— settings.json 会在启动早期被迁移流程无条件创建，之后再判断文件存在性
 * 会把全新用户误判成老用户。
 * @param {{ settings: object, settingsFileExists: boolean, profileDirExists: boolean, sharedProfileExists: boolean }} env
 */
function needsPluginOnboarding({ settings, settingsFileExists, profileDirExists, sharedProfileExists }) {
  if (settings && settings.pluginOnboardingDone === true) return false;
  if (settingsFileExists) return false;
  if (profileDirExists) return false;
  if (sharedProfileExists) return false;
  return true;
}

/**
 * 从 patch 条目（顶层裸条目 + `- insert:` 内层条目）+ 注册表默认构建
 * id → 当前是否启用 的映射。
 *   - patch 有该 id 的条目：以条目的 disabled 标志为准；
 *   - 无条目：以注册表默认（p.disabled === true）为准。
 * @param {Array} entries  pluginManagerReadPatch() 的 parsed entries
 * @param {Array} registry COMPANION_PLUGINS（{id, disabled}）
 * @returns {Record<string, boolean>}
 */
function pluginCurrentState(entries, registry) {
  const user = new Map();
  for (const e of entries || []) {
    if (!e || typeof e !== 'object') continue;
    if (Array.isArray(e.insert)) {
      for (const it of e.insert) {
        if (it && typeof it.id === 'string') user.set(it.id, it.disabled === true);
      }
    } else if (typeof e.id === 'string') {
      user.set(e.id, e.disabled === true);
    }
  }
  const out = {};
  for (const p of registry || []) {
    const u = user.get(p.id);
    out[p.id] = u !== undefined ? !u : !(p.disabled === true);
  }
  return out;
}

/**
 * 计算启停切换操作清单（纯函数，写盘由调用方执行）：
 *   - 核心插件永不产生操作；
 *   - current 为 null（首次向导，patch 行尚未写全）→ 所有非核心插件都写入
 *     显式状态（normalize），这样 sync 的「已有行不重写」规则接住结果，注册
 *     表默认 disabled 的插件（如 dsh-dafeiyu）也不会被 sync 回写 disabled 行；
 *   - current 非 null（二次向导）→ 只切换状态与用户选择不同的插件。
 * @param {Array} registry COMPANION_PLUGINS
 * @param {Set} coreIds    核心锁定 id
 * @param {Set} want       用户最终选择（已 sanitize，含核心）
 * @param {Record<string, boolean>|null} current 当前状态
 * @returns {Array<{id: string, enable: boolean}>}
 */
function buildSelectionOps(registry, coreIds, want, current) {
  const ops = [];
  for (const p of registry || []) {
    if (coreIds.has(p.id)) continue;
    const enable = want.has(p.id);
    if (current && current[p.id] === enable) continue;
    ops.push({ id: p.id, enable });
  }
  return ops;
}

/**
 * 清洗用户提交的选择：只保留注册表内存在的 id；核心 id 恒在集合内。
 * @param {Array} ids      用户提交的勾选列表
 * @param {Array} registry COMPANION_PLUGINS
 * @param {Set} coreIds    核心锁定 id
 * @returns {Set<string>}
 */
function sanitizeSelection(ids, registry, coreIds, unavailableIds = new Set()) {
  const valid = new Set((registry || []).map((p) => p.id));
  const want = new Set();
  for (const x of Array.isArray(ids) ? ids : []) {
    if (typeof x !== 'string' || !valid.has(x) || unavailableIds.has(x)) continue;
    want.add(x);
  }
  for (const c of coreIds || []) want.add(c);
  return want;
}

/**
 * 构建向导目录（纯函数）。describe / dirSize 由调用方注入（读取包描述 /
 * 包目录体积），便于测试。
 * @param {Array} plugins COMPANION_PLUGINS
 * @param {{ coreIds: Set, recommendedIds: Set, describe?: Function, dirSize?: Function }} opts
 * @returns {Array<{id,name,description,core,recommended,registryDisabled,size}>}
 */
function buildCatalog(plugins, { coreIds, recommendedIds, describe, dirSize, capabilities = {} } = {}) {
  const core = coreIds || CORE_PLUGIN_IDS;
  const rec = recommendedIds || RECOMMENDED_PLUGIN_IDS;
  return (plugins || []).map((p) => ({
    id: p.id,
    name: p.name,
    description: describe ? describe(p.name) : '',
    core: core.has(p.id),
    // 注册表默认禁用的插件（p.disabled: true，如 dsh-pet）不进「推荐」勾选。
    recommended: rec.has(p.id) && p.disabled !== true && capabilities[p.id]?.status !== 'unavailable',
    registryDisabled: p.disabled === true,
    capability: capabilities[p.id] || { status: 'supported', reason: '' },
    size: dirSize ? dirSize(p.dir || (p.name.includes('/') ? p.name.split('/').pop() : p.name)) : 0,
  }));
}

module.exports = {
  CORE_PLUGIN_IDS,
  RECOMMENDED_PLUGIN_IDS,
  onboardingPlugins,
  needsPluginOnboarding,
  pluginCurrentState,
  buildSelectionOps,
  sanitizeSelection,
  buildCatalog,
};
