# Phase 2 扫描器规格 · 词表卡（14 面 token 全集）

> **来源**：自《PLUGIN-CONFLICT-AUDIT.md》（Task 2.2）附录A 迁出——该部分内容实质是 **Phase 2 扫描器**的规格说明，与审计文档的「可复现性证据（命令）」分属两层，故独立成篇。审计文档中对「词表卡」的引用均指向本文件。
>
> **状态**：Phase 2 扫描器的判定 token 规格（**迁出候选——可独立演进**，其变动不反写审计文档）。

## 词表卡（14 面 token 全集）

| 面 | 定义 | 判定 token（可 grep） | 可检测性 |
|---|---|---|---|
| conversation-chat | 消息流渲染/回合/文档级呈现 | conversation.chat.node / chat.turnTail / conversation.view / **conversation.chat.assistant-actions** / **conversation.session.header** / **data-chat-flow-kind** / **data-turn-tail** / html,body 溢出 / 哈希类名钩子（如 web-mobile-fix `.YDXeBa_*`） | 部分（**须多 token 并用**；原表仅 3 token，导致 10 个已声明本面的插件按原 token 扫为 0 命中，2026-09-19 补） |
| composer-input | 输入区/发送路径 | conversation.composer.dock / conversation.input.*（含 .overlay / .right / .model） / data-composer-card / **paste 事件 + textarea 直写**（image-paste 属此类，非槽注册形式） | 静态可扫（**末项需人工**） |
| settings-ui | 设置页分区/插件子页 | settings.section / settings.plugins.tab / settings.general.item / settings.plugin.item / **data-dsh-settings-root** / **data-slot^="settings."** | 静态可扫（**末二 token 为 DOM 钩子形态**——settings-scroll-fix `:117-118` 即靠此工作，仅用前 4 个槽名会漏，2026-09-19 补） |
| sidebar | 侧栏/工作台 | `data-slot="sidebar"` **与转义形 `[data-slot=\"sidebar\"]` 两种写法并用**（仅扫前者会漏 web-mobile-fix `:139-141`） / data-sidebar-collapsed(R) / **第三种形态**：`--dsh-sidebar-*` 变量族与 `data-dsh-sidebar-collapsed`（`dsh-better-sidebar` 对前两种写法**均 0 命中**，仅用此形态，全库唯一） | 静态可扫（**须三种写法并用**） |
| overlay-floating | 全局浮层/桌宠层 | shell.overlay / data-shell-overlay / **body 挂载**（`document.body.appendChild(…)` / `document.body.append(…)`；注意 `body` 可能是局部变量而非 `document.body`，如 navbar `:135/:139`——**字面 `document.body.appendChild` 会漏**） | 部分（绕槽直写需人工） |
| terminal | 终端视图 | conversation.view + terminal 语义 | 静态可扫 |
| files | 文件视图/投影 | useProjection("fileChanges") / conversation.view | 静态可扫 |
| session-data | 会话数据/归档 | `ctx.sessionProjections.register`（**投影提供方** = W；`dsh-file-changes/lib/index.js:508`） / `ctx.sessions.open\|fork\|list` / **`useProjection("tokenUsage"\|"fileChanges"\|…)`**（**通用投影消费入口 = R**；原表仅在 files 面列了 `useProjection("fileChanges")`，导致本面的投影消费者全漏——balance `:64`、client-file-changes 属此类，2026-09-19 补） / `conversation.send` / `workspaces.create\|deleteSession`（**会话/工作区读写**，如 dsh-easy-setup `lib/client.js:553-559`、dsh-better-sidebar `lib/client-registry.js:8858`、dsh-session-manager `lib/client.js:178`） / cordis.patch.yml 行。注：`会话投影提供方` 是谓词不可 grep，已替换为实 token；**仅扫 `sessionProjections` 会漏掉全部非投影写者** | 部分（须多 token 并用） |
| tools-agent | agent 工具注册 | defineTool / tools.register | 静态可扫 |
| system-prompt | 提示词注入 | **systemPrompt.section**（**驼峰形态**，如 undo-savepoint `lib/index.js:1693`；**连字符式 `system-prompt` 扫不到驼峰调用**，2026-09-19 补） / system-prompt / assemble（**须加词边界**——`assembled` 会污染计数） | 静态可扫（须含驼峰形） |
| network-api | webServer 路由/远程 API | **首选** `webServer.register(` / `registerUpgrade(`（含 host 半边 `lib/index.js`；实测 22 个插件）；辅助 `inject = ['webServer']`（严格字面**仅命中 6**，不可单独作判据；另有 `const inject=["a","webServer"]` 多元素与 `ctx.get(WEB_SERVER_KEYS[0])` 变体），字面 `inject webServer` 不可 grep | 静态可扫（须按上述变体） **收录口径**：只登记**跨插件可竞争**的共享端点/对外服务；插件**私有前缀**路由按项目规范（`dsh-plugins.md`「API 路径使用插件私有前缀」）不逐条登记——实测 22 个插件含 `webServer.register`、主表标 **10** 个即依此口径（已标 10 个均有 register 实证、无假阳性）。**边界例**：`dsh-undo-savepoint` 注册 `kind:'prefix', path:'/api/undo'`（裸通用前缀、覆盖 `/api/undo/*` 整棵子树）属**可竞争**端点，须登记 |
| skins-theming | 皮肤/外观变量 | --dsw-alias-* / --ds-font-family* / ui-skin-* 行 / skin.json | 静态可扫 |
| mcp-skills-config | MCP/Skills 配置管理 | @deepseek-ai/dsh-mcp-client 行 | 静态可扫 |
| backend-infra | 纯后端/桥接（**兜底面**） | 判定：该插件在已声明的 UI/网络/数据面之外，另有仅跑 host 逻辑或桥接的部分。**不以"有无 client.js"为准**——`computer-user` / `dsh-dafeiyu` / `dsh-eac-core-bridge` 均有 client.js 且**同时声明其他 W 面**（如 settings-ui:W、tools-agent:W），故本面为**附加兜底**而非"无任何写入"（原定义"无任何修改面写入"与三者的实际声明矛盾，2026-09-20 更正）。**主表三处统一标 `:W`**（host 侧写入；2026-09-20 补——原三行漏标 `:性质`，与列头「修改面:性质」不一致） | 静态可扫（须结合主表面声明） |

