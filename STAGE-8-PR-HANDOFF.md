# Stage 8 PR Handoff — release, canary, and rollback runbook

## 目的 Purpose

本交接物只完成阶段 8 的独立发布前验收、发布 runbook、灰度边界、回滚 runbook 与支持诊断说明。它不宣称任何 GitHub Release、tag、asset 上传、正式发布或回滚已经执行。

灰度范围严格限定为：用户手动导入 artifact、按具体 slot 选择、显式应用/切换。自动下载、文件 watcher、后台自动更新、自动切换和 AIO 均不在本阶段范围。

## 架构与范围 Architecture & Scope

三仓职责和严格发布顺序：

1. `dsh-ui-skin-manager` 先发布 schema/conformance/runtime release。
2. `dsh-desktop-eac-default-skins` 使用已发布 manager 重新验证，并发布 `system.default` artifact。
3. `DSH-Desktop-EAC` 更新 manager/default lock，完成三平台 CI、安装包、升级/降级与 WebView 验收。
4. 只有三仓证据逐项回读并获得主人逐项批准后，才允许 tag、GitHub Release、asset 上传、正式发布或撤回。

禁止：运行时读取 mutable `main`、GitHub raw 或 branch；三仓发布互相未锁定的版本；先删除 EAC fallback/source 再等待外部 artifact；把 generic Feature Pack 当 Skin 输入；把历史 CI 结果当作当前候选 CI。

当前候选分支与提交（本次复核确认）：

| 仓库 | 本地阶段分支 | 本地 HEAD | 远端当前事实 |
|---|---|---|---|
| `dsh-ui-skin-manager` | `stage-8-release-runbook`（基于已合并 `feat/stage-6-atomic-skin-switch`） | `7bcf5bfb6b83bcf9c8ac2f0fb8f9e95de96d7373` | 已 push；远端 SHA 一致；CI run `35704298604` SUCCESS；无 stage-8 tag/release |
| `dsh-desktop-eac-default-skins` | `stage-8-release-runbook`（基于已合并 `feat/stage-7-canonical-default-source`） | `bda0b948ee21f10651d5d390ab2c3a41d1632ef9` | 已 push；远端 SHA 一致；CI run `35704307695` SUCCESS；无 stage-8 tag/release |
| `DSH-Desktop-EAC` | `stage-8-release-runbook`（产品基线 `80c777a…` 加本 runbook 文档提交） | 产品基线 `80c777aa8a097e1ecb88d550533ed15531d13f28` | 已 push runbook branch；docs-only push 未触发 Actions；无 stage-8 tag/release |

复核时 manager 与 default-skins 工作树干净；EAC 共享工作树当前在 `fix/stage-7-ci-typescript-narrowing`，本地存在未提交用户变更，故没有切换、清理或声称其工作树干净。EAC 阶段 8 本地可读分支已在不切换工作树的前提下对齐至远端已合并且 CI 验证过的 `80c777a…`。本 handoff 不写入三个产品仓库；正式 tag 命名和 release 版本号必须在主人批准后按实际发布策略冻结，不在本地猜测。

## 固定 artifact、lock 与 provenance

当前 EAC lock：`DSH-Desktop-EAC/tauri-shell/skin-manager-artifact.lock.json`。

| 输入 | source commit | CI 证据 | 文件 | SHA-256 |
|---|---|---|---|---|
| manager | `a023b018c3751f731370917d74a40bed79e28342` | run `35560125000`, completed/success | `dsh-eac-ui-skin-manager-0.1.0-preview.1.tgz` | `13a4c5dbd1a31c9512f535a9c14f5072f933f284634f6763e569e65614a63378` |
| default artifact in EAC | `1ebb02a77d2f67161183ec8db8d532bc99bba95b` | run `35552771052`, completed/success | `system.default-2.0.0.dshpack.tar` | `eb8142e44bd9ae281c518e08c5e792506c9fd35b2bfde3119db0aaadff21aa7e` |

本地实测：两个 EAC `tauri-shell/artifacts/*` 主 artifact 的 SHA-256 与 lock 一致；default-skins `dist/system.default-2.0.0.dshpack.tar` 与 provenance 一致。JSON lock、HostProfile、provenance 均可解析。

