# HANDOVER — CI 四平台安装包矩阵（PR #406）

**交接时间**：2026-09-23
**分支**：`codex/staged-windows-artifact`（跟踪 `origin/dev`）
**HEAD**：`fed3e05730b695141de257f531ec762577e539d4`
**PR**：<https://github.com/DSH-EAC/DSH-Desktop-EAC/pull/406>（OPEN）
**版本基线**：6.0.0（`dsh-desktop/package.json`、`tauri-shell/Cargo.toml`、
`tauri-shell/tauri.conf.json` 三处一致）

---

## 0. 一页速览（接手者先读这里）

1. **任务目标**：PR 目标分支为 `dev`/`main` 时（以及手动 `workflow_dispatch`），
   在十二项测试全部通过**之后**构建 Windows/Linux 双架构安装包，产物上传为
   GitHub Actions artifact，供下载到虚拟机做实机安装测试。
2. **当前状态**：十二项测试全绿；**Windows x64 与 arm64 安装包已构建成功**；
   **Linux x64 与 arm64 失败**，失败点在 AppImage 打包阶段 → 两个 Linux
   artifact 为空（上传步骤排在 `tauri build` 之后，构建失败即无产物）。
3. **唯一卡点**：`linuxdeploy` 扫描 staged 树里的 **musl 版 `system.node`** 时
   `ldd` 失败，linuxdeploy 进程直接 abort（`failed to run ldd: exited with code 1`）。
4. **已排除**：FUSE 限制、缺 `libfuse2`、缺 `APPIMAGE_EXTRACT_AND_RUN`、
   Linux 完全没适配 —— 这些都不是原因，详见 §5。
5. **下一步**：修 Linux staging 的二进制裁剪（或 Linux 先只产 `deb`），再跑一轮
   PR CI，四个 Installer job 全绿才算阶段完成。
6. **尚未开始**：虚拟机实机安装验收。**至今没有在任何机器上装过这次的安装包。**

> **2026-09-23 更新**：Linux 裁剪已按 §5.4 落地（staging 剔除 musl 变体 +
> 三层防回归闸门），定向测试 62 项通过。**尚未推 CI 验证** —— Linux 打包只能
> 在 Linux runner 上跑，本机是 win32，`stage-resources.mjs` 有交叉打包护栏。
> 判据仍是四个 Installer job 全绿。

---

## 1. 本次改动内容（分支上的提交）

| commit | 说明 |
| --- | --- |
| `61060e9a` | ci: upload Windows staged runtime artifact |
| `86009d74` | ci: build Windows installer artifacts |
| `b6ac8b72` | fix(packaging): 补齐便携包皮肤管理器资源 |
| `978c6bd5` | ci: 等待十二项测试后构建四平台安装包 |
| `fed3e057` | ci: 输出 Tauri 打包详细日志 |

文件级改动：

- **`.github/workflows/ci.yml`**
  - `pull_request` 触发器**去掉了 `paths` 过滤**（PR 一律跑 CI）。`push` 的
    `paths` 过滤保留不变。
  - 新增 `packages` job：`needs: [source-and-unit, rust-shell, staged-runtime]`，
    `if: github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'`，
    `uses: ./.github/workflows/staged-runtime-artifact.yml`。
    → 效果：测试没全过就不会打包；`push` 到 `dev`/`main` 只跑测试。
- **`.github/workflows/staged-runtime-artifact.yml`**（新文件，仅 `workflow_call`）
  - 矩阵四平台；流程 = fetch-kernel → `npm run ci:install` → `npm run fetch-runtime`
    → stable Rust → Linux 依赖 → `cargo fetch --locked`
    → `stage-resources.mjs --target=... --skip-npm` → `verify-staged-runtime.mjs`
    → `npx -y @tauri-apps/cli@2 build --verbose`（`APPIMAGE_EXTRACT_AND_RUN=1`）
    → Windows 专有 `make-portable.mjs` → 上传 artifact（保留 7 天）。
- **`tauri-shell/make-portable.mjs`**
  - 补上 `ui-skin-manager` 资源的复制，并在 ZIP 产物内校验
    `ui-skin-manager/resolved/system.default/snapshot.json` 存在
    （此前便携包缺该资源，属已修的 P2 问题）。

---

## 2. 产物规格（谁能下、下到什么）

