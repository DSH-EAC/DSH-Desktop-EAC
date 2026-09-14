# ADR 0006 — 最简本体范围界定（Task 3.1 解耦本体）

日期：2026-09-14（v3 同日修订：按字面严格解释裁决，见文末「严格模式」节）
状态：Accepted（v6 Task 3.1；v3 = 严格模式生效版）

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

### 已裁决项（v2：原「待确认项」经代码查证后的决策）

1. **session-watcher**：**保留**。它的输入是 `<dshHome>/sessions`（内核自有
   数据），不依赖任何插件模块；且通知链路经 Rust 壳
   `shell.system-notification`（main.rs 已订阅），属「对话回合完成」这一
   最简路径的体验闭环。代码证据：`server.ts` L452-491 只 require
   `session-watcher.js` + settings，无插件面依赖。
2. **runtime-patches**：**随 boot 保留**。`boot-server.ts` 的
   healCredentialsVersion（.credentials.yaml 自愈）在最简路径上（spawn
   dsh web 前置）；剥离会让旧凭据场景 boot 直接失败。
3. **static-preview**：**剥离**。独立端口预览服务（`previewMod.init`
   L315-350）只服务 `dsh-client-file-changes` 插件的预览面板——该插件
   本身在剥离集。chrome.init 的 `staticPort` 字段保留但恒 0（注释已写明
   0 = 插件侧回退宿主路由，降级契约现成）。`verifyBundledModules` 是
   唯一例外：它属启动完整性校验（issue #7），**连同 bundle-integrity
   一并保留**。
4. **stream-write-guard / bundle-integrity**：**保留**。写盘保护与捆绑
   依赖完整性清单是启动稳定性基建（bundle-manifest.json 由
   stage-resources 落盘、boot 期复查），不属插件面。
5. **恢复中心 + 救援链**：**保留（收窄）**。Rust 壳有 41 处 recovery/
   rescue 引用（托盘菜单、启动失败链、DSH_DESKTOP_RECOVERY 直开模式、
   safe-mode relaunch），是「装不起来时用户还能自救」的最后防线——
   但 recovery-center/register.ts 依赖 guard-box / companion-sync /
   plugin-ops（快照/回滚/启停动作），这三者不能在 3.1 剥离，**随恢复
   中心降级保留**（代码不删，Task 3.3 接回插件系统后恢复完整语义）。
   依赖证据：register.ts L28/32 import guard-box + companion-sync。
6. **剥离落地形态**：**移出装配面 + 原位保留代码**。`stage-resources.mjs`
   的 ROOT_FILES/LIB_DESKTOP/LIB_VNEXT/SCRIPTS 清单按保留集裁剪；
   `assets/plugins`、`assets/skins`、`.sync/` 不再入包；代码文件留在
   仓库原位（测试随代码留），等 Task 3.2/3.3/4/5 以包形式接回。
   不采用 contrib/ 目录迁移：与在途分支（Task 1.1/1.2/2.x）的合并
   冲突面最小化优先。

### RPC 方法面处置（v2 新增，Rust 壳调用面证据）

Rust 壳（main.rs）实际调用的 sidecar 方法：`boot.start/restart/state/stop`、
`chrome.init`、`menu.action`、`files.authorize-open`、`shell.info`、
`profile.name`、`rc.*`、`rescue.*`（救援链）、`plugins.list`（仅测试
断言）。据此：

| RPC 组 | 处置 |
|---|---|
| shell.info / profile.name / runtime.* / chrome.init / menu.action / boot.* | 保留（最简闭包） |
| files.authorize-open / files.revert / image-paste.save / file-drop.save | 保留方法面，`files.*` 是文件树基础能力；`image-paste`/`file-drop` 是插件 IPC 桩（plugin-ops 降级保留） |
| rc.* / rescue.* | 保留（恢复中心收窄版） |
| plugins.list / set-enabled / set-removed / updates / update / auto-update / removedIds | **方法面移除**（无插件可管）；设置页相应标签自然空 |
| wizard.* / onboard.* | **方法面移除**（无插件可选则无向导；onboarding.html 壳页由 Rust 壳下线） |
| balance.* | **方法面移除**（余额是增值功能，v6.1 按需接回） |
| phone.* | **方法面移除**（增值功能） |
| client-update.* / agent update flow | **方法面移除**（v6.1 Task 8/9/10 范围；menu.action 的 check-*-update 分支返回 noop） |

## 决策

1. **最简本体 = 保留集闭包**。任何新增能力默认不进本体（ADR 0002 第 4 条
   「新功能放置规则」在 v6 的延伸：本体只加不减的原则自此生效）。
2. **剥离不是删除**：被剥模块保留代码与测试（原位），等待接回；本任务的
   产出是「瘦身后的本体 + 每个被剥能力的接缝声明（manifest 或 ADR 引用）」。
