# 验证矩阵 V1-V11 实跑报告（T2.7 全量验证战役）

> 0.1.7-rc.2 隔离环境全量验证：V1-V11 作为一次完整战役实跑，全部结论以本战役实测为准（不引用旧结论代替实跑）。
> 日期：2026-09-26 ｜ 环境：`.verify/dsh-home-t9`（全新隔离 DSH_HOME）｜ 执行：T2.7
> 总判定：**V1-V11 全部通过**（V7 实跑暴露一处加载器跨标签页缺陷，已修复 + 补测试 + 复跑，见 §3.7 与 §4）。

---

## 0. 环境与安装形态

| 项 | 值 |
| --- | --- |
| 宿主 | `@deepseek-ai/dsh@0.1.7-rc.2`（`.verify/probe/` npm 安装树，钉死版本） |
| DSH_HOME | `<repo>\.verify\dsh-home-t9`（本战役新建，V1 由 boot 自动初始化；全程唯一 DSH_HOME） |
| Node / npm / pnpm | v24.11.1 / 11.6.2 / 11.7.0（`dsh plugin` 内部转发 pnpm） |
| 平台 / shell | Windows 10.0.22000 x64 ｜ Git Bash ｜ 浏览器 Playwright 1.55 + msedge headless |
| 端口 | 18601（战役全程复用；进程管理一律 `taskkill /F /PID <pid> /T`） |
| 仓库基线 | commit `02045ab`（main HEAD）+ 本战役修复 commit（§4） |

**安装形态（最接近发布的 tarball 链路）**：

```bash
# 三包各 npm pack（产物：.verify/pkgs-t9/*.tgz，files 只含 lib/ + cordis.patch.yml + package.json）
npm pack --pack-destination .verify/pkgs-t9        # 分别在 packages/loader、packages/skins/{aurora,inkwash} 执行
# 逐包 tarball 安装（pnpm 以 file: 复制安装——非 link:；bundle 自动追加进 profile）
DSH_HOME=.verify/dsh-home-t9 npx dsh plugin --profile web add <abs>/dsh-eac-ui-skin-loader-0.0.0.tgz
DSH_HOME=.verify/dsh-home-t9 npx dsh plugin --profile web add <abs>/dsh-eac-skin-aurora-1.0.0.tgz
DSH_HOME=.verify/dsh-home-t9 npx dsh plugin --profile web add <abs>/dsh-eac-skin-inkwash-1.0.0.tgz
```

tarball 安装实测要点：依赖随包装入（loader/aurora 的 `@deepseek-ai/schemastery` 落入 profile `node_modules/.pnpm`）；安装即启用（`dsh.profile.bundles` 自动追加）；**同路径同名重装需先 remove 再 add**（pnpm 对相同 `file:` 规格报 "Already up to date" 不重新解包——本战役修复后重装时实测，见 §4）。

boot 唯一形态（全程）：

```bash
cd .verify/probe && DSH_HOME=<loader>/.verify/dsh-home-t9 npx dsh --profile web --no-open --port 18601
```

---

## 1. 验证矩阵总表

| # | 验证项 | 判定 | 关键证据 |
| --- | --- | --- | --- |
| V1 | 干净内核 boot | ✅ | `boot-v1.log` 1 行零 error/warn；HTTP 401 fence / 303+cookie / 200 |
| V2 | 三包经安装链装入 | ✅ | tarball 安装成功；`boot-v2.log` 零 error/warn；两卡均 discovered 未激活 |
| V3 | 单元测试 node --test | ✅ | 基线本地 93 全绿；修复后本地 125 全绿（postfix 日志）；CI run 36191827871 双平台 success |
| V4 | 控制台渲染（亮/暗） | ✅ | 截图 19/19b/20/20b 卡片墙完整；console error/warning 均为 0 |
| V5 | 热切换 aurora→inkwash→default | ✅ | 16/16 断言；settled 截图 21/22/23；残留与 theme 覆盖全零；归一化 outerHTML 逐字节一致 |
| V6 | 持久化 | ✅ | 7/7 断言；aurora 跨重启恢复（恢复重放路径）+ default 同样持久；截图 24/25 |
| V7 | 跨标签页 | ✅（修复后） | 6/6 断言；A→B 延迟 1055ms、B→A 1186ms（<5s）；截图 26 |
| V8 | 故障隔离 | ✅ | 13/13 断言；fault 卡片 + suspect-residue 徽标 + warning 横幅如实呈现；截图 27/28 |
| V9 | 回归（卸载 + 路径审计） | ✅ | 五包卸载后 boot 与 V1 基线逐字节一致（仅 token 不同）；真实 `.dsh` 2547 条目零变化 |
| V10 | 视觉验收 | ✅ | 截图档案 01-28 完备（§3.10 清单），逐张目验无布局破损 |
| V11 | 公约符合性 | ✅ | 公约 §9 六问 × aurora/inkwash 逐条作答（§3.11），代码位置 + 实机断言双佐证 |

---

## 2. 证据归档位置

- boot 日志：`.verify/boot-v1.log`、`boot-v2-loader-only.log`、`boot-v2.log`、`boot-v2-fixed.log`、`boot-v6-{a,b,c}.log`、`boot-v7.log`、`boot-v8.log`、`boot-v9-after-remove.log`
- 截图：`.verify/shots/01-…28`（清单见 §3.10）
- 实机脚本（证据可重放）：`.verify/pw/t9-lib.mjs` + `t9-empty.mjs` / `t9-wall.mjs` / `t9-switch.mjs` / `t9-persist.mjs` / `t9-crosstab.mjs` / `t9-fault.mjs`
- 路径审计：`.verify/audit-t9/real-dsh-snapshot-{start,end}.txt`（起止两次全量清单 + diff 为空）
- 测试日志：`.verify/audit-t9/v3-local-test.log`（修复前基线）+ `v3-local-test-postfix.log`（修复后，145b1f0 构建）