重要限制：`STAGE-7-default-provenance.json` 当前仍含 `sourceCommit: local-working-tree`，它不是正式发布 provenance；default-skins `dist/provenance.json` 才记录 canonical source commit `1ebb02a…`。正式 release 前必须由 workflow 在实际 release commit 上重新生成 provenance/checksums/release notes，并回读 asset digest 与 attestation。

## 兼容矩阵 Compatibility Matrix

| 轴 | 当前锁定/要求 | 验收状态 |
|---|---|---|
| manager package | `@dsh-eac/ui-skin-manager@0.1.0-preview.1`，Node `>=22.6` | PASS：lock 与 artifact 可读；正式 release CI NOT RUN |
| Skin identity | `system.default@2.0.0` | PASS：lock、HostProfile、artifact 一致 |
| host profile | `dsh-desktop-eac-ui-skin-profile@^0.3`，HostProfile `0.3.0` | PASS：JSON 可解析；运行时/安装包验收 NOT RUN |
| dsh `0.1.5-rc.2` | `eac-dsh-adapter@1` | NOT RUN：类型/fixture/WebView CI 未执行 |
| dsh `0.1.6-alpha.2` | `eac-dsh-adapter@1` | NOT RUN：类型/fixture/WebView CI 未执行 |
| archive integrity | lock SHA-256；manifest/file inventory；不得自嵌 whole-archive digest | PASS：本地 lock/artifact digest；完整 CI 复核 NOT RUN |
| source provenance | canonical default source only；不得依赖 mutable branch/raw | PASS：staging source grep 无 mutable URL；正式 attestation NOT RUN |
| downgrade/rollback | previous-known-good 2 代 → embedded `system.default` → host fallback | NOT RUN：未执行安装包升级/降级、故障注入或重启恢复 |

旧 manager 不得加载未知的新 schema：在 release candidate 验收中必须用旧 manager fixture 对新 manifest/schema 做拒绝测试；当前本地未运行该矩阵，故记为 NOT RUN，不得以 lock 存在代替。

## Release runbook（只在逐项批准后执行）

### Gate A — 发布前冻结与回读

1. 确认三仓工作树干净，确认候选 commit/tag 与 PR head 精确一致。
2. 在 manager 仓库运行格式检查、Node 22/24 CI、schema/conformance/runtime tests；回读 workflow head SHA、所有 job、artifact 名称与 digest。
3. 在 default-skins 仓库运行 validate、test、format、pack、checksums、provenance、release-notes；两次独立 pack 字节一致；核对 LICENSE、THIRD-PARTY-NOTICES、真实 NOTICE 义务。
4. 在 EAC 仓库运行 Node/Rust CI、staged integrity、三平台安装包、升级/降级、offline startup、previous-known-good、WebView smoke；不得在本机执行编译，使用 CI 构建机。
5. 生成最终 release manifest，明确三仓 commit、manager/default 版本、artifact 文件名、SHA-256、schema/profile 版本、CI URL、provenance/attestation URL。
6. 将 manifest、兼容矩阵、release notes、安装/回滚步骤交给主人逐项审批。未批准不得 push、merge、tag、上传 asset、创建 Release 或发布。

### Gate B — 严格发布顺序

1. push manager candidate branch；读取远端 commit 与 CI；主人批准后创建 manager tag/Release 并上传 immutable asset。
2. 逐项读取 manager Release、tag commit、asset digest、provenance、attestation；失败则停止，不进入下一仓。
3. 用 manager 正式版本重新验证 default-skins；push candidate branch；主人批准后创建 default-skins tag/Release 并上传 `system.default` artifact、`SHA256SUMS`、provenance、release notes。
4. 逐项读取 default-skins Release、tag commit、asset digest、provenance、attestation；失败则停止，不更新 EAC lock。
5. 更新 EAC lock 到正式 manager/default asset 与 digest；CI 重新验证 lock、offline stage、三平台包和回归矩阵。
6. 主人批准后发布 EAC tag/Release；逐项读取 EAC tag、安装包 assets、digest、provenance、attestation 与 EAC lock。
7. 灰度只开放手动导入和逐槽切换；记录每个 slot 的 candidate digest、generation、health、rollback outcome。禁止隐式下载或 watcher。

### Gate C — 可重复性与停止条件

发布脚本必须在相同 source commit、lock 和工具链输入下产生相同 artifact digest。任一 digest、source commit、schema、CI head、provenance、attestation 或 EAC lock 不一致，立即停止并回到 Gate A；不得手工修改 checksum 或用 source archive digest 替代 Skin artifact digest。

