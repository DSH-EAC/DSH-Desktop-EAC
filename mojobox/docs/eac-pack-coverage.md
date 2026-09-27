# EAC Pack coverage — M4 status ledger

本文件记录总体规划 M4（插件包拆分）要求的四个 EAC Pack 的成员清单与发布状态。
规则（与 `AGENTS.md` 一致）：只写可核验事实；没有可验证 artifact 的成员不进入
Pack Lock，也不编造 URL、摘要或许可；这些成员以 **source-pending** 形式在此挂账，
待其发布可验证 artifact 后再入 Pack。

事实源与版本基准：

- EAC 内置插件：`DSH-EAC/DSH-Desktop-EAC` @ `a9b90e254800dfe84c65c01d150a8596e94f6a31`
  （`dsh-desktop/assets/plugins/`，当前实际集合为 14 目录，非历史 ~45+ 清单；
  分支头 `c0fdec5` 已实测核对为同一目录集合）。
- 皮肤公约包：`DSH-EAC/dsh-ui-skin-loader` @ `e3ac8675c51da74c5084c7bf99fc78ce6ee129ac`
  （v1.1.0 本地打包产物 14 个 tgz = 加载器 1 + 皮肤 13；摘要为对最终验证包
  `.verify/pkgs-v1.1.0-final/` 逐个复算的 SHA-256，全部与其中的 `SHA256SUMS.txt` 一致，
  其中 13 个与仓库 `dist/SHA256SUMS.txt` 相同，`dsh-eac-skin-deep-whale-day-night-1.1.0.tgz`
  仅存在于最终验证包）。**v1.1.0 尚未提交、未打标签、未发布 GitHub Release 与 npm**
  （M8 待授权）：catalog 记录中的 GitHub Release URL 是按既有资产命名约定的既定发布位置，
  发布完成前不可下载；URL/摘要的最后一次核对属 M8 发布序列第 4 步。
  14 条记录的 `source.revision` 固定为该打包工作树的 HEAD `e3ac8675…`（即 v1.0.0 发布提交）：
  v1.1.0 改动仍在工作树中未提交，故 revision 不随皮肤版本前移，待 M8 提交/打标签后再按发布
  提交复核；每包的逐字节来源（subtree/blob SHA）与许可全文见其 `THIRD-PARTY-NOTICES.md`。
- 推荐名单：EAC 内置 `dsh-unified-market/data/eac-recommended.json`（`eacRecommended: true`）。
- L2 示例名单：总体规划 M3 表（dsh-our-free-model、dsh-meow-smooth、dsh-terminal 等）；
  具体三层分级（tier）由 M3/#416 落地，本文件不预设 tier 字段。

约束提醒：Pack Lock 的 `source` 字段 schema 只接受 `npm:<name>@<version>`，且每个
组件必须有可下载并摘要一致的 artifact。GitHub release tgz（皮肤/loader）虽然真实
存在并已入 catalog，但在 npm 发布之前无法进入 Lock。

## dev.dsh-eac.recommended.v1（function）— 部分发布

Pack/Lock：`catalog/packs/dev.dsh-eac.recommended.v1.pack.json` / `.lock.json`（v0.1.0）。

| 成员 | 状态 | 事实 |
| --- | --- | --- |
| `dev.tt-a1i.archify-dsh` @0.1.0 | **published**（已入 Lock） | npm `@tt-a1i/archify-dsh@0.1.0`，sha256 实测；EAC `eac-recommended.json` 名单成员 |
| `dev.phant0meow.meow-smooth` @0.5.0 | **published**（已入 Lock） | npm `meow-smooth@0.5.0`（2026-08-25 发布，repository 与记录 `source.repository` 同为 Phant0Meow/dsh-meow-smooth），tarball sha256 实测，包内 `main: lib/index.js` 与记录 facets 一致；来源 revision `c7bbe6f0419a5a2ca9f3e9eb62003d693735cdd6` 已验证存在于上游 |
| `dev.zouyuxuan122.dsh-our-free-model` @1.2.2 | source-pending | npm 无包（package.json `private: true`）；发布通道为上游 in-app upgrader feed；无 npm artifact 即不可入 Lock |

