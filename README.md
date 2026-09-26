# dsh-ui-skin-loader

[![CI](https://github.com/DSH-EAC/dsh-ui-skin-loader/actions/workflows/ci.yml/badge.svg)](https://github.com/DSH-EAC/dsh-ui-skin-loader/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**DSH UI 皮肤加载器**——弱约束公约 [`dsh.ecosystem.ui-skin-loader/v1`](https://github.com/DSH-EAC/dsh-ui-skin-loader-convention) 的参考实现：一个加载器加十三款皮肤（2 款内置示例 + 11 款公约化迁移），装入 DSH 后即可在设置里一键换肤、随时彻底还原。

| 字段 | 值 |
| --- | --- |
| 公约 | `dsh.ecosystem.ui-skin-loader/v1`（[公约仓库](https://github.com/DSH-EAC/dsh-ui-skin-loader-convention)） |
| 适配宿主 | `@deepseek-ai/dsh` `0.1.7-rc.2` |
| 运行时 | Node.js >= 24（源码经 Node 原生 type-stripping 直接执行） |
| 当前版本 | 1.1.0（[CHANGELOG](./CHANGELOG.md)） |

## 它是什么

- **加载器**（`@dsh-eac/ui-skin-loader`）：皮肤发现登记、全局互斥切换、持久化与跨重启恢复、故障隔离（激活抛错回滚 / 关闭超时如实标记疑似残留）、跨标签页同步，以及设置页里的换肤控制台（亮暗双案自适应）。
- **皮肤**：一个遵循公约的皮肤插件在未激活时**零副作用**（只登记元数据），激活后才产生可见副作用，被换走或停用时**彻底关闭**——宿主观感与它从未激活时逐像素一致。v1.0.0 的五款皮肤经实机验证矩阵逐款验收；v1.1.0 新增的七款迁移皮肤经类型检查、lint、单元测试、构建与打包冒烟验证（实机验收清单见 [`docs/verification.md`](./docs/verification.md)）。

## 皮肤清单（13 款）

| 皮肤 | 包 | 皮肤 id | 许可 | 来源 |
| --- | --- | --- | --- | --- |
| 极光之夜 | `@dsh-eac/skin-aurora` | `dsh-eac.skin.aurora` | MIT | 内置示例（本仓原创，带自定义设置面） |
| 水墨青烟 | `@dsh-eac/skin-inkwash` | `dsh-eac.skin.inkwash` | MIT | 内置示例（本仓原创，无设置面） |
| 交易终端 | `@dsh-eac/skin-trading` | `dsh-eac.skin.trading` | MIT AND BSD-3-Clause | dsh-web-ui `@linxin666/dsh-client-ui-skin-trading` 0.1.11 |
| 龙的传人 | `@dsh-eac/skin-dragon-heir` | `dsh-eac.skin.dragon-heir` | MIT AND BSD-3-Clause | dsh-web-ui `@linxin666/dsh-client-ui-skin-dragon-heir` 0.1.11 |
| 鲸吟 | `@dsh-eac/skin-whale-song` | `dsh-eac.skin.whale-song` | MIT AND BSD-3-Clause | dsh-web-ui `@linxin666/dsh-client-ui-skin-whale-song` 0.1.11（具象人物插画按 IP 裁定移除，见 CHANGELOG） |
| 蓝色幻想 | `@dsh-eac/skin-blue-fantasy` | `dsh-eac.skin.blue-fantasy` | MIT AND BSD-3-Clause | dsh-web-ui `@linxin666/dsh-client-ui-skin-blue-fantasy` 0.1.11（DreamSkin 画作，MIT © powerdog996） |
| 深海女仆工坊 | `@dsh-eac/skin-maid-atelier` | `dsh-eac.skin.maid-atelier` | MIT AND CC-BY-NC-SA-4.0 | `@dsh-external/dsh-client-ui-skin-maid-atelier` 0.0.1（非商业） |
| 初音未来 · 电子歌姬 | `@dsh-eac/skin-miku` | `dsh-eac.skin.miku` | MIT AND BSD-3-Clause | dsh-web-ui `@linxin666/dsh-client-ui-skin-miku` 0.1.11 |
| Minecraft 方块世界 | `@dsh-eac/skin-minecraft` | `dsh-eac.skin.minecraft` | MIT AND BSD-3-Clause | dsh-web-ui `@linxin666/dsh-client-ui-skin-minecraft` 0.1.11 |
| QQ2008 怀旧版 | `@dsh-eac/skin-qq98` | `dsh-eac.skin.qq98` | MIT AND BSD-3-Clause | dsh-web-ui `@linxin666/dsh-client-ui-skin-qq98` 0.1.11 |
| 同花顺风格 | `@dsh-eac/skin-ths` | `dsh-eac.skin.ths` | MIT AND BSD-3-Clause | dsh-web-ui `@linxin666/dsh-client-ui-skin-ths` 0.1.11 |
| Windows XP (Luna) | `@dsh-eac/skin-xp` | `dsh-eac.skin.xp` | MIT AND BSD-3-Clause | dsh-web-ui `@linxin666/dsh-client-ui-skin-xp` 0.1.11 |
| 鲸鱼娘昼夜工坊 | `@dsh-eac/skin-deep-whale-day-night` | `dsh-eac.skin.deep-whale-day-night` | MIT AND CC-BY-NC-SA-4.0 | `GGBond2424648901/deep-whale-day-night-theme` 0.1.12（固定 commit，非商业） |

十一款迁移皮肤的内容取自不可变 Git 对象：十款来自 DSH-EAC/DSH-Desktop-EAC 提交 `26841f5ee83c154a9768cc0a9cec1d70078f0ddf`，深鲸来自 `GGBond2424648901/deep-whale-day-night-theme@3f6c4f14716d1e500f585be0c0d3c139c7a8a90b`；每包 `THIRD-PARTY-NOTICES.md` 记录上游包名与版本、固定 commit 与许可文本。许可边界：包工程骨架（清单 / 公约接线 / 会话适配 / 构建 / 测试）为 MIT，随包观感内容按其上游许可分发。

### 未纳入本次发布（deferred）

| 皮肤 | 状态 | 原因 |
| --- | --- | --- |
| `dsh-theme-endfield`（ymh0000123/dsh-theme-endfield） | **DEFERRED**（未创建文件） | 完整 host/client 功能插件（音频通知、诊断落盘、独立设置 UI、等高线渲染），不是一次纯皮肤迁移；需单独的功能插件/设置命名空间方案。 |

## 安装

### 前置条件

- [DSH](https://www.npmjs.com/package/@deepseek-ai/dsh) `0.1.7-rc.2`（`dsh` 命令行可用）；
- Node.js **>= 24**（构建安装包时需要 pnpm 11；安装动作本身由 `dsh` 驱动）。

### 1. 构建安装包

克隆本仓后在工作区根执行依赖安装与构建，再对十三个包逐个 `npm pack`：

```bash
pnpm install
pnpm build        # tsc --noEmit + esbuild-wasm 产出各包 lib/ 可安装产物

mkdir -p dist
npm pack --pack-destination dist          # 在 packages/loader 执行
# 再在 packages/skins/<每款皮肤目录> 各执行一次：
npm pack --pack-destination <dist 绝对路径>
```

得到 14 个 tarball：加载器 1 个 + 皮肤 13 个。

```text
dsh-eac-ui-skin-loader-1.1.0.tgz       加载器
dsh-eac-skin-aurora-1.1.0.tgz          极光之夜
dsh-eac-skin-inkwash-1.1.0.tgz         水墨青烟
dsh-eac-skin-trading-1.1.0.tgz         交易终端
dsh-eac-skin-dragon-heir-1.1.0.tgz     龙的传人
dsh-eac-skin-whale-song-1.1.0.tgz      鲸吟
dsh-eac-skin-blue-fantasy-1.1.0.tgz    蓝色幻想
dsh-eac-skin-maid-atelier-1.1.0.tgz    深海女仆工坊
dsh-eac-skin-miku-1.1.0.tgz            初音未来 · 电子歌姬
dsh-eac-skin-minecraft-1.1.0.tgz       Minecraft 方块世界
dsh-eac-skin-qq98-1.1.0.tgz            QQ2008 怀旧版
dsh-eac-skin-ths-1.1.0.tgz             同花顺风格
dsh-eac-skin-xp-1.1.0.tgz              Windows XP (Luna)
```

### 2. 逐包装入 DSH

对每个 tarball 执行一次 `dsh plugin add`（profile 按需命名；皮肤包依赖加载器，建议先装加载器）：

```bash
dsh plugin --profile web add <dist>/dsh-eac-ui-skin-loader-1.1.0.tgz
dsh plugin --profile web add <dist>/dsh-eac-skin-aurora-1.1.0.tgz
dsh plugin --profile web add <dist>/dsh-eac-skin-inkwash-1.1.0.tgz
dsh plugin --profile web add <dist>/dsh-eac-skin-trading-1.1.0.tgz
dsh plugin --profile web add <dist>/dsh-eac-skin-dragon-heir-1.1.0.tgz
dsh plugin --profile web add <dist>/dsh-eac-skin-whale-song-1.1.0.tgz
dsh plugin --profile web add <dist>/dsh-eac-skin-blue-fantasy-1.1.0.tgz
dsh plugin --profile web add <dist>/dsh-eac-skin-maid-atelier-1.1.0.tgz
dsh plugin --profile web add <dist>/dsh-eac-skin-miku-1.1.0.tgz
dsh plugin --profile web add <dist>/dsh-eac-skin-minecraft-1.1.0.tgz
dsh plugin --profile web add <dist>/dsh-eac-skin-qq98-1.1.0.tgz
dsh plugin --profile web add <dist>/dsh-eac-skin-ths-1.1.0.tgz
dsh plugin --profile web add <dist>/dsh-eac-skin-xp-1.1.0.tgz
```

安装形态说明（tarball 链路实测）：

- tarball 以复制方式装入 profile（依赖随包装入，`dsh.profile.bundles` 自动追加），**安装即启用**；
- 同路径同名重装需先 `dsh plugin --profile web remove <包名>` 再 add（包管理器对相同 `file:` 规格会跳过重装）；
- v1.0.0 验证战役（V2 项）以该命令序列在全新隔离环境装入六包、boot 零 error/warn，全过程见 [`docs/verification.md`](./docs/verification.md)。

### 3. 使用：打开设置 → 皮肤控制台

启动（或重启）DSH 后，打开 **设置 → 皮肤** 即见换肤控制台：

- **卡片墙**列出全部已安装皮肤（未激活的皮肤零副作用，只显示元数据与封面）；
- 点击卡片**激活**（全局互斥：任意时刻至多一款皮肤生效），hero 区的「恢复默认」一键回到宿主原生观感；
- 选择**跨重启自动恢复**；激活抛错自动回滚并在卡内呈现错误原文，关闭异常会如实标记「疑似残留」；
- 带自定义设置的皮肤（极光之夜）激活后，在 **设置 → 极光之夜** 提供其自有设置分区；无设置皮肤不被区别对待。

## 画廊

安装后的皮肤控制台（v1.0.0 五卡齐全、均未激活，settled 全景）：

![五皮肤全景](docs/images/37-panorama-five-skins-release.png)

v1.0.0 实机验收的各皮肤激活态（截图档案存于 [`docs/images/`](./docs/images/)，实拍环境与验证矩阵见 [`docs/verification.md`](./docs/verification.md)）：

| 皮肤 | 激活态实拍 |
| --- | --- |
| 极光之夜（内置示例：深色玻璃拟态 + 极光渐变，带自定义设置） | <img src="docs/images/21-aurora-active-settled.png" width="420" /> |
| 水墨青烟（内置示例：浅色纸质感 + 水墨氛围，无设置） | <img src="docs/images/22-inkwash-active-settled.png" width="420" /> |
| 交易终端（迁移：实时行情跑马灯 + 交易时段状态栏） | <img src="docs/images/30-trading-active-settled.png" width="420" /> |
| 龙的传人（迁移：不屈龙魂/万里长城双主题 + 朱砂龙印） | <img src="docs/images/31-dragon-heir-active-settled.png" width="420" /> |
| 鲸吟（迁移：深海氛围背景 + 冰蓝海洋调色板） | <img src="docs/images/32-whale-song-active-settled.png" width="420" /> |

## 仓库结构

```text
packages/
  loader/               @dsh-eac/ui-skin-loader    加载器（adapter + SkinRuntime + 控制台）
  skins/
    aurora/             @dsh-eac/skin-aurora       内置示例「极光之夜」（带设置面）
    inkwash/            @dsh-eac/skin-inkwash      内置示例「水墨青烟」（无设置）
    trading/            @dsh-eac/skin-trading      迁移皮肤「交易终端」
    dragon-heir/        @dsh-eac/skin-dragon-heir  迁移皮肤「龙的传人」
    whale-song/         @dsh-eac/skin-whale-song   迁移皮肤「鲸吟」
    blue-fantasy/       @dsh-eac/skin-blue-fantasy 迁移皮肤「蓝色幻想」
    maid-atelier/       @dsh-eac/skin-maid-atelier 迁移皮肤「深海女仆工坊」
    miku/               @dsh-eac/skin-miku         迁移皮肤「初音未来 · 电子歌姬」
    minecraft/          @dsh-eac/skin-minecraft    迁移皮肤「Minecraft 方块世界」
    qq98/               @dsh-eac/skin-qq98         迁移皮肤「QQ2008 怀旧版」
    ths/                @dsh-eac/skin-ths          迁移皮肤「同花顺风格」
    xp/                 @dsh-eac/skin-xp           迁移皮肤「Windows XP (Luna)」
docs/
  api-notes.md          DSH 0.1.7-rc.2 API 实机核对笔记（adapter 的权威依据）
  verification.md       验证矩阵 V1-V11 + Phase 3 迁移皮肤验收实跑报告
  images/               README 画廊截图（实拍档案）
CHANGELOG.md            版本变更记录
```

每个皮肤包内均含 `THIRD-PARTY-NOTICES.md`（上游来源、逐包 subtree/blob SHA、许可全文）、`LICENSE`（本仓 MIT）与 `NOTICE`（上游许可声明原文，内置示例为「无第三方声明」）。

## 开发

环境要求：Node >= 24、pnpm 11。

```bash
pnpm install        # 安装依赖并生成 lockfile
pnpm lint           # ESLint（typescript-eslint flat config，递归全部包）
pnpm test           # node --test 直接运行各包 .test.ts（递归全部包）
pnpm build          # tsc --noEmit + esbuild-wasm 产出可安装产物（lib/，gitignored）
pnpm typecheck      # tsc --noEmit 类型检查（递归全部包）
```

跨包发布契约（包名/皮肤 id/body marker 全局唯一、许可文件入包、SPDX 表达式合法、行 id 与 `cordis.patch.yml` 一致）由 `packages/loader/src/manifest.test.ts` 在 `pnpm test` 中机械守门。

## 运行时策略

- TypeScript 源码由 **Node 24 原生 type-stripping** 直接执行：`.ts` 文件不经编译产物，`node --test` 直接运行测试。
- 因此源码只允许可擦除 TS 语法：**禁用 enum / namespace / 装饰器 / 参数属性**。
- `tsc --noEmit` 仅做类型检查，不参与运行。

## 皮肤开发者指引

皮肤 client bundle 顶层导出 cordis 服务注入与 apply；在 apply 内向加载器登记
`SkinRegistration`，并把反登记包进 `ctx.effect`（fiber 卸载自动撤销登记）：

```ts
// 皮肤 client bundle 顶层
export const inject = ["uiSkinLoader"]; // 还需要 slots/theme/locale 等服务时自行追加

export function apply(ctx) {
  // 登记 ≠ 激活：registerSkin 只入发现表，零副作用
  const unregister = ctx.uiSkinLoader.registerSkin({
    apiVersion: "dsh.ecosystem.ui-skin-loader/v1",
    id: "example.aurora", // 公约 §3：[a-z0-9]+(?:[.-][a-z0-9]+)*
    name: "极光之夜",
    version: "1.0.0",
    activate(skinCtx) { /* 自此才允许可见副作用；经 skinCtx.slots 登记 */ },
    deactivate() { /* 撤销 activate 以来的全部副作用 */ },
  });
  ctx.effect(() => unregister);
}
```

- **登记 ≠ 激活**：`registerSkin` 只入发现表，零副作用；激活只经加载器的
  `switchTo` 状态机（公约 §4）。
- 完整 `SkinRegistration` / `SkinContext` 契约见 `packages/loader/src/protocol.ts`
  （公约 §3/§4/§6 的冻结面）。
- **上手材料**：公约 §9 最小皮肤骨架（[`dsh-ui-skin-loader-convention/examples/minimal-skin`](https://github.com/DSH-EAC/dsh-ui-skin-loader-convention/tree/main/examples/minimal-skin)）；
  十三款真实皮肤的包结构、接线与会话实现见各包 `packages/skins/<id>/README.md`
  （有设置看 aurora，无设置看 inkwash，上游观感迁移看其余十一款）。

## 验证

验证矩阵 **V1-V11**（干净 boot / tarball 安装链 / 单元测试 / 控制台亮暗渲染 / 热切换零残留 / 持久化 / 跨标签页 / 故障隔离 / 卸载回归与路径审计 / 视觉验收 / 公约 §9 符合性）在 0.1.7-rc.2 隔离环境全量实跑通过（v1.0.0 五款皮肤）；v1.1.0 的七款新迁移皮肤以类型检查、lint、单元测试、构建与 tarball 打包冒烟验证覆盖，实机验收清单见 [`docs/verification.md`](./docs/verification.md)。宿主 API 形态的唯一权威依据是 [`docs/api-notes.md`](./docs/api-notes.md)。

## 公约

- 公约仓库：<https://github.com/DSH-EAC/dsh-ui-skin-loader-convention>
- 本仓库是该公约的参考实现加载器；皮肤包与加载器的接缝以公约为准。

## License 与署名

- 本仓**工程骨架**（加载器、皮肤接线、构建与测试）以 [MIT](./LICENSE) 许可发布（© 2026 DSH EAC · 揽尽万象）。
- 十一款迁移皮肤的**观感与行为内容**按其上游许可随包落档：
  - 六款 dsh-web-ui 皮肤（蓝色幻想 / 初音未来 / Minecraft 方块世界 / QQ2008 怀旧版 / 同花顺风格 / Windows XP）与 v1.0.0 的三款（交易终端 / 龙的传人 / 鲸吟）同源，上游 `@linxin666/dsh-client-ui-skin-*` 0.1.11，BSD-3-Clause © zhu1090093659；
  - 深海女仆工坊（maid-atelier）：`@dsh-external/dsh-client-ui-skin-maid-atelier` 0.0.1，CC BY-NC-SA 4.0（**仅限非商业使用**，署名链 上善 → zipzip → Small-tailqwq 随包保留全文）。
- 每包来源、改动与许可全文见 [`THIRD-PARTY-NOTICES.md`](packages/skins/trading/THIRD-PARTY-NOTICES.md)；打包产物内同样包含该文件与 `NOTICE`。