## Rollback runbook

### 触发条件

出现 schema 误载、artifact digest 不匹配、安装包无法启动、升级/降级失败、某 slot 故障扩散、WebView smoke 回归、跨 context generation 不一致、持久化半提交、provenance/attestation 缺失或 asset 被撤回时，停止灰度并按以下顺序恢复。

### 用户/运行时回退顺序

1. 切换前验证失败：保持原 active binding，不提交 candidate。
2. commit/health 失败：撤销 staged contribution，恢复上一 generation；旧 contribution 在确认新 generation 未提交前不得 dispose。
3. 单 slot 运行期失败：隔离该 slot，显示可操作 error UI；健康的 `system.default` 可用时只回退该 slot。
4. generation 级失败：恢复最近的 previous-known-good；保留故障诊断和 correlation ID。
5. previous-known-good 不可用：使用安装包内置且 digest 校验通过的 `system.default@2.0.0`。
6. manager/default 同时不可用：使用宿主 embedded fallback；允许打开诊断、复制摘要、重试或恢复默认。
7. 进程重启发现 `pending_generation`：丢弃 pending，恢复 committed binding；不得把 pending 当 active。

### 发布级回退

1. 立即停止手动导入和灰度切换，保留现有安装包与日志证据。
2. 不删除或覆盖当前 active/previous-known-good artifact；撤回有问题 release 的下载入口，记录 release/tag/asset/digest。
3. EAC 回到上一份已验证 lock/安装包；若 lock 变更本身未发布，不执行任何远端修改，直接使用本地上一候选。
4. 回读回退后的 GitHub Release/tag/assets/digest/provenance/attestation 和 EAC lock；不能只依据 CLI 成功返回。
5. 运行最小 smoke：启动、default fallback、slot binding、窗口控制、诊断复制、重启恢复。
6. 生成 incident 记录：触发点、三仓 commit/tag、artifact digest、generation、slot、error code、correlation ID、回退目标、验证结果。

任何正式撤回、删除 asset、移动 tag、关闭 Release 或 force-push 都是外部不可逆动作，必须另行获得主人明确批准；本阶段未执行。

## 支持诊断说明

用户可提供：当前 app 版本、manager/default 版本、active/previous-known-good 状态、slot/region、generation、artifact digest、source label、compatibility profile、错误码和 correlation ID。诊断摘要不得包含完整本地路径、用户名、会话内容、凭据、token 或任意 Skin payload。

支持人员先检查：

1. lock 与 staged artifact 的 SHA-256 是否一致。
2. HostProfile version、slot ID、kind/scope、capability 与 dsh range 是否匹配。
3. 是否存在 pending generation、quarantine 记录或旧 generation callback。
4. error code 是否属于 MANIFEST、COMPATIBILITY、INTEGRITY、PATH、CAPABILITY、PREPARE、ACTIVATE、HEALTH、TIMEOUT、RUNTIME、PERSISTENCE 或 RECOVERY。
5. 失败是否只影响一个 slot；若影响无关 slot 或宿主进程，立即停止灰度并升级为发布事故。
6. previous-known-good、内置 default、host fallback 的可用性和 digest。

固定诊断动作：查看日志、复制脱敏摘要、重试 candidate、禁用问题包、恢复 default、确认来源与版本。不得要求用户通过 raw/main 下载文件，也不得以清空全部配置掩盖损坏 state；损坏 state 必须保留证据并走恢复链。

## 验收 Verification

已实际执行：

- manager `npm run format:check`: PASS。
- default-skins `node scripts/check-format.mjs`: PASS。
- EAC `/usr/bin/cargo-fmt --manifest-path tauri-shell/Cargo.toml -- --check`: PASS。
- 三仓 `git diff --check`: PASS。
- EAC `node --check tauri-shell/stage-resources.mjs` 与 `stage-platform-prune.mjs`: PASS。
- lock、HostProfile、provenance JSON parse: PASS。
- EAC manager/default artifact SHA-256 与 lock: PASS。
- manager 阶段 6 PR #9：MERGED，head `7bcf5bfb6b83bcf9c8ac2f0fb8f9e95de96d7373`；Node 22/24 conformance 与 package artifact checks PASS。
- default-skins 阶段 7 PR #2：MERGED，head `bda0b948ee21f10651d5d390ab2c3a41d1632ef9`；Node 22/24 validate checks PASS。
- EAC 阶段 7 PR #404：MERGED，远端 head `80c777aa8a097e1ecb88d550533ed15531d13f28`；CI run `35674767263` 的 Node source/unit、Rust shell、staged runtime/isolated boot smoke 共 12 个 job PASS，覆盖 Linux/Windows x64 与 arm64。
- EAC CodeQL：JavaScript/TypeScript、Rust PASS；Python job FAILURE（仓库无 Python 产品源码的已知仓库级误报），整体 CodeQL 为 NEUTRAL，不能记为全绿门禁。
- staging 脚本 mutable `main/raw/branch` 依赖 grep: PASS（未发现）。

