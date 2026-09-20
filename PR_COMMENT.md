## 目的 Purpose

为 Tauri 本体增加开发者 UI 控件检查层：在开发者功能开启时，按住 Ctrl 临时显示稳定的 `data-control-name`、槽位名，以及当前 registry 选择的 Control/Style 包来源；松开 Ctrl 或窗口失焦后立即清除。标注层使用独立 overlay，不改写业务控件文本、结构、样式或事件。

## 架构与范围 Architecture & Scope

- L1 Rust 壳：从 `assets/ui-skin/registry.json` 及选中的 Skin/Control/Style/Slot manifest 生成元数据，并注入 WebView 初始化脚本。
- L1 WebView bridge：维护 Ctrl 生命周期和独立标注 portal；监听 DOM 变化、滚动、缩放和窗口失焦。
- 兼容：Debug 构建默认开启；Release 仅在 `DSH_UI_DEVTOOLS=1` 时开启。
- 未修改 DSH 内核、插件业务逻辑或用户数据格式。

## 风险与兼容 Risks & Compatibility

- 标注只读稳定 DOM 属性；portal 使用 `pointer-events: none`，不会拦截业务交互。
- registry 或 manifest 无效时来源元数据为空/使用明确的包类型回退名，不加载任意路径。
- 自定义槽位若提供 `data-slot-provider` 或 `data-package`，会显示其提供包；缺少来源声明时显示 `<unknown>`，不会伪造归属。
- 关闭开发者功能不会留下可见标注；窗口失焦也会清空标注。

## 验证 Verification

- [x] `git diff --check` 已通过
- [x] 定向 Node 测试：`node --test test/shell-skin-pack.test.ts`，7/7 通过
- [x] Rust 壳静态检查：`cargo check --quiet` 通过（在最终小幅 bridge/Rust 元数据调整前执行）
- [ ] TypeScript build：未通过，当前 worktree 缺少 `@types/node`；`npm ci --ignore-scripts` 因依赖安全检查超时，不能在本机补装
- [ ] Rust 全量测试：`cargo test --quiet` 在本机超过 420 秒超时
- [ ] CI 验证：待 PR 后执行
- [ ] UI 截图/录屏：待 CI/可用桌面环境验证

## 配置与迁移 Configuration & Migration

无需迁移。新增环境变量 `DSH_UI_DEVTOOLS=1` 仅用于 Release 构建显式开启开发者标注层。

## 回退方式 Rollback

回退本次提交即可恢复原有 bridge 与 registry 注入行为；不涉及用户配置、会话或插件数据。
