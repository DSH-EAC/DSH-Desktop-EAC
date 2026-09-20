# ADR 0007：AIO 壳层皮肤包

日期：2026-09-15
状态：Accepted（v6 Task 1.2）

## 背景

Issue #363 要把 AIO 的视觉部分拆解为皮肤包。Task 1.1 已在 ADR 0005 中
建立 `dsh-desktop/assets/shell-skin/eac-default/` 四件套及
`--eac-shell-*` 消费契约。另建 npm 包、DOM 挂载协议或生产加载器会形成
第二套尚无消费者的实现，并越过 Task 1.2 的范围。

## 决策

1. AIO 包放在 `dsh-desktop/assets/shell-skin/aio/`，与 `eac-default`
   并列，包含 `skin.json`、`tokens.css`、`controls.css` 和 `README.md`。
2. Skin、Control、Style 在 `skin.json` 中分别使用独立 ID 和版本依赖，
   但物理文件布局沿用 shell-skin 四件套，不拆成三个 npm 包。
3. `tokens.css` 完整实现默认包的 `--eac-shell-*` 名集合，只替换视觉值。
   AIO 包不定义或覆盖 `--dsw-*`、`--aion-*`。
4. `controls.css` 沿用 `.eac-shell` 和既有壳层控件 class，只消费 token，
   不包含 DOM、事件、bridge 或插件逻辑。
5. 视觉值从
   `origin/aio-v1@89757fa4b10d789e7bec028102569deefdceafc9`
   的启动页、恢复页、更新页和自绘标题栏中提取。只提取颜色、表面、边框、
   阴影、圆角、模糊和控件状态。
6. 本任务不修改 Rust 的固定 `eac-default` 路由。生产选择和 A/B 切换属于
   后续 Task 3.2。
7. 本包不新增图片、字体或第三方二进制资源，无新增资源再分发许可证风险。

## 后果

- AIO 成为第二个可独立检查的内置 shell-skin。
- 两个包使用同一 token 接口，后续加载器可以只切换资源目录。
- AIO 的业务功能仍归壳、本体或插件所有，不会被错误打包进皮肤。
- #363 可以验证复杂视觉是否能由 Task 1.1 的最小契约表达，同时保持范围
  聚焦。

## 验证

`dsh-desktop/test/shell-skin-pack.test.ts` 校验：

- 两个包的结构和 Manifest。
- token 名集合完全一致。
- AIO CSS 的命名空间和消费关系。
- AIO 包无业务入口。
- 当前生产路由仍固定使用 `eac-default`。