明确未执行：

- 本机 compile/build/test/typecheck/WebView smoke：NOT RUN，遵循避免 freeze 的操作限制。
- 当前阶段 8 三仓候选 branch 已 push 并回读远端 SHA；manager/default-skins 新 branch CI 成功，但三仓均没有阶段 8 tag/Release/asset。
- EAC 共享工作树存在未提交用户变更，未切换或清理；阶段 8 branch 指针已独立对齐到 `80c777a…`。
- EAC macOS 构建/安装包、完整三平台安装包回读、升级/降级、offline install/restart、WebView smoke：NOT RUN；现有 CI 只证明 Linux/Windows x64/arm64 的 12 个 job。
- 当前候选旧 manager 对新 schema 的拒绝矩阵、正式 provenance/attestation：NOT RUN。
- GitHub tag、Release、asset upload、attestation、正式灰度、撤回/回滚演练：NOT RUN。

## §11 总体验收标准逐条结论

1. 三仓职责明确，default-skins 为唯一官方默认源码源：PASS。证据：阶段 7 handoff、EAC `0010-canonical-default-skin-source.md`、staging 仅复制 pinned artifact。
2. manager 校验 manifest/version/profile/dependencies/assets/digest：PASS（静态合同与已有阶段测试/CI 证据）；当前阶段完整 CI 未运行，发布级结论仍受 Gate A 约束。
3. 无壳体皮肤包，所有可替换视觉元素有槽位，可按槽组合：PASS（HostProfile 六 region、instance kinds、manager contract）；真实 WebView 归属 smoke NOT RUN。
4. 通过槽位/公开 host API 接入，不引用私有路径或随机 CSS class：PASS（HostProfile/lock/staging 静态检查）；运行时 CI NOT RUN。
5. 单组件/单槽失败有可见可操作错误 UI，宿主与其他组件不崩溃：PASS（manager runtime handoff/test evidence）；当前阶段 EAC WebView 证据 NOT RUN。
6. 日志可关联、脱敏，支持重试/禁用/default/来源定位：PASS（ADR、diagnostic contract、runbook）；生产 UI 端到端 NOT RUN。
7. 单槽 A→B 无半提交，失败恢复 A，无关槽不变，重启恢复 committed：PASS（stage 6 manager test evidence）；当前 commit CI、EAC persistence/WebView NOT RUN。
8. system.default 离线可用，manager/default 同损仍有 host fallback：PASS（EAC lock、embedded fallback switch、stage-resources static evidence）；offline install/restart test NOT RUN。
9. EAC 无 default 源码副本，安装包含精确 artifact：PASS（stage 7 deletion/staging evidence、lock digest）；三平台安装包回读 NOT RUN。
10. Windows/Linux/macOS 构建、Node/Rust 测试、staged integrity、WebView smoke：FAIL/NOT READY。EAC PR #404 的 Linux/Windows 12-job CI PASS，但 CodeQL Python FAILURE，且 macOS、安装包、WebView smoke 未形成当前阶段证据。
11. dsh `0.1.5-rc.2` / `0.1.6-alpha.2` 矩阵覆盖且破坏性差异不强转：PASS（HostProfile explicit adapter ranges and contract）；两版本类型/fixture CI NOT RUN。
12. 发布、降级、撤回、previous-known-good 恢复 runbook 实际演练：FAIL（runbook 已完成，但实际演练尚未执行）。
13. 首版无自动更新/watcher，日志 30 天、回滚 artifact 2 代，强制启用 30 秒自动恢复：PASS（contracts、stage 6 handoff、runbook scope）；生产接线与跨平台 E2E NOT RUN。

