# PR Comment：插件、皮肤包与槽位接入

## 结论

已基于当前 `origin/dev` 完成复核。实现保留官方 dsh 插件契约与 EAC 皮肤管理器宿主边界：EAC 负责 `HostProfile` 槽位、资源校验、路径包含关系和 WebView 适配；管理器负责皮肤包选择、依赖解析、生命周期与回滚。

## 改动

- `tauri-shell/src/main.rs` 校验六个槽位：`top-sidebar`、`bottom-sidebar`、`left-sidebar`、`right-sidebar`、`session`、`overlay`，并校验资源清单、槽位引用、canonical path，拒绝 symlink 越界和路径穿越。
- `tauri-shell/sidecar/bridge.ts` 按槽位维护 generation；首次热切换清理 bootstrap 样式；事务只替换请求槽位；stale / invalid generation 和未知槽位在 DOM 修改前拒绝，未知槽位返回 `UNSUPPORTED_SLOT`。
- 行为测试真实执行 transaction bridge IIFE，覆盖 bootstrap 清理、跨槽位隔离、per-slot stale gate、未知槽位拒绝及 DOM 不变。
- 当前生产路径不存在 `shell-skin` 包或 package-wide 壳体皮肤；该名称仅保留在历史 ADR/负向测试中，用于证明旧路径没有恢复。所有可替换 UI 均通过 `HostProfile` 的 slot contribution 接入。

## 验证

执行：

    cd dsh-desktop
    node --test test/minimal-core-boundary.test.ts test/bridge-preload-parity.test.ts test/plugin-conflict-scan.test.ts test/bundled-files.test.ts test/manifest-drift-gate.test.ts test/stage-7-canonical-source.test.ts test/ws-rpc-single-source.test.ts

结果：`47/47` 通过，`0` 失败。另已验证 Node syntax、相关 JSON、manager/default artifact SHA-256 与 lock 一致，以及 `git diff --check`。

## 限制

本机没有 Rust toolchain，未执行 `cargo fmt/check/test`；工作树缺少 `node_modules/@types/node`，完整 TypeScript typecheck/build 需由 CI 执行；staged runtime 的完整 WebView smoke test 也应在合并前由 CI 补充。请勿将这些未执行项目写成“构建已通过”。