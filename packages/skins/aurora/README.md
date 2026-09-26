# @dsh-eac/skin-aurora 「极光之夜」

内置示例皮肤：**深色玻璃拟态 + 极光渐变背景**。本包与外部皮肤包**完全同权**——
它不 import 加载器/adapter 源码，只通过公约接缝（`uiSkinLoader` 服务的
`registerSkin`）与宿主公开 API（theme / slots / configForms / locale）实现，
是外部开发者**可以直接照抄的参考实现**（另一个对称示例：`@dsh-eac/skin-inkwash`）。

## 包结构

```text
packages/skins/aurora/
  package.json            清单：dsh.skin（公约 §3 唯一声明）+ dsh.client + dsh.bundle.patch
  cordis.patch.yml        bundle 补丁层；行 id dsh-eac-skin-aurora == 皮肤设置命名空间
  scripts/build-artifact.mjs  可安装产物构建（esbuild-wasm → lib/index.js + lib/client.js）
  src/
    identity.ts           身份常量（公约 §3 id/名称/版本 + settings 命名空间 + CSS 前缀）
    context.ts            宿主 API 的本地结构类型（零导入；形状权威 = docs/api-notes.md）
    index.ts              host 半：Config schema（设置落盘前提）+ 设置页策略 auto:false
    theme.ts              主题定义：--dsw-alias-* token 覆盖（半透明表面 = 玻璃拟态）
    background.ts         CSS 组装（纯逻辑）：body 背景 + 氛围层 + 设置分区样式
    settings.ts           设置纯逻辑：背景 URL 校验/默认值（含 javascript: 等 scheme 拒绝）
    preview.ts            卡片封面 SVG（渐变 id 带 skn-aurora- 前缀防文档级冲突）
    client/
      index.tsx           bundle 入口：exports.inject + exports.apply（只做登记，R1）
      session.ts          激活会话：全部副作用登记 + 幂等 teardown（R8 的实现样板）
      components.tsx      席位组件：设置分区（configForms 读写）+ 极光氛围层
      messages.ts         zh/en 双语文案 + settingsHint 文本
    index.test.ts         纯逻辑单测（preview/CSS/设置校验）
    session.test.ts       会话单测（fake 环境：deactivate 幂等/主题恢复/abort 路径）
```

## 接线形态（外部开发者照这里抄）

**client 半顶层**（api-notes §4 R10 定案——服务注入靠 exports.inject，不是
package.json 的 dsh.client.inject）：

```ts
export const inject = ["uiSkinLoader", "theme", "slots", "configForms", "locale"];

export function apply(ctx) {
  // R1：apply 只登记皮肤，登记 ≠ 激活
  const unregister = ctx.uiSkinLoader.registerSkin({
    apiVersion: "dsh.ecosystem.ui-skin-loader/v1",
    id: "dsh-eac.skin.aurora",           // 公约 §3：小写反域名
    name: "极光之夜",
    version: "1.1.0",
    preview: "<svg …></svg>",            // 内联 SVG；渐变 id 带皮肤前缀
    settingsHint: "激活后在 设置 → 极光之夜 自定义背景图",
    activate(skinCtx)  { /* 自此才允许可见副作用 */ },
    deactivate()       { /* 撤销 activate 以来的全部副作用 */ },
  });
  ctx.effect(() => unregister);          // fiber 卸载自动反登记
}
```

**activate/deactivate 纪律**（公约 §4.3/R8，`src/client/session.ts` 是完整实现）：

1. activate 的每一项副作用都推进一个 `disposers` 数组；
2. teardown 逆序撤销全部副作用，且**幂等**——deactivate、`skinCtx.signal` abort、
   皮肤 fiber 意外 dispose（`ctx.effect` 安全网）三条路汇入同一个 teardown；
3. 判定标准（公约 §4.3）：退出后不可观测——本包的残留断言锚点是
   `style[data-skn-aurora-style]`、`body[data-skn-aurora-active]`、
   `[data-skn-aurora-backdrop]`、`[data-skn-aurora-settings]` 与主题偏好，
   deactivate 后必须全部归零。

**皮肤设置自治**（公约 §4.2：设置不是公约事件，加载器不代管）：本包用宿主
configForms 机制把 `backgroundUrl` 持久化在**自己的**设置命名空间
`dsh-eac-skin-aurora` 里。三个必要件：

