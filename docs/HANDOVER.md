# DSH Desktop 交接文档（当前）

> 本文件是当前唯一累积交接入口。历史轮次施工图在 `docs/archive/`（含
> 2026-08-22 版壳层重构交接——Tauri 当时还是 PoC，正文已过时，仅作回溯）。
> 最新批次详情：`docs/HANDOVER-2026-08-29-5.3.3-batch1.md`（批次一）与
> 5.3.3 批次二交付说明（见文末）。
> CI 安装包矩阵（PR #406，Windows/Linux 四平台）进度与产物状态见
> `docs/HANDOVER-2026-09-23-ci-installer-matrix.md`。

## 项目一句话

DeepSeek Harness EAC 桌面版：Tauri（Rust）壳 + Node sidecar + 零改动内核
（ADR 0002 三层边界：L1 `tauri-shell/src/main.rs` / L2 `tauri-shell/sidecar/*.ts`
+ `dsh-desktop/lib` / L3 vendor 内核）。数据目录 `~/.dsh`，双 home 隔离见
`docs/adr/`。

## 关键事实（接手者必读）

1. **壳必须是 Tauri**：Electron 壳已于 5.1.2 后整体退场（commit 8fd36b90），
   发布只走 release-tauri.yml；再出现 Electron 链是回归。
2. **版本号必须变号**：profile 同步白名单按版本号判定，bump 缺失=升级用户
   拿不到配套插件同步。
3. **内核不可碰**：`vendor/kernel/`、`node_modules/@deepseek-ai/*` 只能经
   `scripts/patch-deps.js` 打锚点补丁（锚点唯一性有注释约束）。
4. **双副本微信桥**：`dsh-desktop/assets/plugins/dsh-openclaw-bridge/`（权威，
   随包分发）与 `openclaw-dsh-bridge/`（dev 源）必须逐字节同步，改完 `cmp`。
5. **tsc 就地产物**：`.ts` 是唯一事实源，`.js` 是同目录编译产物（gitignore）；
   改 `.ts` 后必须 `npm run build`（pretest 自动做）。
6. **push 需用户明确要求**：本地 commit 随时可做。

## 构建与验证

```powershell
cd dsh-desktop
npm test                    # 全量单测（pretest 含 tsc）
cd ../tauri-shell && cargo test
cd ../openclaw-dsh-bridge && node --test test/bridge.test.mjs   # 微信桥
# 打包三段链（stage → tauri build → portable）
node stage-resources.mjs && npx -y @tauri-apps/cli@2 build && node make-portable.mjs
```

冒烟脚本（仓库根）：boot-smoke / gui-smoke / update-smoke / verify-delete-session /
verify-phone-pair / ui-verify-smoke / rescue-smoke。

## 5.3.3 批次二（2026-08-30 前后）新增要点

- 批次一遗留虚报补落：patch-deps.js（l2 偏移换算 + replace 函数化 + 原子写）、
  build-native.js（CARGO_ENCODED_RUSTFLAGS）——批次一 commit message 声称
  已修但未落地。
  ⚠️ 勘误 2026-08-30：上述两项在 5.3.3 批次二时仍未落地（当时文档再次
  虚报）；已于 5.3.5 真实落地，见 CHANGELOG 5.3.5。验收流程教训：文档
  声称的修复必须对照 git 文件清单验证。
- 微信桥测试隔离修复：test/bridge.test.mjs 导入插件前置 DSH_HOME=临时目录
  （此前每轮测试污染真实 ~/.dsh/openclaw-bridge，session-map 残留使断言崩）。
- 批次 C 余项 7 项性能优化（注册表批量写 / companion-sync 单读 /
  plugin-updater 单读+失败不缓存 / dsh-web.log 启动截断 / 微信桥流式增量 /
  bridge observer rAF 节流 / childEnv+desktopProfile mtime 记忆化）。
- 批次 D 死功能接线：static-preview（独立端口预览服务 + chrome.init
  staticPort 真实值 + bundle-manifest 生成重建入 stage-resources）、
  shortcuts（maintain/warnTempRun/migrate + isPackaged 真实判定）、
  junction-patrol（真实 getServerProc/isRestartingServer + exec 异步化）、
  SessionWatcher（任务完成通知，经壳层系统通知通道）。
- 批次 F：test.skip 空壳×5、ping.ts、exit-overlay 监听泄漏、死导出、
  README 下载表改 5.x、本文件重写。