结论：阶段 8 本地发布前验收、runbook 文档与可读远端分支 PASS；正式发布资格 FAIL/NOT READY，原因是 EAC stage-8 docs-only push 未触发产品 CI、CodeQL Python 未通过、缺少 macOS/安装包/WebView/旧 manager 拒绝矩阵/attestation/回滚演练证据。不得将此 artifact 表述为“已发布”。

## 配置与迁移 Configuration & Migration

升级必须先验证 manager schema、host profile、dsh range、artifact digest 和 lock，再提交 active binding。降级必须使用上一份完整 EAC release 与其 lock，不读取 mutable branch，不把新 schema 写入旧 manager 可读目录；旧 manager 对未知 schema 必须拒绝并保留 previous-known-good/default。

## 回退方式 Rollback

本 handoff 的回退入口为：停止灰度 → 保留证据 → 恢复 previous-known-good → 恢复 pinned `system.default` → 宿主 embedded fallback。正式 release/tag/asset/retract 尚未执行，因此不存在需要冒充完成的远端回退动作。

## 主人逐项批准清单（本次必须停在这里）

以下每项均是外部不可逆或共享环境变更，未经主人明确批准不得执行：

- [x] push manager `stage-8-release-runbook`（已执行并回读远端 SHA/CI）
- [x] push default-skins `stage-8-release-runbook`（已执行并回读远端 SHA/CI）
- [x] push EAC `stage-8-release-runbook`（已执行并回读远端 SHA；docs-only push 未触发 CI）
- [ ] 创建或合并三仓 PR
- [ ] 创建 manager tag/Release 并上传 asset
- [ ] 创建 default-skins tag/Release 并上传 artifact、checksums、provenance、release notes
- [ ] 更新/发布 EAC lock 对应的正式 tag/Release 与安装包
- [ ] 开启手动导入/逐槽切换灰度
- [ ] 撤回、删除 asset、移动 tag 或执行正式 rollback

本阶段实际完成：本地分支已生成，静态验收已执行，runbook artifact 已生成；上述发布动作均未执行。

### 拟发布 manifest（仅供逐项审批，未执行）

| 顺序 | 仓库 | 候选 commit | 拟发布 tag | 拟发布 assets / digest | 当前 CI / 发布状态 | 需主人批准的精确动作 |
|---|---|---|---|---|---|---|
| 1 | manager | `7bcf5bfb6b83bcf9c8ac2f0fb8f9e95de96d7373` | 待主人批准版本号后冻结 | 当前锁定候选 `dsh-eac-ui-skin-manager-0.1.0-preview.1.tgz`, SHA-256 `13a4c5dbd1a31c9512f535a9c14f5072f933f284634f6763e569e65614a63378`；正式 release 必须重新生成并回读 digest | stage-8 branch pushed；run `35704298604` SUCCESS；Release NOT RUN | 批准创建指定 tag/Release；批准上传并回读 immutable asset/provenance/attestation |
| 2 | default-skins | `bda0b948ee21f10651d5d390ab2c3a41d1632ef9` | 待主人批准版本号后冻结 | `system.default-2.0.0.dshpack.tar`, SHA-256 `eb8142e44bd9ae281c518e08c5e792506c9fd35b2bfde3119db0aaadff21aa7e`；同时需要 `SHA256SUMS`、provenance、release notes | stage-8 branch pushed；run `35704307695` SUCCESS；Release NOT RUN | manager 发布回读 PASS 后，批准创建指定 tag/Release、上传四类 assets 并回读 digest/attestation |
| 3 | EAC | 产品基线 `80c777aa8a097e1ecb88d550533ed15531d13f28`；stage-8 branch 另含 runbook docs commit | 待主人批准版本号后冻结 | 三平台安装包、SHA256SUMS、provenance/attestation：NOT BUILT，当前无可批准 digest | stage-8 branch pushed；docs-only push 未触发 Actions；历史产品基线 CI 12/12 PASS；CodeQL Python FAILURE；macOS/安装包/WebView NOT RUN | manager/default 发布回读 PASS 且 lock 更新后，批准运行三平台 release CI；所有 gate PASS 后另行批准 tag/Release/assets |

审批顺序不可合并：先批准 manager 的 branch/CI；其正式 Release 回读通过后再批准 default-skins；其 Release 回读通过后再批准 EAC lock 与 release CI。当前没有可靠依据填写三个正式 tag，也没有 EAC 安装包 digest，因此不得把“待冻结/NOT BUILT”替换为猜测值。