解除条件：剩余 source-pending 成员（dsh-our-free-model）发布 npm 包（或 Lock schema
扩展非 npm 来源），由 M6/后续阶段补录 artifact 后加入 Lock 并升版本。

## dev.dsh-eac.builtin.v1（function）— 全部 source-pending

L1 内置插件随 EAC 桌面分发（`dsh-desktop/assets/plugins/`），均为 EAC 修改/维护的
vendored 副本，npm 上没有与其字节对应的已发布 artifact（`dsh-unified-market` 的
npm 0.4.0 为 jing-hy 上游版，与 EAC 内置副本逐文件不同，已实测比对；`dsh-compact`
npm 仅有 0.1.0，EAC 内置为 1.0.0）。因此本 Pack 暂无任何可入 Lock 的组件，Pack
文件暂不创建（Pack schema `components.minItems: 1`）。catalog 记录已建立：

| catalog id | name @version | 备注 |
| --- | --- | --- |
| `dev.eac.dsh-client-file-changes` | @deepseek-ai/dsh-client-file-changes @0.1.0 | |
| `dev.eac.dsh-compact` | dsh-compact @1.0.0 | 既有记录（未改动） |
| `dev.eac.dsh-eac-core-bridge` | dsh-eac-core-bridge @1.0.0 | |
| `dev.eac.dsh-eac-locale-compat` | dsh-eac-locale-compat @1.0.0 | |
| `dev.eac.dsh-easy-setup` | @deepseek-ai/dsh-easy-setup @0.1.0 | |
| `dev.eac.dsh-file-changes` | @deepseek-ai/dsh-file-changes @0.1.0 | |
| `dev.eac.dsh-file-drop-eac` | dsh-file-drop-eac @0.1.2 | |
| `dev.eac.dsh-plugin-manager` | @deepseek-ai/dsh-plugin-manager @0.1.0 | |
| `dev.eac.dsh-plugin-shield` | dsh-plugin-shield @0.1.0 | |
| `dev.eac.dsh-settings-scroll-fix` | dsh-settings-scroll-fix @2.0.2 | |
| `dev.eac.dsh-terminal` | @deepseek-ai/dsh-terminal @0.1.0 | |
| `dev.eac.dsh-unified-market` | dsh-unified-market @0.4.0 | npm 上游同号为 jing-hy 版，非 EAC 副本 |
| `dev.eac.dsh-viewport-lock` | dsh-viewport-lock @1.0.1 | |

`dsh-skin-switch`（@deepseek-ai/dsh-skin-switch @0.1.0）**有意不建记录**：它是
#415 的移除目标（M2），不应进入任何分发 Pack。

解除条件：EAC 侧将内置插件以精确版本发布到 npm（或经 M8 发布链路产出可寻址
artifact），再逐个补 `artifact` 并建立 Pack/Lock。

## dev.dsh-eac.skins.v1（appearance）— 14 个成员已入 catalog，Pack source-pending

皮肤链 v1.1.0（加载器 1 + 皮肤 13）的 14 个 tgz 已在本地打包并核验，catalog 记录与
Level-1（Parsed）Evidence 全部建立（v1.0.0 的 6 条记录已随版本刷新为 1.1.0，旧 Evidence
按 subject 版本/摘要不再匹配而被替换）；但 GitHub Release 资产与 npm 均未发布，Lock 的
`npm:` 来源约束使这些 artifact 无法进入 Pack Lock，Pack 文件暂不创建：