| 平台 | runner | artifact 名 | 内容 | 状态 |
| --- | --- | --- | --- | --- |
| Windows x64 | `windows-latest` | `dsh-eac-windows-x64-installers` | NSIS `.exe` + 便携 `.zip` + `SHA256SUMS.txt` | 已产出 |
| Windows arm64 | `windows-11-arm` | `dsh-eac-windows-arm64-installers` | 同上 | 已产出 |
| Linux x64 | `ubuntu-22.04` | `dsh-eac-linux-x64-installers` | `.deb` + `.AppImage` | 构建失败，无产物 |
| Linux arm64 | `ubuntu-22.04-arm` | `dsh-eac-linux-arm64-installers` | `.deb` + `.AppImage` | 构建失败，无产物 |

artifact 保留 **7 天**，下载方式二选一：

- 网页：进对应 run 页面 → 底部 Artifacts 区。
- 命令行：`gh run download <run-id> --repo DSH-EAC/DSH-Desktop-EAC -n dsh-eac-windows-x64-installers`

**需要知道的一个细节**：`tauri-shell/tauri.conf.json` 的 `bundle.targets` 数组里
只写了 `nsis` 一项。Linux 上出现的 `.deb` / `.AppImage` 来自 Tauri CLI 的平台默认
集合，不是项目显式配置的。若要在 Linux 上只出 `deb`，需要显式传 `--bundles deb`
（或加 Linux 覆盖配置）。

---

## 3. 触发条件（怎么让它跑起来）

| 事件 | 是否跑十二项测试 | 是否构建安装包 |
| --- | --- | --- |
| PR 目标 `dev` / `main` | 是 | 是（测试全绿后） |
| `push` 到 `dev` / `main` | 是（带 `paths` 过滤） | 否 |
| `workflow_dispatch` 手动 | 是 | 是 |

其他：`concurrency` 组按 PR 号/ref 分组，`cancel-in-progress: true`，同 PR 连推会
取消上一轮。`packages` job 依赖 `source-and-unit` + `rust-shell` + `staged-runtime`
三个 job（共十二项矩阵任务），任一失败则打包不启动。

---

## 4. 最新一轮 CI 结果（run `35749246944` @ `fed3e057`）

run 页面：<https://github.com/DSH-EAC/DSH-Desktop-EAC/actions/runs/35749246944>

| job | job id | 结果 |
| --- | --- | --- |
| Node source and unit tests (windows/arm64) | 106818746439 | success |
| Node source and unit tests (linux/arm64) | 106818746683 | success |
| Node source and unit tests (windows/x64) | 106818746745 | success |
| Node source and unit tests (linux/x64) | 106818746766 | success |
| Rust shell (linux/x64) | 106821176373 | success |
| Staged runtime and isolated boot smoke (linux/x64) | 106821176430 | success |
| Staged runtime and isolated boot smoke (windows/arm64) | 106821176466 | success |
| Rust shell (windows/arm64) | 106821176485 | success |
| Rust shell (windows/x64) | 106821176486 | success |
| Staged runtime and isolated boot smoke (windows/x64) | 106821176493 | success |
| Rust shell (linux/arm64) | 106821176494 | success |
| Staged runtime and isolated boot smoke (linux/arm64) | 106821176528 | success |
| Installer packages / Installer (windows/arm64) | 106826393058 | **success** |
| Installer packages / Installer (windows/x64) | 106826393168 | **success** |
| Installer packages / Installer (linux/x64) | 106826393142 | **failure** |
| Installer packages / Installer (linux/arm64) | 106826393110 | **failure** |

结论：**前置十二项测试这项任务目标已达成**；打包环节 Windows 侧已完整跑通，
Linux 侧卡在 AppImage。

---

## 5. Linux 失败根因（已用 `--verbose` 日志定位）

### 5.1 x64（job 106826393142，16:08:38）

```text
Running [tauri_bundler::utils] Command `/home/runner/.cache/tauri/linuxdeploy-x86_64.AppImage --appimage-extract-and-run --verbosity 1 --appdir ... --plugin gtk --output appimage`
Deploying dependencies for ELF file .../Deepseek Harness EAC.AppDir/usr/lib/Deepseek Harness EAC/dsh-desktop/node_modules/@deepseek-ai/node-addon-system-linux-x64/bin/musl/system.node
terminate called after throwing an instance of 'std::runtime_error'
failed to bundle project: `failed to run /home/runner/.cache/tauri/linuxdeploy-x86_64.AppImage`
```

