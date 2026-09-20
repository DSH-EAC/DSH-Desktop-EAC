# t_3f4b06d7 独立 QA 报告

日期：2026-09-18
任务：v6 Task 3.1 独立 QA：边界、测试、构建与 CI
工作区：/mnt/udisk/Code/fork/DSH-Desktop-EAC
平台：Linux aarch64

## 结论

未通过（NOT APPROVED）。Node/Rust 本地门禁通过，但发现 staged-runtime verifier 的退役路径断言错误，且本机没有可验证的完整 staged tree，因此不能认领完整验收通过。

## 已通过的独立证据

- `cd dsh-desktop && npm run typecheck`：exit 0。
- `cd dsh-desktop && npm run build`：exit 0。
- `cd dsh-desktop && npm test`：126 tests，126 passed，0 failed，0 skipped。
- `cd tauri-shell && cargo fmt -- --check`：exit 0。
- `cd tauri-shell && cargo test --locked`：8 passed，0 failed，0 ignored。
- `cd tauri-shell && cargo check --locked`：exit 0，1 crate compiled。
- `git diff --check`：exit 0。
- 源码审计：退役 recovery/rescue/guard/float/update/about/renderer-heartbeat 字面量在生产实现中未发现；命中项仅为负向测试、stage 约束注释或历史文档。
- 全量测试覆盖空测试集必失败、退役 RPC 必须返回 JSON-RPC `-32601`、token `303 -> 200`、sidecar 平台身份与 shell-skin 消费者一致性。

## 阻断与缺陷

### D1：staged retired-path verifier 漏检 `lib/plugin-copy.js`

位置：`dsh-desktop/scripts/verify-staged-runtime.mjs:36`。

现状：`RETIRED_PATHS` 写为 `dsh-desktop/plugin-copy.js`；实际生产模块路径是 `dsh-desktop/lib/plugin-copy.js`，该模块在当前工作树中已删除，stage 清单也应排除其编译产物。

影响：若 staged 树含 `dsh-desktop/lib/plugin-copy.js`，`verifyStagedRuntime()` 不会报 `retired artifact is staged`，违反最简装配闭包验收。应将 retired path 改为 `dsh-desktop/lib/plugin-copy.js`，并增加针对该精确路径的失败测试。

复现依据：

1. 查看 `dsh-desktop/scripts/verify-staged-runtime.mjs:26-38`，确认错误路径。
2. 查看 `dsh-desktop/lib/plugin-copy.ts` 的删除状态及 `tauri-shell/stage-resources.mjs:60-70` 的最小装配清单。
3. 在合法 staged fixture 的 `dsh-desktop/lib/plugin-copy.js` 创建文件；当前 verifier 的 `RETIRED_PATHS` 不会检查该路径并放行到后续校验。

期望：fixture 含 `dsh-desktop/lib/plugin-copy.js` 时，verifier 明确以 retired artifact 错误退出；合法 fixture 仍通过。

### D2：本机无法完成 staged-runtime 与真实 boot smoke

- `node dsh-desktop/scripts/verify-staged-runtime.mjs`：exit 1，`required staged file is missing: sidecar/server.js`。
- `node dsh-desktop/scripts/minimal-boot-smoke.mjs`：exit 1，`staged runtime is incomplete: .../tauri-shell/staged-resources`。
- 当前主机为 `aarch64`，`dsh-desktop/vendor/node/node` 不存在；stage 策略包含 Linux x64 native payload，不能用当前不完整或架构不符的目录替代真实验证。

## CI 状态

`.github/workflows/ci.yml` 的 YAML/结构未能在本轮通过本地 parser 命令复现（单查询安全策略阻止脚本执行），但文件人工检查确认包含 `source-and-unit`、Ubuntu/Windows `rust-shell` matrix 与依赖 `source-and-unit` 的 `staged-runtime`。`gh run list` 当前仅显示历史 CodeQL/CI 运行，没有本工作树新增 workflow 的可归属成功运行；本任务禁止 push/dispatch，因此远端 CI 状态仍 UNKNOWN，不能写成通过。

## 未覆盖项

- Ubuntu x64 staged runtime 构建与 `minimal-boot-smoke`：当前平台/缓存不满足，需远端 CI 真实执行。
- Windows Rust matrix：仅 workflow 定义，未在本地替代验证。
- tray/UI 图形交互：本轮仅验证 Rust 路由/sidecar 与脚本契约，未启动 GUI。