（i18n 文案覆盖在主表中记为「ui 文案」面；该名称为 14 面之外的**临时面**，与 `ui` 功能 tag 同名但不同层。文档级 CSS 暂归 conversation-chat 面。二者待词表评审定夺。另：14 面中的 `terminal` 面本版**未被任何插件使用**——`dsh-terminal` 自身归类为 `conversation-chat:W(终端视图)`，且该面判定 token「terminal 语义」不可 grep；建议词表评审时将其并入 conversation-chat 或重定义 token。）

## 附：Phase 2 扫描器的既有陷阱（六类假数据，须做成回归用例）

1. **跨行字段**：`slots.inject(…)` 与 `slots.register({…})`、`name:` 与 `description:` 几乎总分行；逐行 grep → **必然 0 命中**。取注册对象必须**括号配平**扫全块。
2. **固定行/字符窗口截断**：`grep -A6` 会把**相邻注册**的字段算进来（虚增撞车）；`[^}]{0,600}` 字符上限会截断超长块（`skins/maid-atelier/lib/client.js:55` 为 **59,493 字符单行**）。
3. **变量名/注释污染**：正则 `font-family` 会同时命中 `--dsw-font-family` **变量声明**；数值型提取（z-index / 行号 / 计数）会被**注释里引用的数字**污染——须先剥注释、限定在目标结构内提取。
4. **转义选择器**：`[data-slot=\"sidebar\"]`（源码转义写法）用字面 `data-slot="sidebar"` **grep 不到**——两种写法必须并用。
5. **定义在工厂函数内**：工具名写在 `createXxxTool()` 内、不在 `tools.register(` 调用点隔壁（picturereader 10 个工具因此曾误记为 2）。
6. **同插件构建重复产物**：`client.js` / `client-registry.js` / `client/entry.js` 是同一逻辑的重复副本，计数前须去重（`dsh-stt/client.js` 为构建产物，源码为 `client/entry.js`）。

**另两条判定纪律**：容器耦合 ≠ 同点双写（把 dataset 写在「包住某槽的祖先元素」上，与「往该槽里注册内容」不是同一修改点）；锚点行号口径 = 注册入口行 / 相关块首行，偏移 ≤5 行不计。

**工具环境陷阱**：Git Bash 的 MSYS 会改写反斜杠（heredoc 里 `\s` 可能变 `/s` → 正则静默变义、0 命中，须用 `chr(92)` 手工拼反斜杠复现）；`--include="*.js"` 在本机**排除不掉 `.map`**（须显式管道 `grep -v '\.map'`）；**bash 单行 `-c` 里的反引号会被当命令替换**（含 Markdown 代码标记的脚本一律写成文件再跑）；Python 中文输出需 `PYTHONIOENCODING=utf-8`。