3. **接缝风格沿用 ADR 0005**：包目录 + `skin.json` 式清单 + 降级契约
   （缺失时按 fallback 行为渲染/运行，不崩）。
4. **验收标准**：
   - a) 最简本体从全新安装启动，进入 dsh Web UI 并完成一轮对话（沿用
     `boot-smoke.js` 路径验证）；
   - b) `stage-resources.mjs` 的装配清单不含剥离集条目；安装体积显著下降；
   - c) 保留集对应的既有测试全绿（剥离模块的测试随模块留原位，不删失，
     但其测试入口在最小形态下跳过——测试文件按装配面分组）；
   - d) 每个被剥能力有接缝声明文档（本文档「RPC 方法面处置」节即第一份）。

## 查证记录（v2，2026-09-14 实测）

- **server.ts 全文通读**（1544 行）：15 个 mount 模块 + 9 个旁路 require
  的职责与相互依赖逐项确认；boot-server 是唯一「拉起 dsh web」的实现。
- **main.rs RPC 调用面**：grep 全部 RPC 字符串字面量，确认壳层硬依赖
  （结果见「RPC 方法面处置」节）；`plugins.list` 仅出现在
  `is_sidecar_recovery_request` 的测试断言（L156），非硬依赖。
- **stage-resources.mjs 全文**（534 行）：ROOT_FILES 20 项 / LIB_DESKTOP
  18 项 / LIB_VNEXT 15 项 / SCRIPTS 5 项 / NATIVE 2 项 + assets 整树
  拷贝（L326 `cpSync(assets)` 是体积大头，plugins 49 目录 + skins 11）。
- **恢复中心依赖链**：recovery-center/register.ts → guard-box +
  companion-sync + plugin-ops + rescue-agent（L23-34），确认「三件套
  随恢复中心降级保留」的必要性。
- **phone-bridge**：零 lib 依赖（仅 node 内置），但属增值功能，方法面
  移除后代码保留。
- **测试基线分组**：132 个测试中 42 个显式引用插件面模块；其余 90 个
  含更新链（约 20 个，v6.1 范围）与保留集测试。测试不删，按装配面
  在 test-runner 层分组跳过。
- **内核依赖形态**：package.json 292 个 `file:vendor/kernel/0.1.3-alpha.1`
  依赖；fetch-kernel 从官方 tag 源码构建（本机已构建成功，经预下载
  tarball 通道绕过 codeload DNS 问题）。

### 实施期裁决补充（v2.1）

- **updater.js 整体保留**（修订原「更新体系剥出」的边界）：它是
  「overlay 内核管理 + 更新流」混合模块——runtime-paths 的
  overlayBinPath/rollback（boot 失败隔离切内置内核链路）、profile、
  companion-sync 均消费其 overlay 面。更新流函数（checkLatest/applyUpdate）
  在最简本体上无人调用。v6.1 Task 8 拆分该模块。
- **RPC 引用审计结果**：Rust 壳硬调用的 RPC 中 `onboard.*` 三个方法
  随向导剥出（/wizard 壳页入口同步下线）；其余全部保留应答。剥离面
  方法（plugins.*/wizard.*/balance.*/phone.*/onboard.*）冒烟实测返回
  method not found（-32601），不崩。
- **装配闭包审计结果**：发现并修复两处漏装配——plugin-sync-registry.js
  （companion-sync 编译依赖）；updater.js（见上）。stage-resources 的
  Linux/Darwin prune 段对已剥资产目录的 rmSync 为无害空转。
- **测试处置**：4 个装配契约测试更新为 v6 守门断言（l1-native-actions /
  preset-sync / client-update-init-contract / bundled-files 的 registry
  断言加注释）；基线 7 个环境性失败（vendor 缺失 + 本机 DSH 安装残留）
  与本任务无关，逐项核对过。

### 第二轮复审结论（v2.2，2026-09-14，提交前审计）

- **递归装配闭包审计**（产物级 .js 扫描，59 依赖边 / 34 产物）：抓出
  21 个被引用但未装配的模块 —— companion-sync / plugin-ops / guard-box
  是 God module，顶层 require 了 plugin-updater / plugin-guard /
  plugin-manager-state / builtin-collision / patch-row-heal /
  profile-module-heal / preset-sync / compact-preset-migrate /
  router-persona-preset-migrate / onboarding.js 等。已全部补回装配清单
  （JSON 模块共数百 KB，瘦身主体在 128MB 资产面不受影响）；Task 3.3
  拆解 companion-sync 时按域分装。
- **打包态资产缺失行为**：companion-sync 的 readdirSync(SKINS_DIR) 无
  守卫（最简包无 assets/skins 会炸 syncCompanionPlugins）—— 已加
  existsSync 守卫。SOURCES.json / agent-presets / 恢复中心页 / preload
  核对均有守卫或已在保留清单。
