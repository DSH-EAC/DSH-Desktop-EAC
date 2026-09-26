/**
 * @dsh-eac/skin-trading 的身份常量（公约 §3 声明的唯一事实来源）。
 *
 * 结构与 aurora/inkwash 先例对称；观感内容自 dsh-web-ui（经 DSH-Desktop-EAC
 * 分发）原样迁移，工程身份改为本仓的公约形态。本皮肤的全部自有命名空间
 * （skn-trading / dsh-eac.skin.trading / dsh-eac-skin-trading）与加载器
 * （usl- / dsh-ui-skin-loader）、其它皮肤互不重叠（公约 R2/R3）。
 * 迁移皮肤另有一组「上游自有」标记（body[data-dsh-trading]、style[data-plugin-css]）
 * ——那是被迁移皮肤自己的激活标记，随观感内容原样携带，见 vendor 文件头说明。
 */

/** 公约 §3 皮肤 id（小写反域名，血统内不可变）。 */
export const SKIN_ID = "dsh-eac.skin.trading";

/** 公约协议 id（apiVersion 的唯一合法 major 轴）。 */
export const CONVENTION_ID = "dsh.ecosystem.ui-skin-loader/v1";

/**
 * cordis.patch.yml 行 id。trading 不提供自定义设置（公约 §4.2：皮肤可以不提供
 * 设置，加载器不得区别对待——inkwash 先例同款），此 id 仅作 entry id 使用。
 */
export const ENTRY_ID = "dsh-eac-skin-trading";

/** 本包自产 SVG（卡片预览）的 id/类前缀（与加载器 usl-、其它皮肤互斥）。 */
export const CSS_PREFIX = "skn-trading";

/** client bundle 注册 id（== 包名 == boot graph 行 id，api-notes §1.4）。 */
export const BUNDLE_ID = "@dsh-eac/skin-trading";

/** 皮肤展示元数据（client 半 registerSkin 与 package.json 保持一致）。 */
export const SKIN_META = {
  apiVersion: CONVENTION_ID,
  id: SKIN_ID,
  name: "交易终端",
  version: "1.1.0",
  author: "zhu1090093659 (dsh-web-ui) · DSH-EAC (covenant conversion)",
  description:
    "实时行情跑马灯 · 交易时段状态栏 · 红涨绿跌配色（自 DSH-Desktop-EAC 迁移，covenant-converted；上游 dsh-web-ui，BSD-3-Clause）。",
  tags: ["stock", "trading", "ticker", "live", "terminal", "migrated"],
} as const;