---

## 3. 逐项结论

### 3.1 V1 干净内核 boot ✅

全新 `dsh-home-t9` 首次 boot：

```
dsh web: http://127.0.0.1:18601/?token=<boot-token>
```

- 日志恰 1 行，`grep -ci error` = 0、`grep -ci warn` = 0。
- HTTP：无 token → 303 → 401（browser-trust fence）；带 token → 303 + `set-cookie`；带 cookie → 200，根 HTML 内实见 `window.__ModuleLoader__`（2 处）。
- 该日志与 HTTP 行为作为 V9 的对照基线留档。

### 3.2 V2 三包经安装链装入 ✅

- 顺序：装 loader tarball → boot（空状态）→ 装 aurora + inkwash tarball → 杀进程重启 boot。
- `boot-v2.log`：1 行零 error/warn（安装后无新增 error）。
- 控制台：恰两张卡（`count=2`），均 `data-usl-skin-status="discovered"`，页面零皮肤副作用（marker/style/backdrop/席位全零）；hero = 默认观感。
- `settingsHint` 对照：aurora 卡有「设置 → 极光之夜」入口、inkwash 卡没有（无设置皮肤不被区别对待）。
- tarball 产物内容核验：`tar -tzf` 仅 `package/lib/{index,client}.js + package.json + cordis.patch.yml`（aurora 另含 README.md）。
- 空状态（V4 缺口项前移至此）：仅装 loader 未装皮肤时，控制台出现 `[data-usl-role="empty"]` 引导文案「还没有安装任何皮肤…」，卡数为 0（截图 18）。

### 3.3 V3 单元测试 ✅

本地复跑两次（`pnpm -r test`，Node 24 type-stripping，`node --test`），与战役的两个构建状态一一对应：

```
基线（修复前构建 02045ab，日志 .verify/audit-t9/v3-local-test.log，04:51）：
packages/loader        tests 93  pass 93  fail 0
packages/skins/aurora  tests 21  pass 21  fail 0
packages/skins/inkwash tests  9  pass  9  fail 0

修复后（提交 145b1f0 构建重跑，日志 .verify/audit-t9/v3-local-test-postfix.log，05:43）：
packages/loader        tests 95  pass 95  fail 0   （+2：V7 缺陷回归测试，见 §4）
packages/skins/aurora  tests 21  pass 21  fail 0
packages/skins/inkwash tests  9  pass  9  fail 0
```