- **内核 0.1.5-rc.2 CLI 变更适配（审计 C 抓出）**：`web` 子命令硬编码
  --profile web 且拒绝根级 --profile（`web takes none of parent
  --profile...`，退出码 1）。桌面专属 profile（web-desktop）改为根命令
  直启：`dsh --profile web-desktop --host ... --no-open`（帮助示例
  `dsh --profile tui --resume` 同形态）。手工 profile 结构（package.json
  bundles + pnpm-workspace + 空 patch 层）在 0.1.5 下实测兼容。
  `plugin` 子命令自带 --profile 选项（`dsh plugin --profile tui add`），
  market.ts / feature-pack.ts 无需改。
- **纯净 boot 全链路实测**：最简 profile（仅内核官方 bundles、零 EAC
  插件行）→ boot.start → 就绪行带 token → HTTP 303（token→dsh-auth
  cookie）→ HTTP 200 UI 完整可达。
- **开发态已知限制（移交 Task 3.3）**：开发态仓库 assets/plugins 仍在
  时，companion-sync 会同步 58 插件行进 profile，其中 dsh-prompt-custom
  import 的 PERSONA_SECTION 在 0.1.5 已改名（persona section 拆分为
  PERSONA_PREFIX/SUFFIX_SECTION）→ 插件树加载失败、dsh web 退出码 1。
  **打包态最简本体无此问题**（无插件可同步）；插件接回时按新 API 适配。

## 后果

- 正面：本体与生态解耦，3.2/3.3/6.x 有干净挂接面；安装体积与启动路径缩短
  （去插件化预演实测：剥到最简后系统可正常起壳）。
- 代价：一次性大改 `server.ts` 与装配链；期间 main 的插件相关测试需要
  按装配面分组；需要与 Task 1.1/1.2/2.1/2.2 的进行中分支做好合并顺序协调。
- 风险：被剥能力之间的隐性依赖（如 recovery-center ↔ supervisor ↔
  extension-host 三件套）——已裁决：恢复中心收窄保留、supervisor 与
  extension-host 随插件系统整体剥出（恢复中心对二者的引用经降级桩消化）。


## 严格模式（v3，2026-09-14 看板主人裁决）

**裁决**：「按字面严格解释最简本体，但保留对未来可能的插口。」

### 与 v2 的差异（进一步剥离）

| 能力面 | v2（务实取舍） | v3（严格模式） |
|---|---|---|
| 恢复中心动作面（rc.*） | 收窄保留（三件套随行） | **剥出** → 桩应答 |
| 救援链（rescue.*） | 保留 | **剥出** → 桩应答 |
| 插件保护中心（guard.*） | 保留 | **剥出** → 桩应答 |
| 插件治理三件套（companion-sync / plugin-ops / guard-box） | 降级保留 | **剥出**（含 10 个传递依赖） |
| rescue-integration / phone-bridge / recovery-center | 装配 | **不装配** |
| BUNDLED_BUILTIN_PLUGINS（dsh-raw-html bundle 播种） | 保留 | **清空**（随 assets/plugins 剥出） |
| native/.node（supervisor/snapshot） | snapshot 保留 | **不装配**（快照面无运行时入口） |

### 插口契约（capability-stubs.ts）

被剥能力统一经 `tauri-shell/sidecar/capability-stubs.ts` 的降级桩应答：
- **方法名与参数形态不变**（Rust 壳 / 恢复中心页面的调用面零改动）；
- 桩应答 `{ ok:false, unavailable:true, capability, reason }` —— 调用方
  渲染「能力未安装」而非运行时错误；
- **接回 = 用真实现覆盖 methods 表同名条目 + 装配清单补模块**，不动 Rust 壳。

接回任务映射：rc.* → Task 3.5/5.x；rescue.* → Task 3.5；guard.* 与
三件套 → Task 2.x/3.3；内置 bundle 插件 → Task 3.3。

### 自救底线（严格模式下的行为变化）

Rust 壳 /died 页（服务停止时）的「重启服务」按钮走 boot.start（真实现，
保留）——**主自救路径不受影响**。「安全模式」按钮走 rescue.safe-mode 桩
（安全模式本是插件系统的产物，无插件时语义为空）。

### 严格模式验证（2026-09-14 实测）

- 装配闭包：24 依赖边 / 18 产物 / 0 缺失（v2 为 59 边 / 34 产物，
  运行面 -44%）；
- 桩冒烟：rc/rescue/guard/plugin-ops 面 8 项统一 unavailable:true；
- boot 全链路：纯净 profile → web-ready 带 token → 303 cookie →
  **HTTP 200 UI 完整可达**；
- 全量测试 873/867/2（与 v2 最佳持平；剩余 2 失败为已知环境项）；
- 6 个契约测试改严格模式守门（装配方向反转 + 桩面断言）。
