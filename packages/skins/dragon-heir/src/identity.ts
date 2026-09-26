/**
 * @dsh-eac/skin-dragon-heir 的身份常量（公约 §3 声明的唯一事实来源）。
 *
 * 结构与 aurora/inkwash 先例对称；观感内容自 dsh-web-ui（经 DSH-Desktop-EAC
 * 分发）原样迁移，工程身份改为本仓的公约形态。本皮肤的全部自有命名空间
 * （skn-dragon-heir / dsh-eac.skin.dragon-heir / dsh-eac-skin-dragon-heir）与
 * 加载器（usl- / dsh-ui-skin-loader）、其它皮肤互不重叠（公约 R2/R3）。
 * 迁移皮肤另有一组「上游自有」标记（body[data-dsh-dragon-heir]、
 * style[data-plugin-css]）——那是被迁移皮肤自己的激活标记，随观感内容原样
 * 携带，见 vendor 文件头说明与 markers.ts。
 */

/** 公约 §3 皮肤 id（小写反域名，血统内不可变）。 */
export const SKIN_ID = "dsh-eac.skin.dragon-heir";

/** 公约协议 id（apiVersion 的唯一合法 major 轴）。 */
export const CONVENTION_ID = "dsh.ecosystem.ui-skin-loader/v1";

/**
 * cordis.patch.yml 行 id。dragon-heir 不提供自定义设置（公约 §4.2：皮肤可以
 * 不提供设置，加载器不得区别对待——inkwash 先例同款），此 id 仅作 entry id 使用。
 */
export const ENTRY_ID = "dsh-eac-skin-dragon-heir";

/** 本包自产 SVG（卡片预览）的 id/类前缀（与加载器 usl-、其它皮肤互斥）。 */
export const CSS_PREFIX = "skn-dragon-heir";

/** client bundle 注册 id（== 包名 == boot graph 行 id，api-notes §1.4）。 */
export const BUNDLE_ID = "@dsh-eac/skin-dragon-heir";

/** 皮肤展示元数据（client 半 registerSkin 与 package.json 保持一致）。 */
export const SKIN_META = {
  apiVersion: CONVENTION_ID,
  id: SKIN_ID,
  name: "龙的传人",
  version: "1.1.0",
  author: "zhu1090093659 (dsh-web-ui) · DSH-EAC (covenant conversion)",
  description:
    "不屈龙魂 · 万里长城双主题 · 朱砂龙印（自 DSH-Desktop-EAC 迁移，covenant-converted；上游 dsh-web-ui，BSD-3-Clause）。",
  tags: ["dragon", "loong", "chinese", "ink-wash", "great-wall", "dual-theme", "migrated"],
} as const;