| catalog id | name @version | artifact（v1.1.0 tgz） | license | 来源事实 |
| --- | --- | --- | --- | --- |
| `dev.eac.ui-skin-loader` | @dsh-eac/ui-skin-loader @1.1.0 | dsh-eac-ui-skin-loader-1.1.0.tgz | MIT | 本仓自研，无第三方内容 |
| `dev.eac.skin-aurora` | @dsh-eac/skin-aurora @1.1.0 | dsh-eac-skin-aurora-1.1.0.tgz | MIT | 本仓自研参考实现 |
| `dev.eac.skin-inkwash` | @dsh-eac/skin-inkwash @1.1.0 | dsh-eac-skin-inkwash-1.1.0.tgz | MIT | 本仓自研参考实现 |
| `dev.eac.skin-blue-fantasy` | @dsh-eac/skin-blue-fantasy @1.1.0 | dsh-eac-skin-blue-fantasy-1.1.0.tgz | MIT AND BSD-3-Clause | 上游 `@linxin666/dsh-client-ui-skin-blue-fantasy` 0.1.11（BSD-3-Clause）+ DreamSkin 画作 MIT © powerdog996 |
| `dev.eac.skin-dragon-heir` | @dsh-eac/skin-dragon-heir @1.1.0 | dsh-eac-skin-dragon-heir-1.1.0.tgz | MIT AND BSD-3-Clause | 上游 `@linxin666/dsh-client-ui-skin-dragon-heir` 0.1.11 |
| `dev.eac.skin-maid-atelier` | @dsh-eac/skin-maid-atelier @1.1.0 | dsh-eac-skin-maid-atelier-1.1.0.tgz | MIT AND CC-BY-NC-SA-4.0 | 上游 `@dsh-external/dsh-client-ui-skin-maid-atelier` 0.0.1，**仅限非商业**，署名链 上善 → zipzip → Small-tailqwq |
| `dev.eac.skin-miku` | @dsh-eac/skin-miku @1.1.0 | dsh-eac-skin-miku-1.1.0.tgz | MIT AND BSD-3-Clause | 上游 `@linxin666/dsh-client-ui-skin-miku` 0.1.11 |
| `dev.eac.skin-minecraft` | @dsh-eac/skin-minecraft @1.1.0 | dsh-eac-skin-minecraft-1.1.0.tgz | MIT AND BSD-3-Clause | 上游 `@linxin666/dsh-client-ui-skin-minecraft` 0.1.11 |
| `dev.eac.skin-qq98` | @dsh-eac/skin-qq98 @1.1.0 | dsh-eac-skin-qq98-1.1.0.tgz | MIT AND BSD-3-Clause | 上游 `@linxin666/dsh-client-ui-skin-qq98` 0.1.11 |
| `dev.eac.skin-ths` | @dsh-eac/skin-ths @1.1.0 | dsh-eac-skin-ths-1.1.0.tgz | MIT AND BSD-3-Clause | 上游 `@linxin666/dsh-client-ui-skin-ths` 0.1.11 |
| `dev.eac.skin-trading` | @dsh-eac/skin-trading @1.1.0 | dsh-eac-skin-trading-1.1.0.tgz | MIT AND BSD-3-Clause | 上游 `@linxin666/dsh-client-ui-skin-trading` 0.1.11 |
| `dev.eac.skin-whale-song` | @dsh-eac/skin-whale-song @1.1.0 | dsh-eac-skin-whale-song-1.1.0.tgz | MIT AND BSD-3-Clause | 上游 `@linxin666/dsh-client-ui-skin-whale-song` 0.1.11（具象画作已按 IP 裁定 R13 移除） |
| `dev.eac.skin-xp` | @dsh-eac/skin-xp @1.1.0 | dsh-eac-skin-xp-1.1.0.tgz | MIT AND BSD-3-Clause | 上游 `@linxin666/dsh-client-ui-skin-xp` 0.1.11 |
| `dev.eac.skin-deep-whale-day-night` | @dsh-eac/skin-deep-whale-day-night @1.1.0 | dsh-eac-skin-deep-whale-day-night-1.1.0.tgz | CC-BY-NC-SA-4.0 | 上游 `GGBond2424648901/deep-whale-day-night-theme@3f6c4f14716d1e500f585be0c0d3c139c7a8a90b`，**仅限非商业**；R3 冲突未解（见下） |

