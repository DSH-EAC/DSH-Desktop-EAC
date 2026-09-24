# t_22cab01e 修复后独立复核报告

任务：v6 Task 3.1 staged verifier 修复后回归
工作区：`/mnt/udisk/Code/fork/DSH-Desktop-EAC`
平台：Linux aarch64

## 结论

通过（APPROVED）。原 QA 缺陷 D1 已修复，并由行为级回归测试覆盖；本轮要求的 Node 门禁与 `git diff --check` 全部通过。

此结论只覆盖本次 staged verifier 缺陷修复与本地回归。Ubuntu x64 staged-runtime、真实 boot smoke 和远端 GitHub Actions 仍为 UNKNOWN/未验证，不计作通过证据。

## 验收标准与证据

1. 精确拒绝退役产物：通过。
   - `dsh-desktop/scripts/verify-staged-runtime.mjs:36` 的 `RETIRED_PATHS` 使用 `dsh-desktop/lib/plugin-copy.js`。
   - 工作区未再出现错误路径 `dsh-desktop/plugin-copy.js`。
2. 行为级回归测试：通过。
   - `dsh-desktop/test/ci-runtime-scripts.test.ts:36` 验证合法最简 fixture 可通过。
   - `dsh-desktop/test/ci-runtime-scripts.test.ts:59` 在同一合法 fixture 中写入 `dsh-desktop/lib/plugin-copy.js`，并断言 `verifyStagedRuntime()` 抛出 `retired artifact is staged`。
   - 全量测试真实输出包含上述两条测试均通过。
3. stage-resources 不装配该文件：通过。
   - `tauri-shell/stage-resources.mjs:68` 的 `LIB_VNEXT` 仅含 `atomic-json.js`。
   - `dsh-desktop/test/bundled-files.test.ts:75` 对该最小清单有独立断言。
4. 本地门禁：通过。
   - `cd dsh-desktop && npm run typecheck && npm run build && npm test`：exit 0。
   - 测试汇总：127 tests，127 passed，0 failed，0 skipped，0 todo。
   - `git diff --check`：exit 0，无输出。
5. 用户工作树保护：通过。
   - 复核前后均保留现有 modified/deleted/untracked 文件；本轮未清理、未 commit、未 push，未修改产品实现。

## 环境证据与未覆盖项

以下项目与代码回归结论分开记录：

- 主机架构：`uname -m` 返回 `aarch64`。
- `node dsh-desktop/scripts/verify-staged-runtime.mjs`：exit 1，当前 `tauri-shell/staged-resources` 缺少 `sidecar/server.js`。
- `node dsh-desktop/scripts/minimal-boot-smoke.mjs`：exit 1，当前 staged runtime incomplete。
- Ubuntu x64 完整 staged-runtime：UNKNOWN，当前 aarch64 主机且 staged tree 不完整，未执行真实 x64 装配验证。
- boot smoke：UNKNOWN，未在完整 Ubuntu x64 staged tree 上执行。
- 远端 GitHub Actions：UNKNOWN，当前修复存在于未提交工作树，本任务禁止 commit/push/dispatch，没有可归属本次工作树的远端运行。

## 复核范围

已读取原 QA 报告 `reports/verify/t_3f4b06d7-qa.md`、修复卡最终交接及实际工作树。复核仅验证缺陷修复和其回归门禁，不扩展实现范围。