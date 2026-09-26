/**
 * @dsh-eac/skin-aurora 的身份常量（公约 §3 声明的唯一事实来源）。
 *
 * host 半与 client 半都从这里取值，保证 package.json 的 `dsh.skin` 声明、
 * cordis.patch.yml 的行 id 与 client 半 `registerSkin` 的登记元数据永远一致：
 * - `SKIN_ID`：公约 §3 皮肤 id（小写反域名）；
 * - `SETTINGS_NAMESPACE`：皮肤设置命名空间 == cordis.patch.yml 行 id
 *   （api-notes §8.1：entry id == settings namespace == configForms.get() 的 entryId）；
 * - `CSS_PREFIX`：皮肤自有 CSS/DOM 前缀（公约 R2：不得与加载器保留前缀
 *   `usl-` / `io.github.dsh-eac.skin.loader.*` 冲突；SVG 渐变 id 也用它命名空间化，
 *   避免 T2.5 发现的文档级 id 冲突问题）。
 */

/** 公约 §3 皮肤 id（小写反域名，血统内不可变）。 */
export const SKIN_ID = "dsh-eac.skin.aurora";

/** 公约协议 id（apiVersion 的唯一合法 major 轴）。 */
export const CONVENTION_ID = "dsh.ecosystem.ui-skin-loader/v1";

/** cordis.patch.yml 行 id == settings 命名空间（皮肤设置自治的持久化段落）。 */
export const SETTINGS_NAMESPACE = "dsh-eac-skin-aurora";

/** 皮肤自有主题 id（host theme.register 的 registry 键；避开内置 light/dark/system）。 */
export const THEME_ID = "dsh-eac-skin-aurora-night";

/** 皮肤自有 CSS 类 / data 属性 / SVG id 前缀（R2：与 `usl-` 无关的自有命名空间）。 */
export const CSS_PREFIX = "skn-aurora";

/** client bundle 注册 id（== 包名 == boot graph 行 id，api-notes §1.4）。 */
export const BUNDLE_ID = "@dsh-eac/skin-aurora";

/** 皮肤展示元数据（公约 §3 可选字段；client 半 registerSkin 与 package.json 保持一致）。 */
export const SKIN_META = {
  apiVersion: CONVENTION_ID,
  id: SKIN_ID,
  name: "极光之夜",
  version: "1.1.0",
  author: "DSH-EAC",
  description: "深色玻璃拟态 + 极光渐变背景的内置示例皮肤（公约参考实现）。",
  tags: ["dark", "glassmorphism", "example"],
} as const;
