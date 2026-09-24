# Release 工作流（从 CI artifact 发布）

`.github/workflows/release.yml`：把「Minimal core CI」已经构建好的四平台安装包
取过来，发布成 GitHub Release。**不在发布链路上重新构建**。

## 为什么不能自动发布

发布是对外且不可逆的动作。本仓库刻意**不接** `push: tags` 之类的自动触发：
一次误推 tag 就会把安装包公开出去。因此只有 `workflow_dispatch`（手动触发），
tag、标题、pre-release 标识全部由触发者在表单里显式填写。

## 触发步骤

1. 先让目标提交上的 CI 四平台全绿（`Installer (windows/x64)`、`windows/arm64`、
   `linux/x64`、`linux/arm64` 四个 job）。
2. Actions → **Release from CI artifacts** → *Run workflow*，填写：

| 输入 | 必填 | 说明 |
| --- | --- | --- |
| `tag` | 是 | 发布 tag，如 `v6.0.0`。已存在则沿用；不存在则建在来源 CI 的提交上。原样使用，不做任何规范化。 |
| `title` | 否 | Release 标题；留空用 `tag`。 |
| `prerelease` | 是 | 是否标记为 pre-release。默认 `true`（默认保守）。 |
| `source_run_id` | 否 | 来源 CI 的 run id（Actions 页面 URL 里的那串数字）。留空则按 `tag` 的提交反查最近一次成功 run——**要求 tag 已存在**。 |

> `source_run_id` 是最不容易出错的方式：直接把 Actions URL 里的 run id 复制过来。

3. 注意：`tag` 尚不存在时**必须**填 `source_run_id`——没有 tag 就无法反查提交，
   工作流会直接失败并说明这一点。tag 已存在时才可以留空。

## 发布前会被卡住的四类情况

解析步骤（`dsh-desktop/scripts/resolve-release-source.mjs`）在任何写操作之前完成校验，
任一不满足就失败，并在日志里给出可操作的原因：

1. **来源 run 不是成功状态** —— `conclusion` 必须是 `success`，且来自 `ci.yml`。
2. **tag 与提交不一致** —— tag 已存在时，其提交必须与来源 run 的 `head_sha` **完全相同**。
   发布物与被验证的代码必须是同一份提交。
3. **安装包 artifact 不齐** —— 四个平台缺一不可（某平台构建失败、或
   `retention-days: 7` 到期被清理都会如此）。
   **注意时效：CI 通过后要尽快发布，超过 7 天产物就没了。**
4. **tag 字面量非法** —— 只接受 `[A-Za-z0-9._+/-]`、不能以 `-`/`.` 开头、
   不得含 `..`、不得以 `.lock`/`.`/`/` 结尾。不合规直接拒绝，不做「修复」。

## 发布内容

- 归集（`collect-release-assets.mjs`）会把四个 artifact 平铺成一个资产集合。
  Windows x64 与 arm64 的便携包、`SHA256SUMS.txt` **同名**，因此重名项统一加
  `-<os>-<arch>` 后缀；同名静默覆盖是这里最主要要防的错误。
- 额外产出：`SHA256SUMS.txt`（对最终资产名取校验和）、`release-manifest.json`
  （每个资产的来源 artifact、原路径、字节数、sha256）、`RELEASE-NOTES.md`。
- 上传后**回读远端**（`gh release view`）核对资产名与字节数，把「上传成功」
  变成「远端确实有这套资产」。对不上就报错。
- 重跑同一 tag 是安全的：`gh release edit` + `gh release upload --clobber`。

## 重跑语义

| 情况 | 行为 |
| --- | --- |
| tag 不存在 | `gh release create <tag> --target <来源 sha>` 建 tag 与 Release |
| tag 已存在、Release 不存在 | 建 Release，沿用该 tag |
| tag 与 Release 都存在 | `gh release edit` 更新标题/pre-release 状态，资产按名覆盖 |

## 边界（本工作流不负责的事）

- **不做安装/启动验证**。发布链路上只做「取 CI 产物 → 发布」；实机安装验收是独立环节，
  不因为这里绿灯而被视为已完成。这一点写在生成的 release notes 里。
- **不做 macOS**。当前 CI 只构建 Windows 与 Linux 安装包。
- 不修改 `ci.yml`，也不影响既有 PR 门禁。

## 相关文件

| 文件 | 作用 |
| --- | --- |
| `.github/workflows/release.yml` | 工作流本体（手动触发 → 解析 → 发布 → 回读核对） |
| `.github/workflows/staged-runtime-artifact.yml` | 安装包的实际构建处（本工作流取它的产物） |
| `dsh-desktop/scripts/release-artifacts.mjs` | 四个 artifact 的名字/模板/平台归属（唯一真相） |
| `dsh-desktop/scripts/resolve-release-source.mjs` | 来源解析与全部发布前校验（只读） |
| `dsh-desktop/scripts/collect-release-assets.mjs` | 资产归集、重名消解、清单与校验和、远端核对 |
| `dsh-desktop/scripts/write-release-notes.mjs` | 生成 release notes |
| `dsh-desktop/test/release-workflow.test.ts` | 上述不变量的回归测试 |
