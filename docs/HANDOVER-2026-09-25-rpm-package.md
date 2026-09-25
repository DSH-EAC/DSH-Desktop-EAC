# Linux RPM 安装包接入记录

日期：2026-09-25

Issue：[#414](https://github.com/DSH-EAC/DSH-Desktop-EAC/issues/414)

分支：`feature/414-rpm-package-support`

## 目标

在现有 Tauri Linux 构建链中增加 RPM 安装包，面向 Fedora、openSUSE 等 RPM 系发行版，
并保持 deb、AppImage 和 Windows 分发流程不变。

## 实现

- `tauri-shell/tauri.linux.conf.json` 显式启用 `rpm` bundle target。
- Linux installer workflow 安装 `rpm` 工具链，并将 RPM 与 deb/AppImage 一起上传。
- 构建后运行 `dsh-desktop/scripts/audit-rpm-package.mjs`，检查 RPM 元数据、版本、
  x86_64/aarch64 架构、sidecar、Node runtime、skin manager 快照以及 Windows/musl
  载荷泄漏。
- README 和 Linux 支持规格同步说明 RPM 的支持边界。

## 验收状态

- 自动化契约测试覆盖 Linux target、CI 依赖/上传路径和 RPM 审计入口。
- Ubuntu x64/arm64 runner 上的真实 RPM 构建、安装和启动验收需由 CI/虚拟机完成；
  Windows 开发机不能把这些结果视为已通过。
- RPM 不提供独立的应用内自更新；Linux 更新仍由 Release 页面和系统包管理器负责。
