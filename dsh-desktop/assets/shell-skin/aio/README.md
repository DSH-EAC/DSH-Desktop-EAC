# AIO 壳层皮肤包

v6 Task 1.2（Issue #363）交付物。该包从 `aio-v1` 中提取可复用的壳层视觉，
与 `eac-default` 使用同一 shell-skin 契约。

## 身份

| 层 | ID |
| --- | --- |
| Skin | `io.github.dsh-eac.skin.aio` |
| Control | `io.github.dsh-eac.aio.shell-controls` |
| Style | `io.github.dsh-eac.aio.shell-style` |

Control 和 Style 在 `skin.json` 中保持独立身份及版本依赖，但按 ADR 0005
已经落地的内置包格式，共同存放在一个目录中：

```text
aio/
├── skin.json
├── tokens.css
├── controls.css
└── README.md
```

## 视觉来源

AIO 基线为：

```text
origin/aio-v1
89757fa4b10d789e7bec028102569deefdceafc9
```

提取范围：

| AIO 视觉 | 来源 | 本包表达 |
| --- | --- | --- |
| 深蓝径向背景 | `assets/loading.html`、`assets/updating.html` | 页面背景 token |
| 紫色错误氛围、玻璃卡片 | `assets/recovery.html` | 危险态和卡片 token |
| 蓝色强调、文本层级 | AIO 壳页 | 强调色和文本 token |
| 玻璃表面、紧凑按钮 | `tauri-app/frontend/chrome.ts` | 表面 token 和控件样式 |

本包没有复制图片、字体或第三方二进制资源，仅根据仓库自有 AIO 源码提取
CSS 视觉值。

## 边界

`tokens.css` 完整实现 `eac-default` 的 `--eac-shell-*` token 名集合，
因此后续加载器可以按目录替换皮肤，而无需修改壳页消费者。

`controls.css` 只为 `.eac-shell` 下的既有控件 class 提供外观。以下内容明确
不属于皮肤包：

- 窗口最小化、最大化、关闭和菜单动作。
- `window.dshDesktop`、Tauri invoke 和事件监听。
- 会话、文件、终端、插件管理和更新业务。
- dsh Web UI 的 `--dsw-*` 和 `--aion-*` token。
- AIO 构建产物中的随机 CSS class。

## 当前加载状态

Task 1.2 只制作包，不接入生产切换。Rust `/skin/tokens.css` 和
`/skin/controls.css` 当前仍固定读取 `eac-default`。后续 Task 3.2 可以在不
改变本包内容的前提下增加选择机制。

## 公约兼容

- 类型：`skin`
- 扩展分类：`shell-skin`
- Profile：`dsh-desktop-eac-ui-skin-profile@^0.3`
- `forceable: false`
- 视觉 token 命名空间：`--eac-shell-*`

设计取舍见 `docs/adr/0007-aio-shell-skin-pack.md`。
