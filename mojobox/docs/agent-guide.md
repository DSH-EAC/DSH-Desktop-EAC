# 使用 coding agent 开发 Mojobox

本指南让个人维护者可以把边界清楚的任务交给团队或 coding agent。所有任务都先读取仓库根目录
`AGENTS.md`，检查分支与未提交改动，并且不得自行 commit、push、部署或发布。

## 通用任务单

```text
请先完整读取 AGENTS.md，并检查当前分支和工作区。

目标：<一个可验证结果>
事实输入：<上游仓库、精确 commit、npm 包或现有文件>
允许修改：<路径>
必须保持：<协议边界、现有用户修改、摘要或行为>
完成标准：<命令与可观察结果>

实现前读取相关 Schema、一个合法 fixture、一个非法 fixture和一个生产样本。
只陈述可核验事实，不编造字段、摘要或兼容结论。完成后报告修改、实际验证、
未验证项和 Evidence/摘要影响；不要 commit 或 push。
```

一个任务只负责一个对象或一条调用链。若同时涉及公共 Schema 和 EAC 事务，先拆成协议 PR 与
Adapter PR，避免团队成员互相覆盖。

## 收录插件

```text
为 <插件> 添加 Mojobox Catalog 记录。

来源：<GitHub URL + commit/tag>
npm：<精确包名与版本；没有则写未发布>

核对 artifact 内的 package.json、作者 dsh-plugin.json、license 和 repository。
存在 package.json.dsh 时，将真实字段投影到 x-mojobox-package；不要推断缺失字段。
作者未发布 dsh-plugin.json 时使用 registry-maintained，不补造权限、facet 或兼容性。
已发布 artifact 计算真实 SHA-256；未发布记录不得进入 Pack Lock。
完成后运行 npm test，并报告来源与摘要。
```

## 创建插件型 Pack

```text
为 <用途> 创建一个 <function|appearance|workflow> Pack 和对应 Lock。

组件：
- <Catalog ID>@<精确版本>，required=<true|false>

只使用 Catalog 中已有且有真实 artifact 的组件。Pack 与 Lock 的 ID、版本和组件集合必须一致；
Lock 使用精确 npm source，并从真实 Manifest 字节和 tarball 计算 SHA-256。
不要加入 profile、preset、用户数据或完整环境。完成后运行 npm test 和 npm run build，
并报告 .dshpack 文件名。
```

## 签发 Evidence

```text
为 <subject ID>@<version> 签发 <Host> 的 <Evidence level> Evidence。

实际测试输入：<Host Descriptor、suite、命令、日志或 CI 链接>
固定坐标：<artifact、Manifest、Host、suite、协议 revision>

没有真实执行结果时只提交差距报告，不创建 Evidence。fixture 不能当生产证据，Schema 通过不能
写成 Tested/Observed。新上游 revision 新签记录，不改写历史 Evidence。完成后运行 npm test。
```

## 扩展 EAC Adapter

```text
在 EAC 中实现 Mojobox 的 <只读计划|Pack 安装|卸载|恢复> 能力。

先读取 EAC 的 AGENTS.md 和 deepseek-harness-eac-dev 规范，定位 mojobox.ts、sidecar、bridge、
内置 Catalog snapshot 与相关测试。公共 Catalog 只传声明；profile 路径、snapshot、journal、
ownership 和回滚留在 EAC。

保持 dsh.client、Cordis、DSH_HOME 和用户已有插件语义。先写能复现目标行为的定向测试，
再做最小实现；按影响矩阵执行至少 V2，涉及 bridge/壳提升到 V3/V4，安装分发提升到 V5。
报告自动化结果与仍需虚拟机人工验证的项目。
```

## 修改协议

```text
评估并实现 Mojobox wire contract 变化：<变化>。

先确认上游是否已有同义字段。列出受影响 Schema、正反 fixtures、Validator、Catalog、Lock、
Evidence、网站和 Host Adapter。选择最小兼容方案，至少增加一个 valid 和一个 invalid fixture。
不要在 Validator 中访问网络或执行插件。完成后运行 npm test、npm run build 和 git diff --check，
说明迁移和回退。
```

## 修改静态网站

```text
修改 Mojobox 网站以支持：<用户工作流>。

保持静态、只消费 generated/catalog.json，不读取本机环境、不直接安装。下载与 EAC 深链接分开；
覆盖 loading、empty、error 和正常状态，并检查桌面、窄屏、键盘焦点和长文本。
运行 npm test、npm run build、BASE_PATH=/dsh-mojobox/ npm run build，并提供实际检查结果。
```

## 审查清单

团队 Reviewer 至少确认：

1. diff 只包含任务相关修改，没有覆盖他人的未提交工作；
2. 上游 URL、commit、版本和字段可追溯；
3. digest 来自真实字节，Manifest 改动已同步 Lock/Evidence；
4. 正反 fixture 都实际被 Validator 执行；
5. Pack 分类只影响组织，没有偷偷加入安装语义；
6. 旧 TUI Evidence 没被改成当前生态规则；
7. EAC 私有路径与事务状态没有进入公共 Schema；
8. 生成目录、缓存、凭据和用户数据没有进入提交；
9. 验证命令确实运行，未做的真实安装测试明确列出。
