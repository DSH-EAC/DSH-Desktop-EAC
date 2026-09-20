# Task t_84c9e548 插件分发边界独立 QA 报告

## 结论

未通过（NOT APPROVED）。

当前候选实现已满足静态分类、推荐包 draft、runtime registry/CORE 对齐、资产保全等主体要求，任务核心套件 72/72 通过。但 `validateDistribution()` 对迁移状态的契约仍有两项可复现缺陷：

1. `source-ready` npm 条目允许可变版本范围（如 `^1.2.3`），不满足“不可变 source ref/version/integrity”要求。
2. `migrated` 条目从当前 bundled inventory 移除后会被 cross-ledger 校验无条件拒绝，无法表达计划要求的“当前 inventory 或已迁移历史段”。

这两项直接影响删除前门禁和后续 Task 4/5 物理迁移，需修复后复验。

## 验收标准核对

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 49 项严格分类为 builtin 16 / recommended 14 / external 19，无重复/未知 | 通过 | `jq` 实测 total=49、16/14/19、duplicateIds=[]；`plugin-distribution.test.ts` 对固定清单逐项断言 |
| 10 skins 与 1 SDK fixture 不混入插件分类 | 通过 | `validate-manifest` 输出 plugins=49 skins=10 sdkPlugins=1；目录实测 skins=10，plugin package=49 |
| distribution / maintenance / category 三轴不混淆 | 通过 | ADR 0008 分别定义三轴；distribution 独立于 `.sync/plugins.json.class`，category 留给 Task 2.2 |
| schema/validator 覆盖结构与 cross-ledger | 部分通过 | 当前 49 项可通过结构、inventory 与 SOURCES 校验；但 migrated 历史段未实现，见缺陷 2 |
| 推荐包恰好 14 项，无 builtin/latest；未就绪时 draft 且不入 market snapshot | 通过 | intended=14、installable=0、builtinRefs=0、latestRefs=0、status=draft、snapshot 命中数=0 |
| removal-ready/migrated 严格满足 immutable ref、integrity、EAC patch 结论 | 未通过 | removal-ready/migrated 的现有负测通过；但同属“就绪”的 source-ready 接受可变 npm range，见缺陷 1；migrated 又无法脱离 inventory，见缺陷 2 |
| builtin runtime/CORE 一致且不含 retired dsh-market-plugin | 通过 | `companion-plugins-registry.test.ts` 断言生成 registry、CORE 和 retired 集合；核心套件通过 |
| 未物理删除 33 个非内置插件 | 通过 | 49 个 plugin package 仍在；33/33 non-builtin 均为 source-pending；plugin 资产删除 diff 为 0 |
| 未修改 GitHub/提交历史 | 通过 | HEAD 保持 `3ac71fc`；本次 QA 未执行 commit/push/GitHub 写操作 |
| 原有未跟踪文件未清理 | 通过 | `.hermes/`、`.worktrees/`、`docs/任务流程.md` 仍存在；状态中仍可见原未跟踪项 |

## 缺陷

### 1. source-ready 接受可变 npm 版本范围

位置：`dsh-desktop/scripts/plugin-sync.mjs:507-514`、`.sync/plugin-distribution.schema.json:279-320`

现象：schema 对 `source-ready` 要求 `sourceRef/version/integrity`，但 `version` 仅要求非空；额外 exact-semver 校验只在 `removal-ready`/`migrated` 执行。因此以下 source-ready 条目返回零错误：

- `sourceRef: npm:demo-plugin`
- `version: ^1.2.3`
- 完整 SHA-256
- `migration.state: source-ready`

复现：

```sh
node reports/verify/t_84c9e548-plugin-distribution-repro.mjs
```

实际输出：

```text
{"name":"mutable npm range accepted at source-ready","errors":[]}
```

影响：推荐包 validator 把 `source-ready` 直接纳入可安装 `plugins[]`，可变 npm range 会进入推荐包，与计划中的精确版本和不可变源门禁冲突。

最小修复要求：npm 条目的 exact semver 校验覆盖 `source-ready`、`removal-ready`、`migrated`；增加负测，明确 `source-ready + ^1.2.3` 必须失败。GitHub ref 的 40 位 commit 继续由 schema 保证。

### 2. migrated 条目无法从 bundled inventory 移除

位置：`dsh-desktop/scripts/plugin-sync.mjs:502-505`、`536-550`

现象：所有 distribution 条目都必须存在于当前 `.sync/plugins.json` inventory，且 distribution 数量必须与当前 inventory 完全相等。一个已经通过全部门禁、`migration.current=market`、`state=migrated` 的插件从 bundled inventory 删除后，validator 仍报错。

复现：

```sh
node reports/verify/t_84c9e548-plugin-distribution-repro.mjs
```

实际输出：

```text
{"name":"migrated plugin rejected after inventory removal","errors":["plugin distribution entry demo: id is not present in the current plugin inventory","plugin distribution: entries must cover the current plugin inventory exactly"]}
```

影响：Task 6/后续 Task 4/5 无法在不破坏 `validate-manifest` 的前提下删除任何已迁移 vendored 插件；这与计划 `id 必须存在于当前 .sync/plugins.json 或已迁移历史段` 的 cross-ledger 设计冲突。

最小修复要求：为 migrated/retired 项定义并验证机器可读历史来源，或使 current inventory 的严格双向覆盖只约束尚未迁移的条目；仍需保证未知 id、重复 id、SOURCES/历史证据缺失会失败。增加“migrated 已移出 inventory 可通过”和“非 migrated 缺 inventory 必须失败”两组测试。

## 执行记录

通过：

- `node scripts/plugin-ledger.mjs --report`：校验通过，49/49 manifest。
- `node scripts/plugin-sync.mjs validate-manifest`：plugins=49 skins=10 sdkPlugins=1。
- `node scripts/plugin-sync.mjs validate --locked`：entries=60。
- `node scripts/generate-plugin-registry.mjs --check`：generated registry valid。
- 核心定向套件：72/72 通过。
- `node --check`：onboarding、plugin-sync、generated registry、wizard client、e2e JS 全部通过。
- `git diff --check`：通过。

环境阻断，不计为本任务实现缺陷：

- `npm run typecheck`：退出码 2，`TS2688 Cannot find type definition file for 'node'`；实测 `node_modules/@types/node` 不存在。
- `npm test`：pretest 的 `npm run build` 因同一缺失依赖失败。
- 含 `install-profile.test.ts` 的计划组合：60/61 通过，唯一失败为未生成 `lib/desktop/install-profile.js`。
- `recovery-center.test.ts` + `composer-dynamic-island-integration.test.ts`：5/7 通过，两个失败均为未生成 `lib/state.js` / `lib/desktop/companion-sync.js`，根因仍是 build 被缺失 `@types/node` 阻断。

## 验证边界

未安装依赖，也未修改共享环境。未运行 GUI/打包/真实外部插件安装链；当前所有非内置插件均为 source-pending，尚不存在可执行 canary，因此不应伪称已完成 Task 6 的安装/启动/卸载/回滚验收。
