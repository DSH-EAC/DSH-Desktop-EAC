# EAC 本体默认皮肤包（eac-default）

v6 Task 1.1 交付物。EAC 桌面壳层（本体）UI 的视觉皮肤包，把壳层页面与
控件的样式从硬编码中分离。设计决策见
`docs/adr/0005-builtin-shell-skin-pack.md`。

## 结构

```text
eac-default/
├── skin.json     # 清单：id、kind: "shell-skin"、version、files、consumers
├── tokens.css    # 全部视觉 token 的单一事实源（--eac-shell-* 命名空间）
└── controls.css  # 壳层控件类样式（.eac-shell 作用域），只消费 token
```

与 `assets/skins/` 下的 dsh 客户端皮肤（cordis 插件包）是两类东西：
壳层皮肤不进 dsh profile、不参与 cordis 加载协议。

## 如何被加载

1. Rust 壳（`tauri-shell/src/main.rs` 的 `http_serve`）提供回环路由
   `/skin/tokens.css`、`/skin/controls.css`，从本目录伺服
   （白名单固定两个文件名，缺失时返回空体）。
2. 壳层页面引用：
   - Rust 内嵌页（loading / died / update / about / 资源缺失降级页）：
     经 `SHELL_SKIN_LINKS` 常量在 body 前注入 `<link>`；
   - 磁盘壳页（`onboarding.html` / `recovery-center.html`）：`<head>` 内
     `<link rel="stylesheet" href="/skin/...">`，`<html>` 挂 `.eac-shell`；
   - `exit-overlay.js`：注入在主窗 Web UI 上下文，无法保证 `/skin/` 可达，
     以 `var(--eac-shell-*, fallback)` 消费，fallback 即原值。
3. 打包：`stage-resources.mjs` 整树拷贝 `assets/`，本目录自动随行。

## Token 消费契约

- 消费处一律写 `var(--eac-shell-<name>, <fallback>)`，fallback 与拆分前
  硬编码值一致——皮肤包缺失时页面降级可读，不裸奔。
- `tokens.css` 是 token 的唯一定义处；页面与脚本不得重复定义 token。
- 命名空间 `--eac-shell-*` 与 dsh 客户端 `--dsw-*` / `--aion-*` 严格区分，
  壳层皮肤不定义、不覆盖内核 token。

## Token 清单（按用途）

| 用途 | Token（省略 `--eac-shell-` 前缀） |
| --- | --- |
| 基底背景 | `bg-base`、`bg-page`、`bg-elevated(-strong)`、`bg-overlay` |
| 文本层级 | `text-primary/secondary/tertiary/label`、`text-on-accent` |
| 强调蓝 | `accent`、`accent-hover`、`accent-soft-bg(-strong/-hover)`、`accent-soft-border`、`accent-text` |
| 语义色 | `ok(-border/-text)`、`warn(-border)`、`danger(-border/-text/-soft-*)`、`close-hover`、`safe-mode-*` |
| 表面与边框 | `surface(-hover/-weak)`、`border(-weak/-strong)`、`card-bg/-shadow/-raised` |
| 恢复中心面板 | `panel-*`、`log-bg`、`banner-err/ok-*`、`risk-*`、`danger-btn-border`、`warn-btn-*` |
| 字体 | `font-family`、`font-mono` |
| 滚动条 | `scrollbar-thumb(-hover)` |

新增视觉值时先进 `tokens.css` 再消费；专项测试
`dsh-desktop/test/shell-skin-pack.test.ts` 会拦截裸色值回归。

## 后续衔接（v6）

- Task 1.2：AIO 视觉拆解可产出并列的第二个 shell-skin 包；
- Task 3.2：最简本体接入内置皮肤包，即消费本包；
- Task 6.2：外部样式包复用同一 token 契约（只覆盖 token 值）。
