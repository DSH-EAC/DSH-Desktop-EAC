# Changelog

本项目的全部显著改动记录于此。版本遵循 [SemVer 2.0.0](https://semver.org/lang/zh-CN/)。

## 1.1.0 — 2026-09-26

M1 皮肤迁移版本：皮肤包从 5 款扩到 13 款（新增 8 款公约化迁移皮肤），发布 14 个 tarball（加载器 1 + 皮肤 13）；加载器版本随之升到 1.1.0。

### 新增迁移皮肤（观感内容原样迁移，执行骨架公约化）

八款皮肤观感与行为内容**原样迁移**自不可变 Git 对象 DSH-Desktop-EAC@`26841f5ee83c154a9768cc0a9cec1d70078f0ddf`（`dsh-desktop/assets/skins` tree `2a243cf86e541a8b635191a1f5df017a47ab81d2`）；工程骨架（清单 / 公约接线 / 会话适配 / 构建 / 测试）为本仓原始代码，来源与许可全文随包落档于各包 `THIRD-PARTY-NOTICES.md`。

- **@dsh-eac/skin-blue-fantasy「蓝色幻想」**：DreamSkin 鲸鱼画作 + 长春花蓝玻璃面（上游 `@linxin666/dsh-client-ui-skin-blue-fantasy` 0.1.11，BSD-3-Clause；画作 MIT © powerdog996）。
- **@dsh-eac/skin-maid-atelier「深海女仆工坊」**：深海女仆工坊场景背景 + 藏青蕾丝覆盖层（上游 `@dsh-external/dsh-client-ui-skin-maid-atelier` 0.0.1，**CC BY-NC-SA 4.0，仅限非商业使用**；署名链 上善 → zipzip → Small-tailqwq 全文随包）。
- **@dsh-eac/skin-miku「初音未来 · 电子歌姬」**、**@dsh-eac/skin-minecraft「Minecraft 方块世界」**、**@dsh-eac/skin-qq98「QQ2008 怀旧版」**、**@dsh-eac/skin-ths「同花顺风格」**、**@dsh-eac/skin-xp「Windows XP (Luna)」**：上游 `@linxin666/dsh-client-ui-skin-*` 0.1.11，BSD-3-Clause © zhu1090093659。

### 发布契约与元数据修复

- 新增跨包发布契约测试 `packages/loader/src/manifest.test.ts`（failing-first）：包名 / 皮肤 id / body marker 全局唯一、`files` 必须显式包含 `LICENSE`/`NOTICE`/`THIRD-PARTY-NOTICES.md`、`license` 必须是合法 SPDX 表达式、行 id 与 `cordis.patch.yml` 插入行及 `src/identity.ts` 常量三处一致、加载器包必须声明许可并随包附许可文本。
- **加载器包**：补 `license: MIT`、`description`，`files` 补 `LICENSE`/`NOTICE`/`THIRD-PARTY-NOTICES.md`/`README.md` 并新增对应文件（此前 tarball 内无任何许可文本）。
- **maid-atelier**：`license` 从 `CC BY-NC-SA-4.0`（不是合法 SPDX 表达式——SPDX id 内不得含空格）改为 `MIT AND CC-BY-NC-SA-4.0`（MIT 工程骨架 + CC BY-NC-SA 4.0 观感内容）。
- **七款新迁移皮肤的 `THIRD-PARTY-NOTICES.md`**：来源块补齐可核验的逐包 subtree/blob SHA 与不可变取件 URL；纠正此前把后续提交 `df8afc65…`（`feat(v6/task-3.1)`，2026-09-14T11:57:56Z）标为「Source tree」的标签错误（该提交下 `dsh-desktop/assets/skins` tree 与取材 commit 为同一对象，内容结论不变）。
- **溯源核验（M1）**：取材快照 73 个文件逐个按 Git blob 重算 SHA-1 与取材 commit 对象比对，全部命中（71 个逐字节相同；`maid-atelier/LICENSE`、`maid-atelier/NOTICE` 仅 CRLF 行尾差异）。六款 dsh-web-ui 皮肤的 `NOTICE` 与 maid-atelier 的 `NOTICE` + CC 许可全文亦与上游 blob 逐字一致。

### 未纳入本次发布（deferred）

- **dsh-theme-endfield**（`ymh0000123/dsh-theme-endfield@82655a0`）：**DEFERRED**。完整 host/client 功能插件（音频通知、诊断落盘、独立设置 UI、等高线渲染），不是一次纯皮肤迁移；需单独的功能插件/设置命名空间方案。

### 验证（v1.1.0）

- 全仓实跑 `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build`，并对 13 个包逐个 `npm pack` 生成 tarball + SHA-256 清单；每包 tarball 做必含文件冒烟（`lib/`、`cordis.patch.yml`、`README.md`、`THIRD-PARTY-NOTICES.md`、`LICENSE`、`NOTICE`）。
- v1.0.0 的实机验证矩阵（V1-V11，五款皮肤）证据仍见 [`docs/verification.md`](./docs/verification.md)；v1.1.0 新增七款皮肤的实机验收尚未执行（见 M1 报告 known limitations）。

## 1.0.0 — 2026-09-26

首个发布版本：弱约束公约 [`dsh.ecosystem.ui-skin-loader/v1`](https://github.com/DSH-EAC/dsh-ui-skin-loader-convention) 的参考实现加载器与五款皮肤包（2 款内置示例 + 3 款公约化迁移）。

### 加载器（@dsh-eac/ui-skin-loader）

- **adapter 层**：对宿主 `@deepseek-ai/dsh@0.1.7-rc.2` 公开 API 的实机核对与适配（client bundle 注入、槽位、主题 token、configForms、locale、插件启停粒度），全部结论以 `docs/api-notes.md` 实测定案为准。
- **SkinRuntime**：皮肤发现登记、全局互斥切换状态机（激活前先彻底关闭旧皮肤）、提交后落盘的持久化与跨重启恢复重放、故障隔离（激活抛错回滚 / deactivate 超时标记疑似残留并如实呈现）、跨标签页同步收敛。
- **换肤控制台**：settings 分区 + 侧栏入口 + shell 浮层三席位，亮暗双案自适应（跟随宿主 token，皮肤覆盖时自动跟随其色板），主按钮前景色按 accent 实际亮度推导（WCAG AA）；故障与疑似残留徽标、行内错误原文呈现。

### 内置示例皮肤（参考实现）

- **@dsh-eac/skin-aurora「极光之夜」1.0.0**：深色玻璃拟态 + 极光渐变背景，带自定义设置面（背景图 / 透明度），含卡片封面 SVG 与预览。
- **@dsh-eac/skin-inkwash「水墨青烟」1.0.0**：浅色纸质感 + 水墨氛围，无设置面的最小示例（与 aurora 共同构成"有/无设置"两个先例）。

### 迁移皮肤（观感内容原样迁移，执行骨架公约化）

三款皮肤观感与行为内容**原样迁移**自第三方皮肤工程 dsh-web-ui（`@linxin666/dsh-client-ui-skin-*` 0.1.11，BSD-3-Clause © zhu1090093659），均经 DSH-Desktop-EAC@`26841f5` 取材；工程骨架（清单 / 公约接线 / 会话适配 / 构建 / 测试）为本仓原始代码。来源与许可全文随包落档于各包 `THIRD-PARTY-NOTICES.md`。

- **@dsh-eac/skin-trading「交易终端」1.0.0**：实时行情跑马灯 + 交易时段状态栏 + 红涨绿跌配色（取材 tree `f0d514e`）。
- **@dsh-eac/skin-dragon-heir「龙的传人」1.0.0**：不屈龙魂 / 万里长城双主题 + 朱砂龙印（取材 tree `ccbca11`）。
- **@dsh-eac/skin-whale-song「鲸吟」1.0.0**：深海氛围背景 + 冰蓝海洋调色板；原上游具象人物插画（蓝发女神与鲸群）已按 IP 处理裁定（R13）移除，替换为原色板派生的非具象水彩式 CSS 处理（取材 tree `6716abe`）。

### 验证战役中发现并修复的真实缺陷

- **跨标签页同步在真实镜像回源时序下永不收敛**（V7 首跑暴露）：宿主设置事件为异步回源，事件到达时本地快照尚为旧值，单一事件触发源会幂等跳过后永不重放。修复：设置存储暴露 `onChange`，运行时把本命名空间快照变更接为收敛检查的第二触发源。
- **迁移皮肤 activate 半途抛错泄漏半套副作用**（F11.1，Phase 3 故障抽查暴露）：激活改为事务化——apply 前快照皮肤自有锚点、注册差集清扫兜底 disposer、失败路径还原标题与裸定时器；三款迁移皮肤对称修复。

### 验证

- 验证矩阵 **V1-V11**（干净 boot / tarball 安装链 / 单元测试 / 控制台渲染 / 热切换零残留 / 持久化 / 跨标签页 / 故障隔离 / 卸载回归与路径审计 / 视觉验收 / 公约 §9 符合性）在 0.1.7-rc.2 隔离环境全量实跑通过，全过程与证据见 [`docs/verification.md`](./docs/verification.md)；五皮肤全景、互斥混切与公约 §9 六问自检（每款皮肤）全部通过。
