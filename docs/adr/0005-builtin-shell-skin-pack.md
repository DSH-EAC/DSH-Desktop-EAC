# ADR 0005 — 壳层皮肤包（内置本体控件与样式的分离）

日期：2026-09-13
状态：Accepted（v6 Task 1.1）

## 背景

v6 之前，EAC 桌面壳层自有的 UI（本体控件）与其视觉样式是硬编码耦合的：

- Rust 壳（L1）内嵌的四个壳页（loading / died / update / about）把颜色、
  字体直接写在 `format!` 字符串的 style 属性里，共享 `SHELL_BODY_STYLE` 常量；
- 磁盘壳页（`assets/onboarding.html`、`assets/recovery-center.html`）各含
  一段硬编码 `<style>`；
- 壳层控件脚本（`tauri-shell/src/exit-overlay.js`）的 CSS 以色值字面量内嵌。

v6 的目标是本体、皮肤、插件三者边界清晰（Task 3.1 要让"最简本体只保留对
dsh 的最简包装"）。本体 UI 必须先做到"结构归本体、视觉归皮肤包"，后续
Task 1.2（AIO 视觉拆解）、Task 3.2（皮肤包接入最简本体）、Task 6.2
（外部样式包）才有可挂接的接缝。

## 范围界定："本体控件"指什么

dsh 内核的 React 控件库（`@deepseek-ai/dsh-client-ui-primitives` 等）属官方
上游，EAC 不修改，其样式已由官方 tokens 化（`--dsw-*`）。`assets/skins/`
下的 10 款皮肤是完整 cordis 插件包，属 Task 1.2 的拆解对象。

因此本 ADR 的"本体控件和样式"指 **EAC 壳层自有 UI**：内嵌壳页、磁盘壳页、
退出确认 overlay、资源缺失降级页。

## 决策

1. **皮肤包位置与结构**：内置皮肤包放在
   `dsh-desktop/assets/shell-skin/eac-default/`，含三个文件：
   - `skin.json` — 清单（id / kind: "shell-skin" / version / files / consumers）；
   - `tokens.css` — 全部视觉 token 的**单一事实源**（`--eac-shell-*` 命名空间）；
   - `controls.css` — 壳层控件类样式（`.eac-shell` 作用域），只消费 token。
   不放进 `assets/skins/`：那是 dsh 客户端 cordis 皮肤目录，由
   `companion-sync.ts` 枚举并注入 profile，壳层皮肤不参与该协议，混放会
   混淆两类"皮肤"的归属（Mojobox 边界纪律：分发物身份必须单一）。

2. **加载机制**：Rust 壳 `http_serve` 新增 `/skin/<file>` 路由，从
   `resource_root()/dsh-desktop/assets/shell-skin/eac-default/` 伺服，白名单
   仅 `tokens.css` / `controls.css`（无路径穿越面）。壳页以
   `<link rel=stylesheet href="/skin/...">` 引用；资源装配链
   （`stage-resources.mjs` 整树拷贝 `assets/`）自动携带，无需改打包。

3. **降级契约**：所有 token 消费处一律写 `var(--eac-shell-x, <fallback>)`，
   fallback 字面量与拆分前的硬编码值一致。皮肤包缺失（资源缺失、直开
   文件、早期降级路径）时页面按原值渲染，不裸奔。Rust 内嵌页的
   `unwrap_or_default()` 降级文案同样消费 token。

4. **命名空间**：`--eac-shell-*`，与 dsh 客户端 `--dsw-*` / `--aion-*`
   严格区分；壳层皮肤永不定义或覆盖内核 token（对齐桥玻璃栏
   `bridge.ts` 只读消费 `--dsw-alias-*` 的既有纪律）。

5. **值归并**：拆分时把散落在各页面的近重复色值归并为统一 token
   （主文本 `#dfe6ff/#e6ecff/#dbe4f0` → `--eac-shell-text-primary`；
   次要文本 `#8b9ac4/#8ea3c8/#7c8db0` → `--eac-shell-text-secondary` 等）。
   归并只发生在同语义近似值之间，视觉差异在不可辨级别；恢复中心的
   实色面板体系（banner/risk/btn 独立色）保留独立 token，不强行并入
   玻璃体系。

6. **不做的事**：
   - 不做运行时切换 UI（Task 3.2 范围）——壳页生命周期短（秒级），
     加载时伺服即定；
   - 不动 cordis 皮肤协议与 `skin.json`（那是客户端皮肤的清单，两者同名
     但字段集不同、目录不同、消费方不同）；
   - Rust 壳不新增业务逻辑，仅静态文件路由（L1 边界，ADR 0002）。

## 后果

- 本体壳页只持有结构与 token 消费；换皮肤包 = 换 `/skin/*` 伺服的目录。
- Task 1.2 可将 AIO 外观拆成第二个 shell-skin 包并列伺服做 A/B；
  Task 6.2 外部样式包可复用同一 token 契约（外部包只覆盖 token 值）。
- 新增壳层 UI 时必须：消费 `var(--eac-shell-*, fallback)`，新视觉值先进
  `tokens.css`；测试 `shell-skin-pack.test.ts` 会拦截裸色值回归。

## 验证

- `dsh-desktop/test/shell-skin-pack.test.ts`：皮肤包结构、token 单一事实源、
  消费处 fallback 契约、硬编码色清零、`/skin/` 路由存在性。
- `npm test` 全量回归（重点 recovery-center / onboarding-selection /
  eac-locale-compat / rescue-integration）、`cargo check`。
