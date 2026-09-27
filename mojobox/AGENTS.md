# AGENTS.md

本文件是 coding agent 在 DSH Mojobox 仓库中的执行约束。默认用中文汇报，代码、字段名、路径
和命令保持原文。

## 目标

以最小、可验证的改动维护 Mojobox 的 Catalog、Pack/Lock、Evidence、静态网站与构建链。
不要把 Mojobox 扩展成插件运行时、宿主安装器或完整环境迁移工具。

## 开始前

1. 运行 `git status --short --branch`，保留已有修改。
2. 阅读 `README.md`；架构或协议任务再读 `docs/architecture.md`。
3. 阅读任务直接涉及的 Schema、合法 fixture、非法 fixture和一份现有生产样本。
4. 从 `package.json` 获取真实命令，不臆造脚本。
5. 说明本次事实源、生成物和成功标准，然后再编辑。

## 单一事实源

| 内容 | 事实源 |
| --- | --- |
| 插件记录 | `catalog/plugins/*.json` |
| Pack / Lock | `catalog/packs/*.pack.json`、`*.lock.json` |
| 生产 Evidence | `catalog/evidence/*.json` |
| Mojobox wire format | `schemas/*.schema.json` |
| 官方 `package.json.dsh` 投影 | `schemas/official-package-metadata.schema.json` 与插件记录的 `x-mojobox-package` |
| 协议正反例 | `fixtures/valid/`、`fixtures/invalid/` |
| Host/Profile 快照 | `profiles/*.json` |
| 上游 commit 和 digest | `spec-revisions.json` |
| 目录关系校验 | `scripts/validate.mjs` |
| Catalog/离线包生成 | `scripts/build-site.mjs` |
| 网站源码 | `site/` |

`site/public/generated/`、`dist/`、`.cache/` 是生成物，不手工编辑、不提交。

## 任务路由

### 添加插件

读取：`vendor/dsh-std/`、目标插件现有 Manifest/包元数据、一个相似的
`catalog/plugins/*.json`。

要求：优先作者声明；目录代维护必须标 `registry-maintained`；只写可核验事实；没有 artifact
就标 `unpublished`；artifact 确有 `package.json.dsh` 时才投影 `x-mojobox-package`；不要为单个
插件修改 Schema。

验证：`npm test`。进入 Pack 时再运行 `npm run build`。

### 添加或更新 Pack

读取：`schemas/pack.schema.json`、`schemas/pack-lock.schema.json`、一对现有 Pack/Lock。

要求：文件成对；ID、版本和组件集合一致；只用精确版本与精确 npm 来源；摘要来自真实字节；
插件型 Pack 的分类只使用 `function`、`appearance`、`workflow`，不加入 profile 或完整环境。

验证：`npm test`、`npm run build`。

### 添加 Evidence

读取：`schemas/evidence.schema.json`、对应 Manifest、Host Profile、suite 和一个同等级 Evidence。

要求：不编造运行结果；绑定精确 artifact、Manifest、Host、suite、revision 和时间；fixture 不算
生产证据；新 revision 不改写历史证据。

验证：`npm test`。

### 修改协议

读取：全部受影响 Schema、正反 fixtures、Validator 分支、生产数据引用者。

要求：最少增加一个正例和一个反例；说明兼容影响；只在 Schema 不足时增加语义校验；不引入
网络或插件执行。

验证：`npm test`、`npm run build`。

### 修改网站

读取：`site/src/main.js`、`site/src/styles.css`、`vite.config.mjs`、生成 Catalog 结构。

要求：保持静态；不读取本机环境；不直接安装；根路径和仓库子路径都可用；不手改生成数据。

验证：`npm test`、`npm run build`、`BASE_PATH=/dsh-mojobox/ npm run build`，再检查桌面和窄屏。

### 修改构建或 `.dshpack`

读取：`scripts/build-site.mjs`、Pack/Lock Schema 和现有 archive 结构。

要求：先校验 SHA-256；固定 ZIP 时间；稳定排序；不加入用户数据、凭据或本机路径；保持同输入
同输出。

验证：`npm test`、连续构建两次并比较摘要、检查归档结构。

## 协议边界

- `dsh-std` 拥有插件 Manifest、facet、权限和运行时交互语义。
- `dsh-distribution` 拥有完整环境身份、布局、发现和迁移语义。
- Mojobox 只拥有 Catalog、Pack、Pack Lock、Evidence 和 `.dshpack`。
- Host Adapter 拥有本地计划、用户确认、安装、快照、验证和回滚。
- TUI 私有 admission 规则不能变成所有宿主的公共 Pack 要求。
- `package.json.dsh` 由官方 Harness 定义；Mojobox 只投影真实字段，不声称官方 installer 已执行兼容校验。
- `legacyTuiAdmission` 只服务历史 fixture；现行生态坐标不能替换历史 Evidence 输入。

有上游定义时引用上游，不在 Mojobox 中创建同义字段。

## 摘要与 Evidence 规则

- `manifestDigest` 是 Manifest 文件原始字节的 SHA-256。
- `artifactDigest` 是精确下载 artifact 原始字节的 SHA-256。
- 修改 Manifest 格式也会改变 digest，必须更新所有 Lock/Evidence 引用。
- 不能通过复制旧摘要、猜测摘要或只改字符串完成升级。
- `evidenceLevel` 与 `result` 是独立事实，高等级 Evidence 也可以失败。
- Schema 校验成功不等于安全、运行成功或宿主支持。

## 编码与改动纪律

- 使用两空格缩进和现有 ESM 风格。
- 优先修改现有模块；没有重复需求时不新增抽象。
- 不顺带重排 JSON、升级依赖、改 UI 或重构无关代码。
- 不覆盖他人的未提交修改。
- 文件修改使用补丁方式；不编辑 `node_modules`。
- 未经明确授权，不 commit、push、创建 PR、部署或发布。

## 完成定义

完成前必须：

1. 运行任务对应的最低验证。
2. 运行 `git diff --check`。
3. 检查 `git status --short`，确认没有生成物或敏感内容。
4. 报告修改、验证结果、未验证项和协议/摘要影响。

网络缓慢时可临时使用用户指定的 `http://127.0.0.1:7897`，仅对当前下载进程设置
`HTTP_PROXY`/`HTTPS_PROXY`，并保留 loopback `NO_PROXY`；不得写入 npm 配置或仓库文件。
