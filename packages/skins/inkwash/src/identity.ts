/**
 * @dsh-eac/skin-inkwash 的身份常量（公约 §3 声明的唯一事实来源）。
 *
 * 与 aurora 包结构对称（外部开发者可对照阅读）；常量语义详见
 * packages/skins/aurora/src/identity.ts 的头注。两个皮肤的全部命名空间互不重叠
 * （公约 R3：互不触碰；R2：不碰加载器保留面）。
 */

/** 公约 §3 皮肤 id（小写反域名，血统内不可变）。 */
export const SKIN_ID = "dsh-eac.skin.inkwash";

/** 公约协议 id（apiVersion 的唯一合法 major 轴）。 */
export const CONVENTION_ID = "dsh.ecosystem.ui-skin-loader/v1";

/**
 * cordis.patch.yml 行 id。inkwash 不提供自定义设置（公约 §4.2：皮肤可以不提供
 * 设置，加载器不得区别对待——本包就是这一条的活示例），此 id 仅作 entry id 使用。
 */
export const ENTRY_ID = "dsh-eac-skin-inkwash";

/** 皮肤自有主题 id（避开内置 light/dark/system）。 */
export const THEME_ID = "dsh-eac-skin-inkwash-paper";

/** 皮肤自有 CSS 类 / data 属性 / SVG id 前缀（与 aurora 的 skn-aurora、加载器的 usl- 互斥）。 */
export const CSS_PREFIX = "skn-inkwash";

/** client bundle 注册 id（== 包名 == boot graph 行 id，api-notes §1.4）。 */
export const BUNDLE_ID = "@dsh-eac/skin-inkwash";

/** 皮肤展示元数据（client 半 registerSkin 与 package.json 保持一致）。 */
export const SKIN_META = {
  apiVersion: CONVENTION_ID,
  id: SKIN_ID,
  name: "水墨青烟",
  version: "1.1.0",
  author: "DSH-EAC",
  description: "浅色纸质感 + 水墨氛围背景的内置示例皮肤（公约参考实现；不提供自定义设置）。",
  tags: ["light", "paper", "example"],
} as const;
