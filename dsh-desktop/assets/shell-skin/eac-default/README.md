# EAC 本体默认皮肤包（system.default）

v6 Task 1.1 交付物。EAC 桌面壳层（本体）UI 的视觉皮肤包，把壳层页面与
控件的样式从硬编码中分离。设计决策见
`docs/adr/0005-builtin-shell-skin-pack.md`。

## 公约兼容

本包遵循《DSH-Desktop-EAC UI Skin Authoring Convention》Draft v0.11：

- 默认皮肤 ID 为公约保留的 `system.default`，包类型为 `skin`；
- `owner` 使用反向域名命名空间，兼容目标声明为
  `dsh-desktop-eac-ui-skin-profile@^0.3`；
- 控件层 `system.shell-controls` 与样式层 `system.shell-style` 分别声明，
  版本依赖记录在 `dependencies`，允许后续宿主选择机制按层替换；
- loading / died 与退出确认均为独立窗口或弹层实例，按公约第 8 节不进入
  区块 Binding Table。

`kind: "shell-skin"` 是 L1 壳路由使用的扩展分类，不替代公约的
`type: "skin"`。当前目录名保留为 `eac-default`，包身份以 manifest 的
`system.default` 为准。

## 结构

```text
eac-default/
├── skin.json     # 清单：公约字段、L1 扩展分类、assets、consumers
├── tokens.css    # 全部视觉 token 的单一事实源（--eac-shell-* 命名空间）
└── controls.css  # 壳层控件类样式（.eac-shell 作用域），只消费 token
```

与 `assets/skins/` 下的 dsh 客户端皮肤（cordis 插件包）是两类东西：
壳层皮肤不进 dsh profile、不参与 cordis 加载协议。

## 如何被加载

1. Rust 壳（`tauri-shell/src/main.rs` 的 `http_serve`）提供回环路由
   `/skin/tokens.css`、`/skin/controls.css`，从本目录伺服
   （白名单固定两个文件名，缺失时返回空体）。
2. 壳层对象引用：
   - `tauri-shell/src/main.rs` 的 loading / died / 资源缺失降级页经
     `SHELL_SKIN_LINKS` 常量在 body 前注入 `<link>`；
   - `tauri-shell/src/exit-overlay.js` 注入主窗口 Web UI，使用同一 token
     命名空间，并为皮肤资源不可达场景保留 fallback；
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
| 语义色 | `ok(-border/-text)`、`warn(-border)`、`danger(-border/-text/-soft-*)`、`close-hover` |
| 表面与边框 | `surface(-hover/-weak)`、`border(-weak/-strong)`、`card-bg/-shadow` |
| 字体 | `font-family`、`font-mono` |
| 滚动条 | `scrollbar-thumb(-hover)` |

新增视觉值时先进 `tokens.css` 再消费；专项测试
`dsh-desktop/test/shell-skin-pack.test.ts` 会拦截裸色值回归。

## 当前边界

- AIO 是实现相同 token 接口的并列内置包；
- 当前 Rust 静态路由固定加载本包；
- 外部样式包可复用同一 token 契约，只覆盖视觉值。