- host 半导出 `Config` schema（volatile 字段——api-notes §8：无 schema 的 entry
  表单写会被宿主拒绝）；
- cordis.patch.yml 的行 id == 设置命名空间；
- client 半 `ctx.configForms.get("dsh-eac-skin-aurora")` 读快照 + `set` 写 +
  `subscribe` 即时重算背景。停用皮肤不删设置——切走再切回，背景仍在（皮肤自治持久化）。

## 视觉机制（全部经公开 ABI）

| 手段 | 通道 | 说明 |
| --- | --- | --- |
| 深色配色 | `ctx.theme.register`（colorScheme "dark" + token 覆盖） | 主题 API 是宿主公开面；deactivate dispose，用户偏好轴不被写（见 theme.ts 头注） |
| 玻璃拟态 | token 覆盖层把宿主表面改半透明 | 透出 body 背景的光 |
| 极光背景 | 皮肤自有 style 节点绘 `body` 背景 | 默认内置渐变；设置里可换自定义图片 URL（暗色遮罩保可读性） |
| 氛围层 | `shell.overlay` 公开槽位（list，additive） | 自有席位 id `skn-aurora-backdrop`；pointer-events:none |
| 设置分区 | `settings.section` 公开槽位 | 只在激活后注册（R1：未激活不注册壳级槽位内容） |

**token 覆盖表纪律（T2.6-fix 教训，抄表前必读）**：覆盖表必须**表面与前景成对覆盖**——
只覆盖文字色、不覆盖其所在表面（或反之），就会在改色后的表面上出现对比度反转。
典型症状：**激活态下某处文字突然看不清、选中/悬停的 pill 变成"实心浅底 + 亮字"**
（宿主导航选中态用 `--dsw-specific-sidebar-nav-item-active/-hover`，基础色板里是近白
实体色，深色皮肤必须一并覆盖——本包 token 表末三行就是这一课的产物）。定位方法：
实机打开出问题的界面，用 DevTools 查该元素的 `color`/`background` 各来自哪个
`var(--dsw-…)`，把缺的那对补进覆盖表，再取色验证对比度。

不碰的东西（公约 §5）：加载器控制台/保留 service/保留 settings 命名空间/保留槽位
前缀（R2）；其它皮肤的 DOM 与样式（R3）；宿主恢复面（R4）；宿主私有 DOM、
CSS-module hash、`data-ds-dark-theme` 之外的宿主私有属性（R5）；自启与自我恢复（R6）；
任何其它插件的启停（R7）。

## 构建与发布（三步）

```bash
# 1. 构建（tsc 类型检查 + esbuild-wasm 产出 lib/）
pnpm --filter @dsh-eac/skin-aurora build

# 2. 安装到任意 dsh profile（peerDependencies 参与安装期兼容闸门，api-notes §12.2）
dsh plugin --profile <name> add <本包路径或 npm 包名>

# 3. 在加载器控制台（设置 → 皮肤）点击卡片激活；切换/恢复默认由加载器裁决
```

发布你自己的皮肤：复制本包结构 → 改 `identity.ts` 的四件身份常量（包名/皮肤 id/
设置命名空间/CSS 前缀，**全部换成你自己的反域名**）→ 实现 activate/deactivate
（照 session.ts 的登记纪律）→ `package.json` 的 `dsh.skin` 声明与
`peerDependencies` 对齐你的宿主版本。

## 与外部开发者的已知差异（仅两处，均为本仓库纪律）

1. **schemastery 导入**：外部开发者可在 host 半直接
   `import Schema from "@deepseek-ai/schemastery"`；本仓库的隔离 lint 禁止皮肤源码
   import `@deepseek-ai/*`，故由构建脚本以 banner/footer 注入产物（运行时形态相同）。
2. **宿主 API 类型**：外部开发者可以安装 `@deepseek-ai/*` 的类型包；本包用
   `src/context.ts` 的本地结构类型（零导入，形状权威是 `docs/api-notes.md`）。

除这两点外，本包与外部皮肤包形态完全一致。

## 预览图同步说明

`package.json` 的 `dsh.skin.preview` 与 `src/preview.ts` 的 `AURORA_PREVIEW_SVG`
是同一份 SVG（单行）。修改 `preview.ts` 后请同步 `package.json`（加载器控制台
显示的是 registerSkin 登记的 preview，package.json 的声明面向公约生态其它工具）。