### 5.2 arm64（job 106826393110，16:07:36 – 16:07:52）

```text
Bundling [tauri_bundler::bundle::linux::debian] Deepseek Harness EAC_6.0.0_arm64.deb (...)   ← .deb 已成功
Running [tauri_bundler::utils] Command `/home/runner/.cache/tauri/linuxdeploy-aarch64.AppImage --appimage-extract-and-run ...`
WARNING: ELF file .../node_modules/@vscode/ripgrep-linux-arm64/bin/rg is not dynamically linked, skipping   ← 非致命
Deploying dependencies for ELF file .../node_modules/@deepseek-ai/node-addon-system-linux-arm64/bin/musl/system.node
terminate called after throwing an instance of 'std::runtime_error'
  what():  Failed to run ldd: exited with code 1
failed to bundle project: `failed to run /home/runner/.cache/tauri/linuxdeploy-aarch64.AppImage`
```

**注意**：arm64 日志里紧邻出现的 `ERROR: Call to patchelf failed: patchelf: cannot
find section '.dynamic'` 属于**前一条 ripgrep 的告警**（linuxdeploy 已
`skipping`），不是致命项。真正让进程 abort 的是紧随其后的 musl `system.node`
那条 `Failed to run ldd`。x64 与 arm64 的致命项同源。

### 5.3 为什么现有的裁剪没挡住它

- `tauri-shell/stage-platform-prune.mjs` 的 `pruneLinuxPayloads` 只删两类文件：
  `.exe`/`.dll`，以及**不是**本架构 Linux ELF 的 `.node`。musl 的
  `system.node` 架构正确，命中不了。
- `tauri-shell/stage-resources.mjs` 的 `pruneMuslPackages` 只删**包名**里带
  `linuxmusl` 的目录（例如 `koffi-linux-x64` 下的 `musl_x64`）。而
  `@deepseek-ai/node-addon-system-linux-x64/bin/musl/system.node` 是按**子目录名**
  区分的，规则不命中。

结果：musl 静态链接的 `.node` 进包 → linuxdeploy 对它调 `ldd`/`patchelf` →
进程抛 `std::runtime_error` 中止 → 整个 AppImage 打包失败。

### 5.4 修复（已落地，待 CI 验证）

裁剪点选在 **staging 装配期**，与既有的 `pruneMuslPackages` /
`koffi musl_<arch>` 同层，不动 `@deepseek-ai/*` 已安装包源码：

- `tauri-shell/stage-platform-prune.mjs`：新增 `pruneMuslNodeAddonBinaries`，
  删除 `@deepseek-ai/node-addon-system-linux-*/bin/musl/`；剔除前先断言
  `bin/glibc/system.node` 仍在，否则抛错（避免删成运行时缺件）。
- `tauri-shell/stage-resources.mjs`：Linux 目标分支调用该函数。
- `dsh-desktop/scripts/verify-staged-runtime.mjs`：Linux 上复查载荷里没有
  `bin/musl/`，作为打包前的最后一道闸门。
- `tauri-shell/audit-linux-bundle.mjs`：musl 判定补上裸 `musl` 目录段
  （原先只看 `musl_`/`linuxmusl`，这正是本次漏网的原因）。
- 回归测试：`test/stage-platform-prune.test.ts`（+3）、
  `test/linux-bundle-audit.test.ts`（+2）。

**为什么删 musl 那份是安全的**：`node-addon-system` 运行时按
`process.report.header.glibcVersionRuntime` 二选一加载（内核
`native/system/packages/entry/src/flock.ts`）。发行目标是 glibc 的 deb/AppImage/RPM，
`glibcVersionRuntime` 必然存在，只会加载 `bin/glibc/system.node`，musl 那份
永远不可达。官方 npm tarball 已核对：`bin/` 下是 `landlock-run`（静态 launcher）、
`glibc/system.node`、`musl/system.node` 三件，删 `musl/` 不影响前两者。

### 5.5 已评估并否定的假设（别再重复走）

