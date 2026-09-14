# ADR 0006 — 最简本体范围界定（Task 3.1 解耦本体）

日期：2026-09-14
状态：Proposed（v6 Task 3.1，待看板主人确认）

## 背景

v6 的目标是本体、皮肤、插件三者边界清晰（ADR 0005 开篇即以本任务为锚点：
「Task 3.1 要让最简本体只保留对 dsh 的最简包装」）。

main 分支（v5.4.1）的现状是本体承载了几乎全部生态能力：

- L2 sidecar（`tauri-shell/sidecar/server.ts`，1544 行）挂载 15 个业务模块
  （companion-sync / market / plugin-ops / guard-box / junction-patrol /
  client-update / static-preview / boot-server 等），另以旁路 require 引入
  extension-host / supervisor / recovery-center / balance / updater /
  rescue-integration / phone-bridge / session-watcher；
- 顶层另有约 20 个治理类 TS 模块（plugin-guard、plugin-updater、
  plugin-manager-state、builtin-collision、patch-row-heal、
  profile-module-heal …）；
- `assets/plugins/`（49 个内置插件）、`assets/skins/`（11 款皮肤）、
  `.sync/`（插件账本）全部随本体分发。

看板任务 #369（Task 3.1）无正文与验收标准；本 ADR 先行给出范围界定，
作为该任务的实施依据。**本 ADR 只界定范围与接缝，不含代码改动。**

## 「最简包装」的定义

用户视角的唯一验收路径：**安装 → 起壳 → 进入 dsh Web UI 完成一轮对话**。
凡该路径不需要的能力，一律不属于最简本体。被剥离的能力不是删除，
而是移出默认装配、等待以「包」的形式被 Task 3.2/3.3/4/5/6 接回。

## 范围界定

### 保留集（最简本体）

| 层 | 保留内容 | 理由 |
|---|---|---|
| L1 Rust 壳 | 主窗/浮窗、托盘、单实例锁、退出策略；壳页 loading / exit / died / about；`/skin/<file>` 静态路由（ADR 0005 接缝） | 壳页是起壳必需；/skin 路由是皮肤包挂接点 |
| L2 sidecar | `server.ts` RPC 骨架；**boot-server**（spawn `dsh web`、端口探测、进程看护——唯一不可删的业务模块）；proc / platform / runtime-paths；**profile 基础初始化**（目录布局、`web-desktop` profile 建档，不含插件 seed）；logger / state；stable-port | 这些是「把 dsh 跑起来」的最小闭包 |
| L3 内核 | `@deepseek-ai/dsh` 官方包，零改动 | ADR 0002 永不触碰清单 |

### 剥离集（按去向分组）

| 去向 | 模块/资产 | 对应任务 |
|---|---|---|
| 皮肤包 | `assets/skins/`（11 款）、皮肤行写入逻辑（applyLegacySkinChoice 等） | Task 1.2 / 3.2 / 6.x |
| 插件系统 | companion-sync、plugin-ops、market、guard-box、junction-patrol、plugin-guard、plugin-updater、plugin-manager-state、builtin-collision、patch-row-heal、profile-module-heal、plugin-copy、plugin-sync-registry、extension-host、supervisor、recovery-center、`assets/plugins/`（49 个）、`.sync/`、`assets/sdk-plugins/` | Task 2.x / 3.3 / 4 / 5 |
| 更新体系 | updater、client-updater / client-update、plugin-updater | v6.1 Task 8/9/10 |
| 增值功能 | balance、rescue-agent、phone-bridge、preset-sync、static-preview、shortcuts / shortcut-maintenance、feature-pack、compact-preset-migrate、router-persona-preset-migrate | 后续版本按需 |
| 引导向导 | onboarding（38 插件多选 UI）、wizard 壳页 | 随插件系统（无插件可选则无向导） |

### 待确认项（判断题，请看板主人裁决）

1. **session-watcher**（回合结束系统通知）：算基础体验（保留）还是增值功能（剥离）？
2. **runtime-patches**（内核兼容补丁，如 `.credentials.yaml` 自愈）：剥离后旧内核
   场景 boot 可能退化。建议随 boot-server 保留，或明确最小支持内核版本。
3. **static-preview**：dsh Web UI 的「站内 HTML 预览」iframe 依赖它；剥离则该功能
   静默降级。是否接受？
4. **stream-write-guard / bundle-integrity**：写盘保护与 bundle 完整性校验属
   稳定性基建，倾向随本体保留，请确认。
5. **剥离的落地形态**：推荐「移出 `REQUIRED_*` 装配清单 + 代码迁至
   `contrib/`（或保留原位但不在装配面）+ 以 manifest 声明接缝」，由 3.2/3.3
   实现按 manifest 接回。是否同意，还是有既定的包目录方案？

## 决策（暂定，待确认后转 Accepted）

1. **最简本体 = 保留集闭包**。任何新增能力默认不进本体（ADR 0002 第 4 条
   「新功能放置规则」在 v6 的延伸：本体只加不减的原则自此生效）。
2. **剥离不是删除**：被剥模块保留代码与测试，等待接回；本任务的产出是
   「瘦身后的本体 + 每个被剥能力的接缝声明（manifest 或 ADR 引用）」。
3. **接缝风格沿用 ADR 0005**：包目录 + `skin.json` 式清单 + 降级契约
   （缺失时按 fallback 行为渲染/运行，不崩）。
4. **验收标准**（自拟，替代空 issue 正文）：
   - a) 最简本体从全新安装启动，进入 dsh Web UI 并完成一轮对话（沿用
     `boot-smoke.js` 路径验证）；
   - b) `stage-resources.mjs` 的装配清单不含剥离集条目；安装体积显著下降；
   - c) 保留集对应的既有测试全绿（剥离模块的测试随模块迁移，不删失）；
   - d) 每个被剥能力有接缝声明文档。

## 后果

- 正面：本体与生态解耦，3.2/3.3/6.x 有干净挂接面；安装体积与启动路径缩短
  （去插件化预演实测：剥到最简后系统可正常起壳）。
- 代价：一次性大改 `server.ts` 与装配链；期间 main 的插件相关测试需要随
  模块迁移；需要与 Task 1.1/1.2/2.1/2.2 的进行中分支做好合并顺序协调。
- 风险：被剥能力之间的隐性依赖（如 recovery-center ↔ supervisor ↔
  extension-host 三件套）需按组整体迁移，逐个剥离会产生编译断点。