覆盖切换/回滚/恢复/adapter/设置投影/故障隔离/跨标签页同步（含本战役新增回归测试，见 §4）。CI 佐证：战役起点 HEAD `02045ab` run [36186179771](https://github.com/DSH-EAC/dsh-ui-skin-loader/actions/runs/36186179771) success；**修复后推送** run [36191827871](https://github.com/DSH-EAC/dsh-ui-skin-loader/actions/runs/36191827871)（`145b1f0`+`fdef547`）ubuntu+windows 双平台 success——与上方修复后本地 95/21/9 一致。

### 3.4 V4 控制台渲染（亮/暗）✅

- 亮色：`data-usl-scheme="light"`，卡片墙完整（hero + 分组 + 双卡），截图 19 / 19b。
- 暗色：Playwright `emulateMedia({colorScheme:"dark"})` → 真实 `theme/change` 事件链 → `data-usl-scheme="dark"`，截图 20 / 20b。
- 浏览器 console error/warning 均为 0。
- （空状态证据见 §3.2，截图 18。）

### 3.5 V5 热切换 + 零残留 ✅（16/16 断言，同一页面加载内完成）

链路：默认 → aurora → inkwash → 恢复默认。**无刷新不变量**：切换前写入 `window.__t9_no_reload` 标记，链路结束仍在（`performance` 文档未更换）。

- **settled 截图**（缺口项）：每跳等待 switchTo 承诺落定的可见事实（卡片转 active + hero 更名 + 1.2s 余量）后拍摄——21（aurora settled）/ 22（inkwash settled）/ 23（back-to-default settled）。
- **切换后残留**（切走 aurora 后）：`data-skn-aurora-active` marker、`style[data-skn-aurora-style]` 节点、`[data-skn-aurora-backdrop]`、设置席位、styleSheets 归属全零；**token 层按值断言**：body 上 12 枚 `--dsw-alias-*` / 3 枚 `--dsw-specific-*` 中没有任何一枚仍携带 aurora 的值（此时 body 上 12 枚 token 全部属于 inkwash 的覆盖层——这是活性覆盖层，不是残留）。
- **恢复默认后**：双皮肤全部归零；body 内联 `--dsw-*` 计数 = 0；无 `data-ds-dark-theme`；`data-ds-theme-source` 恒为 "system"（偏好轴从未被写）；body background-image 与激活前逐字节相同。
- **DOM 快照比对**（缺口项）：激活前 vs 恢复后的 `documentElement.outerHTML`，归一化（剥离 script、token 查询值、空 `style=""`、标签内属性排序、空白折叠）后**逐字节一致**。归一化词汇经零激活校准测定：宿主自身 churn 仅 `hHd-Xa_quietBars` 一个装饰类与空 `style=""` 属性，且校准断言 churn 中不含任何 `skn-|usl-|dsw-|aurora|inkwash|skin` 归属 token。

### 3.6 V6 持久化 ✅（7/7 断言）

- aurora 激活（等待提交可见 + 1.5s 落盘余量）→ 杀进程 → 重启 → **加载器恢复重放**：无用户点击，hero=极光之夜、卡片 active、token 层恢复、偏好轴仍 system（截图 24）。
- 恢复默认 → 杀进程 → 重启 → 默认观感持久，无皮肤复活、零 token 层、双卡 discovered（截图 25）。
- **实测发现的环境特性（非缺陷）**：宿主 configForms 写通道的 API resolve 早于磁盘落盘；若在 API resolve 后立即硬杀进程（`taskkill /F /T`），最后一次写可能丢失（实测复现一次：mtime 证据 `cordis.patch.yml` 05:01:24.967 = 恢复重放把旧值 aurora 重新落盘，而非 default 写到达）。加载器侧契约（提交后落盘 + 失败如实 warning）不受影响；给 3s 余量后 4/4 重启场景全部通过。已记入 §5 特性清单。

### 3.7 V7 跨标签页 ✅（修复后 6/6 断言）

两个独立 Playwright context（独立 cookie/存储），同开控制台：

- A 激活 aurora → B 自动跟随（marker + token + hero），**延迟 1055ms**（<5s）；B 激活 inkwash → A 跟随，**延迟 1186ms**；双方收敛到同一唯一激活皮肤（截图 26）。
- A 恢复默认 → B 同样跟随（对称性）。

**本项实跑暴露并修复了一处真实缺陷**（首次实跑 B 永不跟随）：详见 §4。修复后以真实构建重跑本项与 V5/V6/V2/V4 复验通过。

### 3.8 V8 故障隔离 ✅（13/13 断言）

探针皮肤复用/扩自 `.verify/probe-skins/`（`probe-skin-fail` 激活即抛错；新增 `probe-skin-hang`：deactivate 返回永不 settle 的 promise）。

- **激活抛错**（probe-ignite）：错误原文如实呈现在该卡片行内（`activate of skin "probe-ignite" threw: probe-skin-fail: intentional activate failure…`），卡片标 **故障** 徽标；回滚落默认、零残留；inkwash 随即可正常激活（故障不传染）（截图 27）。
- **deactivate 挂起**（probe-hang，缺口项）：切往 aurora 时 deactivate 永不返回 → **10s 超时后切换继续**（实测 11.0s 提交，含超时窗口）；**warning 横幅**如实呈现全文 `deactivate of skin "probe-hang" timed out after 10000ms; marked suspect-residue (shutdown could not be verified)`；probe-hang 卡片标 **疑似残留** 徽标；挂起皮肤的 DOM 条确实还在（怀疑是事实，不谎报干净）；aurora 为提交后的当前皮肤（截图 28）。

### 3.9 V9 回归：卸载 + 路径审计 ✅

**卸载回归**：按 probe-hang → probe-fail → inkwash → aurora → loader 顺序 remove 五包 → bundles 复位 base 两项、profile dependencies 清空 → 残留剪除（两个 `link:` 探针的空 symlink 目录手动 `rmdir`；tarball 安装物已被 pnpm 自动剪净；`node_modules` 仅剩空 scope 目录与 pnpm 记账文件，零文件）→ 干净 boot：

```
V1 基线:  dsh web: http://127.0.0.1:18601/?token=<boot-token>
V9 卸载后: dsh web: http://127.0.0.1:18601/?token=<boot-token>
```

token 归一化后 diff 为空；`grep -ci error` = 0；HTTP 行为与 V1 一致（401 fence / 303 / 200）。卸载后 `cordis.patch.yml` 保留 loader 的设置行（activeSkin + faultLog 历史）——宿主对用户设置数据的保留行为，对 boot 零影响（上方 boot 即证）。

**路径审计（用户日常 profile 零触碰）**：

1. **命令清单复核**：本战役全部 dsh 命令（8 次 boot、5 次 add、7 次 remove、0 次其他）均以 `DSH_HOME=<repo>\.verify\dsh-home-t9` 环境变量前缀执行（shell `export`/行内前缀两种形态，脚本内经 `t9-lib.mjs` 的 `env` 参数注入同一值）；无一次裸 `dsh` 运行。`%USERPROFILE%\.dsh` 从未被任何命令读写。
2. **mtime 扫描（只读证据）**：战役起点与终点各对 `%USERPROFILE%\.dsh` 做一次全量递归清单（`Get-ChildItem -Recurse -Force`，记录类型/全路径/UTC mtime/大小）：

```
起点：2547 条目（.verify/audit-t9/real-dsh-snapshot-start.txt）
终点：2547 条目（.verify/audit-t9/real-dsh-snapshot-end.txt）
diff（起点 vs 终点）：空 —— 零新增、零删除、零 mtime/大小变化
```

3. **写盘范围**：`loader/.verify/`（隔离 home、日志、截图、脚本、tarball、审计清单）+ 仓库内 `docs/verification.md` 与 §4 修复（唯一入库内容）。`.verify/` 在 .gitignore 中。

### 3.10 V10 视觉验收：截图档案 ✅

档案 `.verify/shots/` 共 31 张：01-09（T2.5 历史档案，探针皮肤时期）、10-17（T2.6 历史档案，双内置皮肤 + 对比度修复后重拍）、18-28（**本战役、修复后构建**）：

| 文件 | 内容 | 目验 |
| --- | --- | --- |
| 18-empty-state.png | 未装皮肤时的空状态引导 | 完整 |
| 19/19b-wall-*-light.png | 双卡卡片墙（亮） | 完整 |
| 20/20b-wall-*-dark.png | 卡片墙（暗，theme/change 真实链路） | 完整 |
| 21-aurora-active-settled.png | 极光之夜激活 settled（玻璃拟态+氛围层+当前徽标） | 完整 |
| 22-inkwash-active-settled.png | 水墨青烟激活 settled（纸质+水墨） | 完整 |
| 23-back-to-default-settled.png | 恢复默认 settled（宿主原生观感、零残留） | 完整 |
| 24-aurora-restored-after-restart.png | 重启后恢复重放（无用户点击） | 完整 |
| 25-default-restored-after-restart.png | default 持久化复验 | 完整 |
| 26-cross-tab-follow-aurora.png | 跨标签页跟随（B 页） | 完整 |
| 27-probe-fault-error.png | 激活抛错：行内错误原文 + 故障徽标 | 完整 |
| 28-warning-suspect-residue.png | warning 横幅全文 + 疑似残留徽标 + 真实挂起残影 | 完整 |

（另有 19b/20b 全页照与 t9-debug-1.png（onboarding 弹层发现记录）。亮暗下标题/分组/pill/卡片文字全部清晰可读；无布局破损。）

### 3.11 V11 公约 §9 自检表 ✅（六问 × aurora / inkwash）

> 公约 §9 发布前自检（每题必须答"是"）——`covenant/convention.md` L147-170。佐证 = 代码位置 + 本战役实机断言编号。

**① 未激活时，我的插件除了登记元数据什么都不做？（R1）— aurora ✅ / inkwash ✅**

- 代码：两包 `src/client/index.tsx` 的 `apply(ctx)` 只做 `ctx.uiSkinLoader.registerSkin({...})` + `ctx.effect(() => unregister)`；设置分区席位与氛围层席位全部在 `activate` 内（`src/client/session.ts`）注册。
- 实机：V2 断言「两卡均 discovered、页面零 marker/style/backdrop/席位」（§3.2）——安装后未激活期间页面零副作用；inkwash 无设置面也不注册任何额外内容。

**② `deactivate` 之后，宿主观感与我从未激活时逐像素一致？（§4.3）— aurora ✅ / inkwash ✅**

- 代码：两包 `src/client/session.ts` 登记纪律（disposers 逆序 + 幂等 teardown + abort/fiber 安全网）。
- 实机：V5 归一化 DOM 快照比对「激活前 vs 恢复后逐字节一致」（§3.5）——比"恢复原值"更强：偏好轴 `data-ds-theme-source` 全程 "system"（从未偏离）；body background-image 与激活前相同。

**③ 我没有碰加载器保留面、其他皮肤、宿主恢复面？（R2/R3/R4）— aurora ✅ / inkwash ✅**

- 代码：席位 id / CSS 类 / data 属性 / SVG 渐变 id / locale ns / 设置命名空间全部自有前缀（`skn-aurora-*`：`src/identity.ts`；`skn-inkwash-*` 同构）；不引用 `usl-`/`dsh-ui-skin-loader`/`io.github.dsh-eac.skin.loader.*`/宿主 class；两皮肤互不引用（aurora CSS 组装测试含「不含 skn-inkwash」断言，inkwash 反之）。
- 实机：V5 双向残留断言（切走 aurora 后零 aurora 归属 token 值；恢复默认后双皮肤全零，§3.5）——激活期间对方的层不被触碰。

**④ 我没有依赖任何 CSS-module hash / 私有 DOM / HMR 内部？（R5）— aurora ✅ / inkwash ✅**

- 代码：只触 `document.body/head`（标准 DOM）+ 宿主主题 API 公开 token（`ctx.theme.register/overrideTokens`）+ 公开槽位（`shell.overlay`/`settings.section`）；CSS 选择器全部自有命名空间。
- 实机：跨宿主升级稳定性由"只触公开 ABI"保证；V4/V5 的 Playwright 断言全部经公开 DOM 形态（`data-skn-*`/`data-dsw` token）定位，无需任何 hash/私有面。

**⑤ 我不会自己记住"激活"状态、不会自启？（R6）— aurora ✅ / inkwash ✅**

- 代码：激活唯一入口 = 加载器 switchTo 下发的 activate；无任何持久化"上次是我"逻辑（皮肤设置持久化是用户数据，非激活状态——aurora `src/settings.ts` 只写自己的 `dsh-eac-skin-aurora` 命名空间）。
- 实机：V6 恢复重放由**加载器**读 `dsh-ui-skin-loader.activeSkin` 完成（截图 24）；皮肤自身从不请求激活。

**⑥ 我没有启停或改写任何其他插件？（R7）— aurora ✅ / inkwash ✅**

- 代码：无插件清单/patch 配置写；不写 ui-theme 偏好轴（观感由 `overrideTokens` 层承载，`src/theme.ts` 头注记录定案依据）。
- 实机：V5 偏好轴断言（`data-ds-theme-source` 恒 system）；V8 故障注入（激活抛错/关闭挂起）下其余皮肤与宿主功能不受影响（§3.8）——反证皮肤侧无越权通道。

---

## 4. 验证中发现并修复（代码改动）

### 4.1 缺陷：跨标签页同步在真实镜像回源时序下永不收敛（V7 首跑失败）

- **现象**：A 激活 aurora 提交后，B 页 30s 内无任何跟随；B 的运行时日志无 `cross-tab sync: replaying` 行。
- **根因**（实机 + 上游发布树实读）：上游对 `settings/document-updated` 的唯一 client 消费是 `mirror.load()`（`dsh-client-ui-settings/lib/client.js` L1512）——**异步回源**。事件到达时本端设置快照还是旧值；加载器的 `syncCheck` 仅由该事件驱动，读旧快照 → `persisted === currentId` → 幂等跳过；此后无第二个事件，永不重放。单测未发现：fake 的 `setRemoteValue` 把「远端写入 + 快照变更 + 通知」坍缩成同步一步，隐藏了真实机器上「事件先到、快照后到」的窗口。此缺口即 T2.8 报告 §11.4 预警的"跨标签页设置同步未做多标签实机验证"。
- **修复**（加载器侧小缺陷，两文件）：设置存储暴露 `onChange(listener)`（`persistence.ts`，透传上游 form subscribe）；runtime `start()` 把**本命名空间快照变更**接为 `syncCheck` 的第二触发源（`runtime.ts`），`stop()` 同步撤除。事件当下快照未回源 → 回源时订阅者被通知 → 再查收敛；自身写入回声与在途切换由 syncCheck 既有语义幂等消化（inFlight 早退 + 落定后 finally 重查）。额外收益：`connection/reset` 后的 mirror 全量回源同样触发收敛。
- **测试**：新增回归锁定 `cross-tab: late mirror reload (no second event) still converges — real-machine race`（先红后绿：修复前 `'default' !== 'alpha'` 复现真实时序）；原「他人命名空间事件被忽略」按真实上游语义拆为两例（纯他人事件无事可做 / 他人事件引发的全量回源驱动收敛）。loader 95 tests 全绿（+2）。
- **复验**（修复构建重装后重跑）：V7 6/6（延迟 1055/1186ms）；V5 16/16、V6 7/7、V2/V4 墙面与渲染复验通过、V1/V9 boot 日志零 error——修复未破坏任何矩阵项。

### 4.2 探针脚本层的三个测量教训（非产品缺陷，已修正脚本）

1. **提交可见性**：皮肤 marker（activate 直接生效）早于 hero 更名（commit/notify/persist 之后）——读 hero 必须等卡片转 active（V6/V7/V8 各踩一次）。
2. **残留 token 断言要按值**：共享 token 词表下，切换后 body 上存在**新皮肤的活性覆盖层**，按"token 计数为零"断言会误报——正确断言是"无任何 token 携带旧皮肤的值"。
3. **DOM 归一化需经零激活校准**：宿主自身 churn（装饰类 `hHd-Xa_quietBars`、空 `style=""`、属性顺序）先在无激活状态测定并验证不含皮肤归属 token，再剥离。

---

## 5. 环境特性清单（T2.8 指引素材）

1. **设置落盘窗口**：configForms 写 API resolve ≠ 磁盘落盘；硬杀进程可丢最后一次写（V6 mtime 证据）。恢复重放因此可能恢复"上一次成功落盘"的选择——行为一致、无损坏。
2. **同规格 tarball 重装**：`pnpm add` 对相同 `file:` 规格跳过重装（"Already up to date"）——换包内容重装需 remove + add。
3. **link: 安装的残留形态**：remove 后空 symlink 目录留存（不参与 boot）；tarball（file:）安装物由 pnpm 自动剪净。
4. **全新 home 的 onboarding**：内测声明弹层（继续）会拦截 Playwright 点击，自动化需先关闭。
5. **宿主 DOM churn 词汇**：`hHd-Xa_quietBars`（装饰类）、空 `style=""`、标签内属性顺序——做 DOM 快照比对时先校准。

## 6. 结论

验证矩阵 V1-V11 在 0.1.7-rc.2 隔离环境作为一次完整战役实跑完成：**三包 tarball 安装链可用**、热切换零残留、持久化与恢复重放正确、跨标签页秒级收敛（暴露并修复一处真实缺陷后）、故障隔离与如实降级符合公约 §4.4、卸载回归与 V1 基线逐字节一致、用户真实 profile 零触碰（2547 条目起止零变化）、截图档案完备、两内置皮肤通过公约 §9 全部六问。`.verify` 结束态：五包已卸载、boot 复验通过、无遗留进程（战役全部 boot 已 `taskkill /F /T`；一台先于本战役存在的旧隔离 boot（端口 18777，9/25 19:03 启动）连同处置一并记录于 task-9 报告）。

---

# Phase 3 迁移皮肤实机验收（Task 11 / Phase3B，2026-09-26）

> 对 Phase3A 迁入的 3 款皮肤（trading 交易终端 / dragon-heir 龙的传人 / whale-song 鲸吟）按 PLAN §3.2 完成 S4（设置自治核对）与 S5（V5 残留断言 + V11 公约自检 + 截图存档）实机验收，并验证五皮肤全景（2 示例 + 3 迁移）在控制台的呈现与互斥切换。全程隔离环境（`.verify/dsh-home-t11`，全新 home；真实 profile `%USERPROFILE%\.dsh` 2547 条目起止零变化，快照 `.verify/audit-t11/real-dsh-snapshot-{start,end}.csv`）。
> **总判定：S4/S5 全部通过；实跑发现并修复一处迁移皮肤真实缺陷（activate 半途抛错泄漏，见 F11.1）。** 全仓 163 tests / lint / typecheck / build 绿。

## P3.0 环境与安装形态

- 宿主 `@deepseek-ai/dsh@0.1.7-rc.2`（`.verify/probe/` 钉死），DSH_HOME=`.verify/dsh-home-t11`（boot 自动初始化），端口 18601，Playwright 1.55 + msedge headless，Git Bash。
- 安装链（最接近发布形态）：6 包 `npm pack`（loader + 5 皮肤，`.verify/pkgs-t11/`）→ `npx dsh plugin --profile web add <tgz>` 逐包装入 → boot `boot-t11-fixed.log` 零 error/warn。
- 基线：空 home boot `boot-t11-v1.log`（1 行，零 error/warn）；结束态卸载后干净 boot 与基线 **token 归一化后逐字节一致**（`boot-t11-clean.log`），HTTP 栅栏行为一致（无 token 401 / 带 token 303）。

## P3.1 五皮肤全景（截图 29）

`29-panorama-five-skins-wall.png`：控制台**5 卡齐全、均 discovered 未激活**、hero=默认观感；对 5 款逐一断言页面零副作用（样式节点/body 标记/chrome DOM/data-URI favicon/scrim 变量全零）；S4 证据：aurora 卡有 settingsHint（设置 → 极光之夜）、3 款迁移皮肤卡片无 settingsHint（无设置不被区别对待，同 inkwash 先例）。浏览器 console error/warning 均为 0。

## P3.2 S4 设置自治核对（逐款）

| 皮肤 | 原皮肤是否有自定义设置逻辑 | 结论 | 实机证据 |
| --- | --- | --- | --- |
| trading | 无（vendored 产物零 localStorage/configForms；行情接口 `/settings` 是行情数据端点，非设置面） | **S4 不适用** | 卡片无 settingsHint（断言 `S4: aurora card offers its settings hint; migrated skins offer none`）；各包 README 记「S4 验收结论」 |
| dragon-heir | 无（主题双画跟随是观感行为，非用户设置） | **S4 不适用** | 同上 |
| whale-song | 无（`--dsw-skin-scrim` 为上游皮肤中心遗留**只读**通道，缺省 0 优雅降级） | **S4 不适用** | 同上 |

## P3.3 S5 逐款切换链 + V5 残留断言（截图 30-32，36/36 断言）

单页加载内完成 `default → skin → default` ×3（无刷新标记全程存活）；settled 截图 30（trading）/31（dragon-heir）/32（whale-song）。残留断言按 Phase3A 副作用映射表逐类（t11-switch.mjs，36/36）：

- **trading**：激活签名（body 标记 + 3 段 chrome DOM + 标题钉死 + 样式节点）→ 切走后 body 标记/样式节点/chrome/data-URI favicon 全零；**标题恢复**（钉死的「交易终端 · DeepSeek 在线」→ 原值）、favicon 集合与激活前一致、body 内联样式表逐项一致；**34s 定时器静默窗**（>30s 轮询周期 + >8s JSONP 自清理）：chrome 不复活、零行情脚本、零标记——定时器确已清除；DOM 快照（归一化、经 churn 校准）激活前 vs 恢复后逐字节一致。
- **dragon-heir**：激活签名（标记 + fixed 定位 WebP 背景层 + 龙印 favicon）→ 切走后全零 + favicon 集合还原；**实机验证观察器活性**：激活期间翻转 `data-ds-dark-theme` 背景画实时换图（observer 生效证明）；切走后同翻转零反应（**observer 已断开**）；DOM 快照一致。
- **whale-song**：激活签名（标记 + body 内联背景 + PNG favicon）→ 切走后全零；**body 内联样式 round-trip 还原**（逐属性与激活前一致）；切走后主题翻转零反应；DOM 快照一致。

（环境噪声记录：trading 激活期间对宿主同源可选服务 `/longbridge/panel/snapshot`（405）与 `/plugins/dsh-ticker/api/settings`（404）的探测失败是上游 best-effort 降级设计（占位渲染），非控制台缺陷；已在证据脚本按 URL 过滤并在此留痕。）

## P3.4 互斥全景混切（截图 33-34，25/25 断言）

`aurora → trading → inkwash → dragon-heir → whale-song → default` 连续热切换（示例皮肤 × 迁移皮肤交叉混切）：每跳**恰一卡 active**（全局互斥）、上一款全归零（标记/样式/chrome/favicon 差集探针）、无刷新、无警告横幅；恢复默认后五款全零 + 主题层完全退场（零 token、无暗色标记、偏好轴恒 system）。

## P3.5 故障抽查（trading，截图 35-36；发现并修复缺陷 F11.1）

激活中期注入抛错（在 vendored apply 的副作用全部挂好之后、disposer 注册之前——上游最坏的失败形态）：加载器行为正确（行内错误原文、fault 徽标、回滚默认），**但修复前迁移皮肤泄漏半套副作用**：

**F11.1（缺陷）**：trading activate 半途抛错后 body 标记、样式节点、3 段 chrome、data-URI favicon、钉死的标题全部残留（34s 窗口内不消失）；dragon-heir / whale-song 结构同构，同暴露。

- **修复**（三包 session.ts 对称小改，`fix(skins)` commit）：激活改为**事务化**——① abort 监听先于 apply 注册；② apply 前快照本皮肤自有命名空间锚点（chrome 节点 / data-URI favicon / body 激活标记 / whale 的 5 项 body 内联背景属性），注册**差集**清扫兜底 disposer（只撤激活期间新增者，宿主与其它皮肤节点永不触碰——R2/R3）；③ trading 另在同步 apply 窗口临时包裹全局 `setInterval` 捕获轮询句柄（finally 恢复原函数），失败路径清掉未及登记 disposer 的裸定时器；④ apply 抛错 → teardown + 标题还原（仅同步失败窗口内）→ 原样上抛。成功路径下差集清扫与上游 disposer 幂等重叠（双保险）。
- **测试**：三包各增「mid-apply failure rolls the partial activation back — zero residue」+「stays activatable after a failed activation」，先红后绿；全仓 163 tests 绿（157 → 163）。
- **复验**（修复构建重装后，`35-trading-fault-error-fixed.png`/`36-post-fault-recovery-aurora-fixed.png`）：12/12 断言——行内错误、回滚默认、**零残留**（标记/样式/chrome/favicon/标题全还原）、34s 定时器静默、故障不传染（aurora 随后干净激活并完整退场）。

## P3.6 V11 公约 §9 六问 × 3 款

> 佐证 = 代码位置 + P3.x 实机断言。（六问原文见公约 §9；aurora/inkwash 先例答案在 §3.11。）

**① 未激活时除了登记元数据什么都不做？（R1）— 三款 ✅**：三包 `src/client/index.ts` 的 apply 只 registerSkin + `ctx.effect(unregister)`；一切副作用在 activate（`src/client/session.ts`）。实机：P3.1 全景零副作用断言（安装后未激活零 marker/style/chrome/favicon）。

**② deactivate 后与从未激活时逐像素一致？（§4.3）— 三款 ✅**：会话账本逆序撤销 + 幂等 teardown + abort/fiber 安全网（session.ts）。实机：P3.3 归一化 DOM 快照激活前 vs 恢复后逐字节一致（比「恢复原值」更强）+ favicon 集合/标题/body 内联样式逐项一致。

**③ 没碰加载器保留面、其他皮肤、宿主恢复面？（R2/R3/R4）— 三款 ✅**：自有标记（`src/markers.ts` 的上游自有 body/style/chrome 标记）与 `usl-`/宿主 class 不重叠；差集清扫只按自有锚点（session.ts 补齐 2 注释）。实机：P3.4 混切每跳差集探针 + 终态五款全零。

**④ 没依赖任何 CSS-module hash / 私有 DOM / HMR 内部？（R5）— 三款 ✅**：上游 CSS-module 哈希类名（`Ra1MMG_*`）作为观感内容成对迁移、自洽封闭；DOM 触达仅 body/head 标准面 + `data-ds-dark-theme`（aurora 先例明示容忍的唯一宿主属性）。实机：全部 Playwright 断言经自有标记（`data-dsh-*`/`data-plugin-css`/`data-skin-chrome`）定位。

**⑤ 不自己记住激活状态、不自启？（R6）— 三款 ✅**：激活唯一入口 = 加载器 switchTo；皮肤零持久化逻辑。实机：恢复重放由加载器承担（T2.7 V6 先例），本战役 P3.3 每款激活均由控制台点击发起。

**⑥ 没启停或改写任何其他插件？（R7）— 三款 ✅**：无插件清单/patch 配置写；trading 的行情拉取只读公共行情端点。实机：P3.5 故障注入下其余皮肤与宿主功能不受影响（故障不传染断言）。

## P3.7 结束态

六包卸载（`dsh plugin --profile web list` 空）→ 干净 boot 与 V1 基线 token 归一化 diff 为空、零 error → 全部 boot 进程 `taskkill /F /T`，端口 18601 无监听（仅 TIME_WAIT）→ 真实 `.dsh` 2547 条目起止零变化。战前即存在的无关 node 进程（9router 6100、`D:/dsh-verify` 旧隔离 boot 21512，4:23 启动，早于本战役 8:06）未触碰、在此留痕。

## P3.8 截图档案（`.verify/shots/`，接续编号 29-36）

| 文件 | 内容 |
| --- | --- |
| 29-panorama-five-skins-wall.png | 五皮肤全景：5 卡齐全、均未激活（宣发口径素材） |
| 30-trading-active-settled.png | 交易终端激活 settled（跑马灯 + 标题栏 + 状态栏） |
| 31-dragon-heir-active-settled.png | 龙的传人激活 settled（龙画背景层） |
| 32-whale-song-active-settled.png | 鲸吟激活 settled（非具象渐变海景，R13 后形态） |
| 33-mixed-chain-inkwash-hop.png | 互斥混切第 3 跳（inkwash 接管） |
| 34-mixed-chain-back-to-default.png | 混切后恢复默认（五款零残留） |
| 35-trading-fault-error-fixed.png | 修复后故障抽查：行内错误 + fault 徽标 + 零残留 |
| 36-post-fault-recovery-aurora-fixed.png | 故障后恢复：aurora 干净激活 |

（另有修复前泄漏证据 `35-trading-fault-error-prefix.png` / `36-post-fault-recovery-aurora-prefix.png`，与 F11.1 记录对照留存。）

证据脚本：`.verify/pw/t11-{lib,boot-baseline,serve,wall,switch,mixed,fault}.mjs`；boot 日志 `.verify/boot-t11-{v1,panorama,fault,fixed,fault2,clean}.log`；路径审计 `.verify/audit-t11/`。

# M1 皮肤迁移版本（v1.1.0）发布验证（2026-09-26）

范围：皮肤包从 5 款扩到 13 款（新增 blue-fantasy / maid-atelier / miku / minecraft / qq98 / ths / xp / deep-whale-day-night），发布 14 个 tarball。本节记录**本次实跑**的验证；v1.0.0 的实机矩阵（V1-V11）与 Phase 3 五皮肤实机验收仍是 0.1.7-rc.2 上的实机证据，本版新增七款皮肤的实机验收**未执行**（见 M1.6）。

## M1.0 环境

- 工作区：`D:\丰富履历专用文件夹\皮肤管理插件\loader`（本地 clone），既有未提交改动保留。
- Node `v24.11.1`、pnpm `11.7.0`、Windows 10.0.22000。
- 本机**无 `dsh` CLI**，因此本轮不含实机安装/boot 验证；tarball 链路以「打包 + 内容冒烟 + 产物加载冒烟」替代，实机部分明确标注为未执行。

## M1.1 全仓命令实跑

| 命令 | 结果 |
| --- | --- |
| `pnpm install` | lockfile 与 workspace 一致，通过供应链策略校验（删除半成品包后 importer 已刷新） |
| `pnpm typecheck` | 14/14 包 `Done`，零错误（退出码 0） |
| `pnpm lint` | 14/14 包 `Done`，零 error/warning（退出码 0） |
| `pnpm test` | **204 tests / 204 pass / 0 fail**，14 包（loader 112 + aurora 21 + dragon-heir 13 + whale-song 13 + trading 12 + inkwash 9 + 其余 7 包各 3） |
| `pnpm build` | 14/14 包 `built lib/index.js + lib/client.js`（退出码 0） |

## M1.2 跨包发布契约测试（failing-first）

新增 `packages/loader/src/manifest.test.ts`（9 条断言，随 `pnpm test` 常驻守门）：包名 / 皮肤 id / body marker 全局唯一、`files` 必须显式含 `LICENSE`/`NOTICE`/`THIRD-PARTY-NOTICES.md`、`license` 必须形如合法 SPDX 表达式、行 id 与 `cordis.patch.yml` 插入行及 `src/identity.ts` 常量三处一致、加载器包必须声明许可并随包附许可文本。

**先失败后修复**（修复前实跑，6 条失败）：

```text
✖ skin package names are globally unique — duplicate package names: [["@dsh-eac/skin-maid-atelier",["deep-whale-day-night","maid-atelier"]]]
✖ covenant skin ids are globally unique — duplicate skin ids: [["dsh-eac.skin.maid-atelier",["deep-whale-day-night","maid-atelier"]]]
✖ every license field is a well-formed SPDX expression — deep-whale-day-night: "CC BY-NC-SA-4.0" is not a well-formed SPDX expression
✖ skin body markers are unique — body markers collide across skins: [["data-dsh-maid-atelier",["deep-whale-day-night","maid-atelier"]]]
✖ settings row id matches cordis.patch.yml — deep-whale-day-night: cordis.patch.yml must insert row id dsh-eac-skin-deep-whale-day-night
✖ the loader package declares a license and ships its text — packages/loader/package.json must declare a license
```

修复后 9/9 通过。SPDX 判定另用真实解析器复核：`spdx-expression-parse@4.0.0` — `CC BY-NC-SA-4.0` INVALID（offset 0），`MIT AND CC-BY-NC-SA-4.0` VALID；`CC-BY-NC-SA-4.0` 在 `spdx-license-ids@3.0.22` 清单内。

## M1.3 溯源核验（逐 blob 比对上游对象）

取材快照（`.verify/legacy-skins/dsh-desktop/assets/skins/**`，73 个文件）逐个按 Git blob（`sha1("blob <len>\0" + bytes)`）与 DSH-EAC/DSH-Desktop-EAC 提交 `26841f5ee83c154a9768cc0a9cec1d70078f0ddf` 的树对象比对：

- **71/73 逐字节命中**；差异 2 个为 `maid-atelier/LICENSE`、`maid-atelier/NOTICE`，仅 CRLF 行尾差异（21288 vs 20850、1350 vs 1325 = 行数差）。
- 十款迁移皮肤的 `lib/client.js` blob **全部命中**（含 v1.0.0 三款）。
- 许可文本保真：六款 dsh-web-ui 皮肤的 `NOTICE` 与上游 `dsh-desktop/assets/skins/dsh-skins-LICENSE.txt`（blob `fd674136…`）逐字一致，且该全文内嵌于各包 `THIRD-PARTY-NOTICES.md`；maid-atelier 的 `NOTICE` 与上游 `NOTICE`（blob `c127b9dc…`）逐字一致，CC BY-NC-SA 4.0 全文与上游 `LICENSE`（blob `7cdbe0b4…`）逐字一致。
- **更正**：七款新迁移皮肤 `THIRD-PARTY-NOTICES.md` 此前把 `df8afc65ee64333abb9a26942f386ed820df7f92` 标为「Source tree」。该值实为同仓后续提交（`feat(v6/task-3.1)`，2026-09-14T11:57:56Z）；其 `dsh-desktop/assets/skins` tree 与取材 commit 同为 `2a243cf86e541a8b635191a1f5df017a47ab81d2`。现已改为逐包 subtree/blob SHA + 不可变取件 URL，内容结论不变。
- 上游包许可声明核对：`@linxin666/dsh-client-ui-skin-*` 0.1.11 的 `package.json` 声明 `BSD-3-Clause`；`@dsh-external/dsh-client-ui-skin-maid-atelier` 0.0.1 声明 `CC-BY-NC-SA-4.0` 且 `private: true`。七款新皮肤 TPN 已按上游实际声明更正措辞。

## M1.4 打包与产物冒烟

- `npm pack` × 14 → `dist/*.tgz` + `dist/SHA256SUMS.txt` + `dist/release-manifest.json` + `dist/RELEASE-MANIFEST.md`（含 URL / 取材 commit / subtree / blob / SHA-256）。
- **必含文件冒烟 14/14 通过**：每个 tarball 必须含 `package.json`、`lib/index.js`、`lib/client.js`、`cordis.patch.yml`、`README.md`、`THIRD-PARTY-NOTICES.md`、`LICENSE`、`NOTICE`；声明了 `preview` 的包必须含预览图（7 包各 2 张）。
- **产物加载冒烟 14/14 通过**（`ModuleLoader` 桩 + 宿主 baseline 模块表桩）：每个 host 半 `lib/index.js` 可在 Node 直接 import 且导出 `apply`（loader 另导出 `Config` schema，aurora 导出 `Config`）；每个 client 半 `lib/client.js` 的 graph 行 id == 包名，工厂返回 `apply`/`inject`，`apply(stubCtx)` 在**无 DOM** 环境下为 13 款皮肤各登记且仅登记一个 `apiVersion == dsh.ecosystem.ui-skin-loader/v1` 的皮肤，并带 `activate`/`deactivate`。
- 冒烟同时记录 client bundle 请求的宿主 baseline 模块：仅 `react`、`react/jsx-runtime`（与 `CLIENT_EXTERNAL` 声明一致，无越界依赖）。

## M1.5 deferred（未纳入本发布）

- **dsh-theme-endfield**（`ymh0000123/dsh-theme-endfield@82655a04f6b3249daa7d8a86ab956dd62a6c17cc`）：完整 host/client 插件（host 半常驻音频通知运行时 + 诊断落盘；client 半自带设置分区 UI 与等高线渲染器），设置命名空间绑定自身 profile 行 id `theme-endfield`。需要独立功能插件/设置命名空间方案，未创建文件。

`deep-whale-day-night` 已在最终状态完成迁移，使用唯一 id `dsh-eac.skin.deep-whale-day-night` 与 `data-dsh-deep-whale-day-night` namespace；原始 CC BY-NC-SA 4.0 LICENSE/NOTICE 随包保留。

## M1.6 Known limitations（本版）

- 新增七款皮肤**未做实机验收**（本机无 `dsh` CLI；实机矩阵需 0.1.7-rc.2 隔离环境）。其证据等级为：typecheck / lint / 单元测试 / 构建 / 打包 / 产物加载冒烟。
- dsh-theme-endfield 未纳入，理由见 M1.5；deep-whale-day-night 已完成固定来源迁移。
- 迁移皮肤的 vendored 产物为上游逐字节内容（除文件头、`export` 形态与 CSS 注入点搬迁），其行为等价性由各包内容锁测试与加载冒烟保证，尚未由实机视觉比对确认。