1. **ARM runner 没有 FUSE** —— 不成立：x64 同样失败，两者报错同源。
2. **少 `libfuse2` / 少 `APPIMAGE_EXTRACT_AND_RUN=1`** —— 不成立：workflow
   已装 `libfuse2`，`APPIMAGE_EXTRACT_AND_RUN=1` 已设置在
   `Build Tauri installers` 步骤上，日志里能直接看到 `--appimage-extract-and-run`。
   炸点在 `ldd`/`patchelf`，跟 FUSE 无关。
3. **用户提供的 `deepseek_text_20260922_e10cd1.md` 方案**（装
   `libfuse2`/`squashfs-tools`/`patchelf`/`fuse` + `APPIMAGE_EXTRACT_AND_RUN=1` +
   `NO_STRIP=1`）—— 不采纳：依赖项已满足，`NO_STRIP` 与本错误不对应；其示例
   workflow 也不适配本项目（tag 触发、Node 20、只做 ARM64/AppImage、附签名密钥），
   且项目里没有 `npm run tauri` 这个脚本。
4. Node 20 deprecation 警告、cache miss、`patch-deps` 提示 —— 与本次失败无关。

---

## 6. 下一步（建议按序执行）

1. **修 Linux staging 裁剪**（首选）：在 Linux 目标下把
   `@deepseek-ai/node-addon-system-linux-*/bin/musl/` 一并裁掉，并在
   `dsh-desktop/scripts/verify-staged-runtime.mjs` 里加一条断言防止回归。
   动手前先确认两件事：该包内 glibc/musl 两个子目录的实际布局，以及运行时是按什么
   规则选其一（**不要**直接删掉运行时实际会加载的那份）。
   备选方案：Linux 侧先只产 `deb`（`npx -y @tauri-apps/cli@2 build --bundles deb`）。
   arm64 日志已证实 `.deb` 能成功打包，这条路当天就能拿到 Linux 产物；
   AppImage 单独另开一项跟进。
2. **再跑一轮 PR CI**：往分支推一次 commit 即可（PR 触发无需额外操作，也可在
   Actions 页面点 “Run workflow” 手动触发）。**判据：四个 Installer job 全绿。**
3. **之后才是虚拟机实机安装验收**：下载 artifact → 装 NSIS `.exe` / 解压便携
   `.zip` / 装 `.deb` → 起壳 → 跑 boot smoke。**当前完全未做，这一项是空白。**

---

## 7. 复现与验证命令

```powershell
# PR 与 CI 状态
gh pr view 406 --repo DSH-EAC/DSH-Desktop-EAC
gh run view 35749246944 --repo DSH-EAC/DSH-Desktop-EAC --json jobs --jq '.jobs[] | [.databaseId,.name,.conclusion] | @tsv'

# 拉失败 job 的完整日志（自己过滤）
gh run view --repo DSH-EAC/DSH-Desktop-EAC --job 106826393142 --log

# 下载已成功的 Windows 安装包做实机测试
gh run download 35749246944 --repo DSH-EAC/DSH-Desktop-EAC -n dsh-eac-windows-x64-installers
```

本地静态检查：

```powershell
git diff --check
node --check tauri-shell/make-portable.mjs
```

本地手动走一遍打包三段链（Windows 已实测可跑通）：

```powershell
node tauri-shell/stage-resources.mjs --target=win32 --skip-npm
node dsh-desktop/scripts/verify-staged-runtime.mjs
cd tauri-shell; npx -y @tauri-apps/cli@2 build
cd tauri-shell; node make-portable.mjs --out target/release/portable
```

---

## 8. 未完成项清单（交给下一个人）

- [ ] Linux x64 / arm64 安装包尚未产出（卡在 AppImage / linuxdeploy）——
      修复已落地，**待推 CI 验证**（见 §5.4）。
- [ ] 四平台 artifact **都没做过虚拟机实机安装验收**。
- [ ] PR #406 未合并。
- [ ] `tauri.conf.json` 的 `bundle.targets` 只写 `nsis`，Linux 目标是隐式默认值 ——
      要不要显式化，等 Linux 打包方案定下来一起决定。

## 9. 工作区注意事项

以下未跟踪文件**不是本次改动**，属既有内容，勿删勿提交：
`.pnpm-store/`、`.tmp-kernel-build/`、`dsh-mojobox/`、
`tauri-shell/sidecar/phone-bridge.js`、`tauri-shell/sidecar/rescue-integration.js`。

本分支改动未合入 `dev`，推送/合并需用户明确指示。
