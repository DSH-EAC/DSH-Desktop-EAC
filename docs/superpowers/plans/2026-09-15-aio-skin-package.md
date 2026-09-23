# AIO 壳层皮肤包实施计划

**目标：** 完成 Issue #363，在 Task 1.1 已建立的 shell-skin 契约下新增
AIO 内置皮肤包。

**设计文档：**
`docs/superpowers/specs/2026-09-15-aio-skin-package-design.md`

## 约束

- 只实现 #363，不实现运行时皮肤切换。
- 输出目录固定为 `dsh-desktop/assets/shell-skin/aio/`。
- Control、Style 和 Skin 通过同一 `skin.json` 声明，文件布局与
  `eac-default` 一致。
- AIO 包复用完整 `--eac-shell-*` token 名集合。
- 不复制业务逻辑，不覆盖 `--dsw-*` 或 `--aion-*`。
- 未经用户明确授权，不 commit、push 或创建 PR。

## Task 1：对齐文档和基线

- [x] 基于最新 `origin/dev` 建立 `codex/task-363-aio-skin`。
- [x] 锁定 AIO 和公约提交。
- [x] 阅读 ADR 0005、默认包和契约测试。
- [x] 将旧的 `packages/ui-skins/aio/` 方案改为真实 shell-skin 目录。

## Task 2：先补失败测试

修改 `dsh-desktop/test/shell-skin-pack.test.ts`：

- [x] 抽取可复用的 Manifest 和 token 解析辅助函数。
- [x] 验证 AIO 四件套和 Manifest 身份。
- [x] 验证 AIO 与默认包 token 名集合一致。
- [x] 验证 AIO CSS 不污染内核 token。
- [x] 验证 `controls.css` 只消费包内声明的 token。
- [x] 验证 AIO 包不包含业务入口。
- [x] 运行定向测试，确认因 AIO 包尚不存在而失败。

## Task 3：实现 AIO 四件套

创建：

```text
dsh-desktop/assets/shell-skin/aio/
├── skin.json
├── tokens.css
├── controls.css
└── README.md
```

- [x] `skin.json` 声明 AIO Skin、Control、Style 和版本依赖。
- [x] `tokens.css` 提供与默认包兼容的完整 AIO token 集。
- [x] `controls.css` 只消费 token，表达 AIO 玻璃控件视觉。
- [x] `README.md` 记录来源、范围、边界和后续加载方式。

## Task 4：补充架构记录

创建 `docs/adr/0007-aio-shell-skin-pack.md`：

- [x] 记录为什么沿用 Task 1.1 的四件套。
- [x] 记录 AIO 视觉来源和取舍。
- [x] 记录 #363 不修改生产加载器。
- [x] 记录无新增二进制资源和许可证风险。

## Task 5：验证与复查

- [x] 为 `assets/shell-skin/` 补充变更分类规则和双 PowerShell 回归。
- [x] 运行 `npm run build`。
- [x] 运行 `node --test test/shell-skin-pack.test.ts`。
- [x] 运行仓库分类和定向验证脚本。
- [x] 运行 `git diff --check`。
- [x] 检查工作区，仅保留 #363 相关文件。
- [x] 汇报变更、验证结果和未提交状态。
