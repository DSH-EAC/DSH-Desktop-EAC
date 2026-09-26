# @dsh-eac/skin-inkwash 「水墨青烟」

内置示例皮肤：**浅色纸质感 + 水墨氛围背景**。与 `@dsh-eac/skin-aurora` 结构对称，
同为外部开发者可直接照抄的公约参考实现；两包与外部皮肤包**完全同权**（发现不启用/
点击激活/被换走彻底退出），且互不触碰（公约 R3）。

本包特意演示公约的另一面：**不提供自定义设置**（公约 §4.2——皮肤设置自治，
不提供也不被区别对待）。对照阅读：

| | aurora（极光之夜） | inkwash（水墨青烟） |
| --- | --- | --- |
| 配色 | 深色（colorScheme "dark"） | 浅色（colorScheme "light"） |
| 自定义设置 | 有（背景图 URL，configForms 自治持久化） | **无**（无 Config schema、无设置 UI、无 settingsHint） |
| client inject | uiSkinLoader, theme, slots, configForms, locale | uiSkinLoader, theme, slots |
| host 半 | Config schema（设置落盘前提）+ auto:false | no-op |
| 槽位席位 | settings.section + shell.overlay | shell.overlay |

## 包结构

```text
packages/skins/inkwash/
  package.json            清单：dsh.skin（公约 §3 唯一声明）+ dsh.client + dsh.bundle.patch
  cordis.patch.yml        bundle 补丁层（行 id dsh-eac-skin-inkwash，仅作 entry id）
  scripts/build-artifact.mjs  可安装产物构建（esbuild-wasm → lib/index.js + lib/client.js）
  src/
    identity.ts           身份常量（公约 §3 id/名称/版本 + CSS 前缀）
    context.ts            宿主 API 的本地结构类型（零导入；只用 theme/slots，无设置面）
    index.ts              host 半：no-op（无 Config schema → 宿主不生成设置页）
    theme.ts              主题定义：--dsw-alias-* token 覆盖（半透明浅色表面）
    background.ts         CSS 组装（纯逻辑）：宣纸底 + 淡墨晕染 + 氛围层样式
    preview.ts            卡片封面 SVG（渐变 id 带 skn-inkwash- 前缀防文档级冲突）
    client/
      index.tsx           bundle 入口：exports.inject + exports.apply（只做登记，R1）
      session.ts          激活会话：全部副作用登记 + 幂等 teardown（R8 的实现样板）
      components.tsx      席位组件：水墨氛围层（远山一抹 + 淡烟两缕）
    index.test.ts         纯逻辑单测（preview/CSS 确定性）
    session.test.ts       会话单测（fake 环境：deactivate 幂等/主题恢复/abort 路径）
```

## 接线形态（外部开发者照这里抄）

最小形态（也是公约 §9 伪码的实装）：

```ts
// client 半顶层
export const inject = ["uiSkinLoader", "theme", "slots"];

export function apply(ctx) {
  const unregister = ctx.uiSkinLoader.registerSkin({
    apiVersion: "dsh.ecosystem.ui-skin-loader/v1",
    id: "dsh-eac.skin.inkwash",          // 公约 §3：小写反域名
    name: "水墨青烟",
    version: "1.1.0",
    preview: "<svg …></svg>",
    activate(skinCtx)  { /* 自此才允许可见副作用；全部登记进 disposers */ },
    deactivate()       { /* 幂等 teardown：退出后不可观测 */ },
  });
  ctx.effect(() => unregister);
}
```

activate/deactivate 纪律、主题偏好恢复、残留断言锚点（`style[data-skn-inkwash-style]`、
`body[data-skn-inkwash-active]`、`[data-skn-inkwash-backdrop]`）与 aurora 完全同构，
逐条注释见 `src/client/session.ts` 与 aurora 包 README。

## 视觉机制（全部经公开 ABI）

- **浅色配色**：`ctx.theme.register`（colorScheme "light" + `--dsw-alias-*` token
  覆盖成半透明宣纸白）；deactivate 恢复用户原偏好；
- **纸质感背景**：皮肤自有 style 节点绘 `body` 背景（宣纸底色 + 三片淡墨晕染，
  纯 CSS 渐变、零外部资产）；
- **水墨氛围层**：`shell.overlay` 公开槽位（list，additive），自有席位 id
  `skn-inkwash-backdrop`，pointer-events:none。

## 构建与发布（三步）

```bash
pnpm --filter @dsh-eac/skin-inkwash build
dsh plugin --profile <name> add <本包路径或 npm 包名>
# 在加载器控制台（设置 → 皮肤）点击卡片激活
```

发布你自己的皮肤：复制本包结构 → 改 `identity.ts` 的身份常量 → 实现
activate/deactivate → `package.json` 的 `dsh.skin` 与 `peerDependencies` 对齐宿主版本。
需要自定义设置时，照 aurora 包加三件套（host Config schema + 行 id == 设置命名空间 +
client configForms 读写）。

## 预览图同步说明

`package.json` 的 `dsh.skin.preview` 与 `src/preview.ts` 是同一份 SVG（单行）；
修改 `preview.ts` 后请同步 `package.json`。