口径说明（全部可核验，无推断）：

- 逐包 64 位十六进制摘要只存在于 catalog 记录的 `artifact.digest`（唯一真相），本表只列
  文件名与许可，避免文档与记录出现两份可能漂移的摘要。
- 八款迁移皮肤（blue-fantasy、maid-atelier、miku、minecraft、qq98、ths、xp、
  deep-whale-day-night）的观感与行为内容取自不可变 Git 对象
  `DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf`
  （`dsh-desktop/assets/skins` tree `2a243cf86e541a8b635191a1f5df017a47ab81d2`）；工程骨架为本仓
  原始代码，逐包来源（subtree/blob SHA、原包名与版本、许可全文）落档于各包
  `THIRD-PARTY-NOTICES.md`。deep-whale-day-night 的上游为独立仓库（非 DSH-Desktop-EAC）。
- **deep-whale-day-night 的 R3 冲突**：其 `lib/client.js` 仍含 9 处 `maid-atelier` body
  marker/chrome owner 字符串（本次逐字节实测计数），与已发布的 `@dsh-eac/skin-maid-atelier`
  同名冲突；loader 的 13-tarball release manifest 因此把该包列为 **deferred**，而 M1 最终
  验证包仍保留其 1.1.0 tgz。发布前必须先解决冲突（改 marker 或从发布集剔除），catalog 只
  如实记录既有 tgz 与摘要，不代表它已可发布。
- **非商业许可**：maid-atelier 与 deep-whale-day-night 的观感内容为 CC BY-NC-SA 4.0，仅限
  非商业使用；任何商业化分发前必须移除或另行取得授权（catalog 只记录事实，不作许可判断）。
- `dsh-theme-endfield`（`ymh0000123/dsh-theme-endfield@82655a04f6b3249daa7d8a86ab956dd62a6c17cc`）：
  M1 **DEFERRED**，它是完整 host/client 功能插件（常驻 host 音频运行时、诊断落盘、独立设置面），
  不属于纯皮肤迁移；无包、无 artifact，因此不建记录、不编造。

解除条件：M8 发布 GitHub Release v1.1.0 的 14 个资产并逐个核对 URL 可下载、字节摘要与
catalog 一致（deep-whale 需先解决 R3）→ 站点快照方可引用；`@dsh-eac/*` 发布到 npm 后，
将 `artifact.path` 换为 npm tgz 并以 `npm:` source 建立 `dev.dsh-eac.skins.v1` Pack/Lock。

## dev.dsh-eac.free-model.v1（function）— source-pending

唯一成员 `dsh-our-free-model` 无 npm artifact（见上），Pack/Lock 暂不创建。
总体规划 M6 允许并入 `dev.dsh-eac.recommended.v1`；届时若单列本 Pack，直接复用该记录。

## 验证

- `npm test`：schema + catalog 交叉校验（含未发布记录不得进入 Lock 的约束）。
  皮肤链刷新后实测：**47 plugins / 5 Packs / 5 Locks / 19 evidence records**。
- `npm run test:eac`：M4 覆盖守卫——unpublished 记录不得带 artifact、Lock 组件
  必须有 artifact、四个规划 Pack ID 必须已发布或在本文件挂账；并新增**皮肤链守卫**：
  `dev.eac.ui-skin-loader` 与 `dev.eac.skin-*` 每个记录必须带真实 artifact、artifact
  文件名必须由 `name@version` 精确推导（挡住版本/摘要漂移）、必须在本文档挂账、
  且不得出现在任何 Pack Lock 中（GitHub release-only 记录保持 source-pending）。
- `npm run prepare:site`：生成 catalog 快照与 `dev.dsh-eac.recommended.v1` 的
  `.dshpack`（生成物不入库）。
