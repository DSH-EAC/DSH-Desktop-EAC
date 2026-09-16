# AIO 壳层皮肤包设计

## 1. 背景

Issue #363（v6 Task 1.2）负责把 `aio-v1` 中可复用的视觉部分拆成 AIO
皮肤包。最新 `dev` 已通过 Task 1.1 和 ADR 0005 建立壳层皮肤的真实契约，
因此本任务必须沿用该契约，而不是另建一套尚未接入仓库的包结构。

基线：

- 开发基线：`origin/dev`，提交
  `26841f5ee83c154a9768cc0a9cec1d70078f0ddf`。
- AIO 视觉基线：`origin/aio-v1`，提交
  `89757fa4b10d789e7bec028102569deefdceafc9`。
- 公约基线：《DSH-Desktop-EAC UI Skin Authoring Convention》Draft v0.11，
  提交 `4bc8fbbdbff273583fd75679fb19cd4e8357be88`。
- 直接架构依据：`docs/adr/0005-builtin-shell-skin-pack.md`。

## 2. 目标

在 `dsh-desktop/assets/shell-skin/aio/` 交付一个与 `eac-default` 并列的
AIO shell-skin 包：

```text
aio/
├── skin.json
├── tokens.css
├── controls.css
└── README.md
```

包需要同时表达：

- Skin：`skin.json` 中的聚合身份和兼容声明。
- Control：`skin.json` 中独立的 control ID，以及 `controls.css` 提供的
  壳层控件视觉。
- Style：`skin.json` 中独立的 style ID，以及 `tokens.css` 提供的 AIO
  视觉 token。

Control、Style 在清单层保持可独立选择和版本化，但按照 Task 1.1 已落地的
shell-skin 约定，共同存放在一个目录内，不拆成三个 npm 包。

## 3. 非目标

本任务不实现：

- 生产环境皮肤选择、切换、绑定表或设置界面，这属于后续 Task 3.2。
- `/skin/` 路由的动态目录选择。
- dsh Web UI 的客户端皮肤或 `assets/skins/` 下的 Cordis 插件。
- AIO 的窗口控制、菜单、bridge、文件、终端、会话和插件业务逻辑。
- `--dsw-*` 或 `--aion-*` 内核 token 的定义和覆盖。
- 外部皮肤安装、市场分发或公约最终定稿。

因此 #363 的产物是可检查、可测试、可供后续加载器选择的内置包，不改变
当前运行时仍固定加载 `eac-default` 的行为。

## 4. 包清单

建议清单身份：

```text
skin    io.github.dsh-eac.skin.aio
control io.github.dsh-eac.aio.shell-controls
style   io.github.dsh-eac.aio.shell-style
```

`skin.json` 继续使用 Task 1.1 已验证的字段：

- `type: "skin"`。
- `kind: "shell-skin"`。
- `compatibility.profile:
  "dsh-desktop-eac-ui-skin-profile@^0.3"`。
- `compatibility.forceable: false`。
- `owner: "io.github.dsh-eac"`。
- `control` 和 `style` 分别指向 AIO 层 ID。
- `dependencies` 中两个层的版本与皮肤版本一致。
- `assets` 只列出 `tokens.css` 和 `controls.css`。

## 5. Token 契约

`tokens.css` 必须完整实现默认包的 `--eac-shell-*` token 集合。名称相同，
值替换为 AIO 视觉值，这样后续加载器只需选择包目录，现有消费者无需改动。

AIO 视觉来源包括：

- 启动页的深蓝径向背景、`#5b8cff` 强调色、`#e6ecff` 主文本、
  `#93a5d8` 说明文本和 `#5f6f9c` 弱文本。
- 恢复页的紫色错误背景、玻璃卡片、危险色和按钮状态。
- AIO 自绘标题栏中的 36px 玻璃表面、模糊、边框和紧凑控件观感。

约束：

- 只能定义 `--eac-shell-*`。
- 不定义或覆盖 `--dsw-*`、`--aion-*`。
- `tokens.css` 是 AIO 包视觉值的单一事实源。
- 不复制来源不明的图片、图标或字体；本任务只使用 CSS 值，因此无新增
  二进制资源许可证问题。

## 6. Control 样式

`controls.css` 沿用 `.eac-shell` 作用域和现有壳层 class：

- `.eac-btn`
- `.eac-card`
- `.eac-card-solid`
- `.eac-tag` 及其语义状态

它只消费 `--eac-shell-*`，通过圆角、间距、玻璃表面、模糊和过渡表达 AIO
控件观感。它不创建 DOM、不监听事件、不设置业务状态，也不依赖 AIO
构建类名。

## 7. 测试

扩展 `dsh-desktop/test/shell-skin-pack.test.ts`：

1. 默认包和 AIO 包四件套均存在。
2. 两个 Manifest 符合 shell-skin 契约，且 AIO ID、依赖和版本一致。
3. AIO 与默认包定义完全相同的 token 名集合。
4. AIO CSS 不定义 `--dsw-*`、`--aion-*`。
5. AIO `controls.css` 只消费已声明的 `--eac-shell-*` token。
6. AIO 目录不包含 JavaScript、HTML 或其他业务入口。
7. 当前 Rust 路由仍固定加载 `eac-default`，防止 #363 越界实现 Task 3.2。

最低充分验证为 V1：TypeScript build、定向测试和 `git diff --check`。

## 8. 完成标准

- AIO 四件套位于 `dsh-desktop/assets/shell-skin/aio/`。
- Manifest 同时声明 Skin、Control、Style 身份。
- Token 集与默认包契约兼容。
- 样式呈现 AIO 的深蓝玻璃视觉。
- 包中没有业务代码、bridge 或内核 token 覆盖。
- 不改变生产加载行为。
- 定向测试和差异检查通过。
