# 插件冲突审计：60 条目分类、冲突与功能影响

Closes #366 ｜  看板：Task 2.2

> **基线**：dev@`e46ebb2`（60 条目 = 49 插件 + 10 皮肤 + 1 SDK）。
> **计数纪律**：任何计数必须带 `数字@revision@口径` 后缀；裸数字无效。负面结论（"不存在"）必须附完整命令与候选总数。
> **证据分档**：`code`（代码事实）＞ `test`（测试固化）＞ `comment`（注释叙事，降权）＞ `external`（外部参照）。凡因果链进入内核内部的一律标 `not-tested`。
> **任务范围**：只做分类、标记冲突、标注功能影响。修复方案不在本文件范围。

> **贡献者本人的话**：这一堆插件里三层外三层的，改一处，其余几处就要跟着改，工作量巨大，越查越深，越查越绕，所以本文档内容经过多次修正，但是错误可能还是有点多，但这正是我们要解决的问题之一，纯靠人工维护早晚会变成屎山（~~其实现在也是~~），与其往这份文档里继续堆人工核对，不如早点把 CI 之类的整好，让机器来检查

---

## 0. 范围与口径

- 审计对象：`dsh-desktop/assets/` 下全部随包条目（49 插件 + 10 皮肤 + 1 SDK 示例）。
- 分类四维：D1 治理归属、D2 来源可信度、D3 加载通道、D4 公用资源占用。
- 冲突按**修复动作**归类（数值/顺序 → 类型 12 z-index-overrun；名字/契约 → 类型 13 shared-anchor-coupling）；覆盖统计进附录 B 登记表，**不进冲突表**。
- 功能影响用"用户会看到什么"的语言，公式 = 现象 → 半径（谁/多广）→ 动作（怎么办）。
- 失效模式三分：**响亮崩溃**（报错/起不来）、**静默失效**（不报错但失效，最优先治理）、**视觉错乱**。"静默 > 响亮"是倾向不是定律，逐条标注。
- 内核内部行为无法从仓库内证明，一律 `not-tested`。

---

## 1. 表 1 · 分类表（60 行）

**D1 判定顺序**：目录含 skin.json → 皮肤公约；包内含 dsh-plugin.json → dsh-std（血统按 SOURCES.json main 线 origin 在备注注明）；sample-sdk-plugin 无 manifest → 自研台账（契约 = SDK V1）。特例：dsh-skin-switch = 皮肤公约（运行时；公约未落地，实际治理在自研台账 + companion-sync）。
**D3 五值口径**：自启行 48（patch 行加载通道，含 4 条默认停用：dsh-pet / dsh-whale-widget / image-paste / dsh-stt）+ bundle 1（dsh-raw-html，唯一特例，禁止写 overlay 行）+ 皮肤注册 9 + 不注册 1（maid-atelier，黑名单连拷贝都跳过）+ SDK 子进程 1。
**D4 口径**：公用依赖 = deps/peer/optional 段声明 @deepseek-ai/* 或 schemastery/web-push；宿主锚 = 写/读宿主共享容器或 data-* 属性；他包私有名 = 依赖他包未登记的类名/属性。锚点清单见覆盖登记表。
**※ 台账矛盾**：11 条 SOURCES=upstream 与 .sync=internal 并存（10 条为 myYangyunfan/dsh_desktop 伴侣套件 pin `ee052c6b`，其中 float-window/terminal 上游已退役；raw-html 上游为 plolpl789/dsh-raw-html）；maid-atelier 同类（Small-tailqwq/dsh-deep-whale）。internal 是同步策略不是血统。

| 序号 | id | D1 | D2 | D3 | 默认 | D4 | class | 备注 |
|---|---|---|---|---|---|---|---|---|
| 1 | agent-teams | dsh-std·upstream | github | 自启行 | 启用 | 公用依赖＋宿主锚（读 data-shell-overlay） | patched | lite 停用 |
| 2 | balance | dsh-std·upstream | internal | 自启行 | 启用 | 无 | internal | ※台账矛盾（伴侣套件） |
| 3 | better-sidebar | dsh-std·upstream | npm | 自启行 | 启用 | 公用依赖 | patched | — |
| 4 | change-review | dsh-std·upstream | unknown | 自启行 | 启用 | 无 | manual | lite 停用 |
| 5 | client-file-changes | dsh-std·upstream | internal | 自启行 | 启用 | 无 | internal | ※台账矛盾（伴侣套件）；C-07 反例位 |
| 6 | compact | dsh-std·upstream | unknown | 自启行 | 启用 | 公用依赖 | manual | 核心锁定，lite 不停用 |
| 7 | composer-dynamic-island | dsh-std·upstream | github | 自启行 | 启用 | 公用依赖＋锚（data-composer-card） | follow-upstream | lite 停用 |
| 8 | computer-user | dsh-std·upstream | npm | 自启行 | 启用 | 公用依赖 | follow-upstream | 平台过滤 mac/linux；lite 停用 |
| 9 | conversation-tweaks | dsh-std·upstream | internal | 自启行 | 启用 | 无 | internal | ※台账矛盾（伴侣套件） |
| 10 | dock-settings | dsh-std·eac-original | unknown | 自启行 | 启用 | 公用依赖 | manual | — |
| 11 | dsh-dafeiyu | dsh-std·upstream | github | 自启行 | 启用 | 公用依赖 | resource | 平台过滤 mac/linux；lite 停用；resource≠皮肤 |
| 12 | dsh-feature-toggles | dsh-std·eac-original | unknown | 自启行 | 启用 | 无 | manual | — |
| 13 | dsh-navbar | dsh-std·upstream | npm | 自启行 | 启用 | 公用依赖 | follow-upstream | — |
| 14 | dsh-pet | dsh-std·upstream | npm | 自启行 | 停用 | 公用依赖＋宿主锚（写 data-shell-overlay） | follow-upstream | 默认停用；行必须带 config |
| 15 | dsh-pet-settings | dsh-std·eac-original | unknown | 自启行 | 启用 | 无（settings 撞词，无结构化命名空间） | manual | lite 停用 |
| 16 | dsh-phone | dsh-std·eac-original | internal | 自启行 | 启用 | 公用依赖 | internal | lite 停用 |
| 17 | dsh-raw-html | dsh-std·upstream | internal | bundle | 启用 | 公用依赖＋锚（data-composer-card） | manual | ※台账矛盾（上游 plolpl789 vs .sync internal）；唯一 bundle 通道件；禁止写 overlay 行 |
| 18 | dsh-session-manager | dsh-std·upstream | npm | 自启行 | 启用 | 公用依赖 | follow-upstream | 前置内核补丁 patch-session-manage |
| 19 | dsh-undo | dsh-std·upstream | github | 自启行 | 启用 | 无 | follow-upstream | 目录名 dsh-undo-savepoint |
| 20 | dsh-webui-prompt-optimizer | dsh-std·upstream | unknown | 自启行 | 启用 | 公用依赖 | manual | lite 停用 |
| 21 | dsh-whale-widget | dsh-std·upstream | github | 自启行 | 停用 | 无 | resource | 默认停用（resource≠皮肤） |
| 22 | eac-core-bridge | dsh-std·eac-original | unknown | 自启行 | 启用 | 公用依赖 | manual | — |
| 23 | eac-locale-compat | dsh-std·eac-original | unknown | 自启行 | 启用 | 无 | manual | — |
| 24 | easy-setup | dsh-std·eac-original | internal | 自启行 | 启用 | 无 | internal | — |
| 25 | file-changes | dsh-std·upstream | internal | 自启行 | 启用 | 无 | internal | ※台账矛盾（伴侣套件） |
| 26 | file-drop-eac | dsh-std·eac-original | internal | 自启行 | 启用 | 宿主锚（data-composer-card） | internal | — |
| 27 | float-window | dsh-std·upstream | internal | 自启行 | 启用 | 无 | internal | ※台账矛盾（伴侣套件，上游退役）；lite 停用 |
| 28 | font-custom | dsh-std·eac-original | unknown | 自启行 | 启用 | 他包私有名（.dspg_title / .dsh-balance-dock） | manual | — |
| 29 | image-paste | dsh-std·upstream | unknown | 自启行 | 停用 | 无 | manual | 默认停用（与 picturereader 入口重叠） |
| 30 | meow-smooth | dsh-std·upstream | github | 自启行 | 启用 | 公用依赖＋宿主锚（读 data-shell-overlay） | follow-upstream | — |
| 31 | message-rewind | dsh-std·upstream | unknown | 自启行 | 启用 | 公用依赖 | manual | lite 停用 |
| 32 | mobile-fix | dsh-std·upstream | npm | 自启行 | 启用 | 无 | follow-upstream | — |
| 33 | offpeak | dsh-std·upstream | npm | 自启行 | 启用 | 宿主锚（data-composer-card） | follow-upstream | — |
| 34 | openclaw-bridge | dsh-std·upstream | internal | 自启行 | 启用 | 公用依赖 | internal | ※台账矛盾（伴侣套件）；lite 停用 |
| 35 | picturereader | dsh-std·upstream | npm | 自启行 | 启用 | 公用依赖 | follow-upstream | macOS 缺外部依赖（降级仍装） |
| 36 | plugin-manager | dsh-std·upstream | internal | 自启行 | 启用 | 公用依赖 | internal | ※台账矛盾（伴侣套件） |
| 37 | plugin-shield | dsh-std·eac-original | unknown | 自启行 | 启用 | 无 | manual | — |
| 38 | plugin-wizard | dsh-std·eac-original | unknown | 自启行 | 启用 | 无 | manual | — |
| 39 | prompt-custom | dsh-std·upstream | internal | 自启行 | 启用 | 公用依赖 | internal | ※台账矛盾（伴侣套件）；lite 停用 |
| 40 | settings-groups | dsh-std·upstream | unknown | 自启行 | 启用 | 无（settings 撞词） | manual | — |
| 41 | settings-scroll-fix | dsh-std·eac-original | internal | 自启行 | 启用 | 宿主锚（data-composer-card） | internal | — |
| 42 | side-session | dsh-std·upstream | internal | 自启行 | 启用 | 公用依赖 | internal | ※台账矛盾（伴侣套件）；lite 停用 |
| 43 | skin-switch | 皮肤公约（运行时） | internal | 自启行 | 启用 | 无 | internal | 9 款注册皮肤的启停状态由本插件注册后唯一改写（初值由 companion-sync 播种，皮肤代码零引用；maid-atelier 黑名单不注册） |
| 44 | soul-md | dsh-std·upstream | npm | 自启行 | 启用 | 公用依赖 | follow-upstream | 行必须带 config.path |
| 45 | terminal | dsh-std·upstream | internal | 自启行 | 启用 | 无 | internal | ※台账矛盾（伴侣套件，上游退役） |
| 46 | unified-market | dsh-std·upstream | npm | 自启行 | 启用 | 无 | follow-upstream | — |
| 47 | viewport-lock | dsh-std·eac-original | internal | 自启行 | 启用 | 无 | internal | — |
| 48 | think-zh-expand-eac | dsh-std·upstream | github | 自启行 | 启用 | 公用依赖 | follow-upstream | 根上游 baosfeng/my-dsh-plugins（dsh-think-zh-expand@0.4.8）；直连仓库 jing-hy/dsh-think-zh-expand-eac（C115） |
| 49 | dsh-stt | dsh-std·upstream | github | 自启行 | 停用 | 无 | follow-upstream | 默认停用（sherpa-onnx-node 原生件；模型 ~230MB 按需下载）；lite 停用；不进更新源 |
| 50 | ui-skin-blue-fantasy | 皮肤公约 | github | 皮肤注册 | 预设选择 | 皮肤变量面（--dsw-alias-*） | resource | — |
| 51 | ui-skin-dragon-heir | 皮肤公约 | github | 皮肤注册 | 预设选择 | 皮肤变量面 | resource | — |
| 52 | ui-skin-maid-atelier | 皮肤公约 | internal ※台账矛盾 | **不注册** | 不可选 | 皮肤变量面＋宿主锚（data-composer-card） | resource | DISABLED_SKINS 黑名单，连拷贝都跳过 |
| 53 | ui-skin-miku | 皮肤公约 | github | 皮肤注册 | 预设选择 | 皮肤变量面 | resource | — |
| 54 | ui-skin-minecraft | 皮肤公约 | github | 皮肤注册 | 预设选择 | 皮肤变量面 | resource | — |
| 55 | ui-skin-qq98 | 皮肤公约 | github | 皮肤注册 | 预设选择 | 皮肤变量面 | resource | — |
| 56 | ui-skin-ths | 皮肤公约 | github | 皮肤注册 | 预设选择 | 皮肤变量面 | resource | — |
| 57 | ui-skin-trading | 皮肤公约 | github | 皮肤注册 | 预设选择 | 皮肤变量面 | resource | — |
| 58 | ui-skin-whale-song | 皮肤公约 | github | 皮肤注册 | 预设选择 | 皮肤变量面 | resource | — |
| 59 | ui-skin-xp | 皮肤公约 | github | 皮肤注册 | 预设选择 | 皮肤变量面 | resource | — |
| 60 | sample-sdk-plugin | 自研台账（契约=SDK V1） | internal | SDK 子进程 | 按需 | 无（隔离子进程，不占公用面） | isolated-sdk | 无 manifest，不走 std |

**统计**：D1 = 皮肤公约 11 / dsh-std 48 / 自研台账 1；D2（60 口径）= github 17 / internal 19 / npm 10 / unknown 14（49 插件口径 8/17/10/14）；D3 = 48+1+9+1+1 = 60；D4 = 公用依赖 23 / 宿主锚 9 / 私有名 1 / 皮肤变量面 10 / 设置命名空间 0（4 个 "settings" 全是名字撞词）/ 无 23（其中 3 行带撞词/隔离注记；另 6 行跨桶双标，分桶合计 66=60+6）；class = patched 2 / internal 16 / manual 15 / follow-upstream 14 / resource 12（**resource ≠ 皮肤**，含 dafeiyu、whale-widget）/ isolated-sdk 1。

---

## 2. 表 2 · 冲突表（12 项冲突）

失效模式三分：**响亮崩溃**（报错/起不来）/**静默失效**（不报错但失效）/**视觉错乱**。凡因果链进入内核内部的标 `not-tested`。

| C-ID | 类型 | 涉及插件 | 机制 | 证据（file:line，分档） | 失效模式 | 严重度 | 已证实? |
|---|---|---|---|---|---|---|---|
| C-01 | 登记冲突（双护栏） | dsh-pet ↔ dsh-pet-settings（误命中对）+ 全表 id≠包名 | ①安装期：候选 patch 行与 profile 行按 id/name 比对，命中即 refuse（PATCH_DUP_ID/PATCH_DUP_NAME）；②运行期：companion-sync id/name 映射表 + heal 负向断言（短 id 不得前缀误命中长 id 兄弟行）+ 回归测试 + 启动期 PATCH_DUP_ID 兜底。**弱点**：stripPatchRows（builtin-collision.ts:94-100）不查自写行豁免，防线仅 companion-sync.ts:693-700 单点闸门 | code：plugin-conflict-scan.mjs:110-122；companion-sync.ts:93-238；patch-row-heal.ts:54/:133；plugin-guard.ts:400。test：test/patch-row-heal.test.ts:77-93 | 响亮崩溃（安装期拒装/整树崩）；修复前 = 静默改坏兄弟行 | 高 | 是（code+test） |
| C-02 | 共享依赖分裂 | 声明者共 12：@deepseek-ai/schemastery 族 10（证据列具名 9 + raw-html optional:63-65，见 C-04）＋裸 schemastery 2（better-sidebar:127、side-session:19，均 deps ^3.18.0） | scoped 与裸名字面键不同永不相遇 → 模块双实例、Symbol 身份分裂 | code：composer-dynamic-island:70 / dafeiyu:45 / soul-md:48（deps ^3.18.1）；computer-user:60 / compact:44 / picturereader:67（peer ^3.18.1）；agent-teams:98（peer ^3.18.1-rc.1）+ devDependencies:163；openclaw-bridge:28 / prompt-custom:31（peer `*`） | 静默失效 | 高 | 是（声明层）；运行时双实例 not-tested |
| C-03 | 预检器死检查 | 全部内置插件（受害者） | SETTINGS_NS_CLASH 要求 dsh.settings.key（49 manifest 结构化计数 **0**）；CORE_DEP_CLASH 比较集恒空；installed 集设计上近乎空（companion-sync 刻意不写 deps，:112-115） | code：plugin-conflict-scan.mjs:70/:80-85/:101/:123-161/:154 | 静默失效（护栏形同虚设） | 高 | 是（静态） |
| C-04 | 漏读 optionalDependencies | dsh-raw-html（唯一声明者，且无 dependencies 段） | 扫描器 :70/:101/:154 三处只读 dependencies，optional/peer 结构性不可见 → 对 raw-html 必然漏报 | code：dsh-raw-html/package.json:63-65；plugin-conflict-scan.mjs:101/:154 | 静默失效 | 中 | 是（静态） |
| C-05 | bundle 与自启行互斥 | dsh-raw-html（bundle 件）；dsh-undo-savepoint（双模） | bundle 包内挂载行与 overlay 行同 id → duplicate loader entry 拖垮整树；removeBundledRowDuplicates 双信号去重 | code：plugin-guard.ts:400；patch-row-heal.ts:212-269；companion-sync.ts:914（跳过）/:901（剥离）；dsh-undo-savepoint/package.json（dsh.bundle.patch） | 响亮崩溃 | 高 | 是（修复侧）；内核行为 not-tested |
| C-06 | 层级抢共用容器 | dsh-pet ↔ dsh-agent-teams / meow-smooth | dsh-pet 对共享容器写 `!important` 最大层级，消费方（agent-teams 两处几何锚定、meow-smooth 守卫选择器）被一并抬升 | code：dsh-pet/lib/client.js:59（:54/:110 同值）；agent-teams client.js:1465 + ActivityPanel.js:332；meow-smooth client.js:1536。test：pet-overlay.test.ts:33（**固化冲突**） | 视觉错乱 | 中 | 是（代码+测试固化）；渲染结果 not-tested |
| C-07 | 层级值越过内核基准 | pet、message-rewind、font-custom、file-drop-eac、raw-html、change-review、better-sidebar + 皮肤 maid-atelier（8 行，19 处命中 = 18 独立声明 + 1 同源重复产物，见附录 A） | 各插件独立越过内核基准 2147483000，遮挡顺序仅由加载序决定；**真正在越界加码的是宿主自身**（bridge 5100 压 prompt-optimizer 5000 / navbar 950：bridge.ts:407、navbar client.js:44、prompt-optimizer client.js:71/:94，均已实测）；反例位 client-file-changes:756=2147482990 主动低于基准 | code：附录 A 19 行逐条 file:line；dsh-client-file-changes/lib/client.js:756 | 视觉错乱 | 中 | 是（数值事实）；压序结果 not-tested |
| C-08 | 硬编码内核 CSS 哈希 | conversation-tweaks、better-sidebar、web-mobile-fix | 选择器写死内核编译哈希类名，内核重构建即批量静默脱钩 | code：conversation-tweaks client.js:99-100/:154/:160（querySelectorAll）/:169-170（**querySelector 单数**）；web-mobile-fix:149-151（.YDXeBa_*）；better-sidebar:2462（css$4 .nArs4W_*） | 静默失效 | 中 | 是（静态）；哈希漂移 not-tested |
| C-09 | 跨插件类名耦合 | font-custom ↔ balance / offpeak | font-custom 把他包私有类名写进自己的选择器与预览 DOM（:116 .dsh-balance-dock code 档；:445-453 预览复刻 .dspg_*）；:126 注释与代码不符（--eac-widget-fg 实为自产自销，offpeak 零消费） | code：font-custom client.js:116/:120/:129/:445-453；comment：:126 | 静默失效/视觉错乱 | 中 | 是（静态）；对方重构后表现待验 |
| C-10 | 配置缺块拖垮插件树 | soul-md v2.0.0、dsh-pet v3.1.0 | 行缺 config 块 → 校验失败/读 undefined → 整树崩，且每次启动重写坏行 → 崩溃循环，用户删不掉 | code：plugin-guard.ts:405（PATCH_SOUL_CONFIG）、patch-row-heal.ts:8-21/:114-125 | 响亮崩溃（循环） | 高 | 是（守卫+事故注释）；内核因果 not-tested |
| C-11 | 自启行 schema 必填变更 | soul-md v2.0.0 | path 必填无默认 → 存量仅 id+name 的行校验失败崩树；修复 = schema 默认值 + 显式 config + heal + 回归测试 | code：patch-row-heal.ts:8-19；test：patch-row-heal.test.ts:12-31/:135-139 | 响亮崩溃（循环） | 高 | 是（代码+测试防回归） |
| C-12 | 发行侧三合一 | tauri-shell（非插件） | ①descriptor 四处 schema 违例（顶层 x-eac、组件附加键、#id、absolute-path 枚举）；②单实例键=产品 identifier（COEX-02 粒度，双安装互踩）；③安装器 taskkill /F /T /IM 按镜像名批量杀（COEX-05 射程内，被两测试固化）；④可变状态写 profiles（junction 换血） | code：gen-distribution-descriptor.mjs:90-94；main.rs:2377；tauri.conf.json:5；installer-hooks.nsh；plugin-guard.ts:518-550（junction 换血锚）。test：installer-nsh-pipe.test.ts:25、installer-takeover.test.ts:38 | 静默/互斥失效 | 中 | 是（代码+测试固化）；安装器运行行为 not-tested |

---

## 3. 表 3 · 功能影响表（F-01..F-42）

**写作公式**：现象（你会看到什么）→ 半径（谁/多广）→ 动作（怎么办）；正文不用内部术语。
**标记规范**：✅ = dev@`e46ebb2` 已修/已防御（现象见于旧版本或注明残余）；（未实测）= 静态推断；not-tested = 证据边界。
**严重度分布**：高 4（F-05/F-06/F-11/F-12，各两个现象）／中 32／低 6（低 = F-02/F-07/F-09/F-21/F-30/F-32）。

| F-ID | 用户会看到什么 | 半径 | 触发条件 | 怎么办 | 涉及插件 | 严重度 |
|---|---|---|---|---|---|---|
| F-01 | 市场里装插件装不上，或列表里出现两份一模一样的 | 在市场装插件的本人 | 市场来源与内置同名/同源 | 卸载重复那份，只留一个来源再装 | unified-market、plugin-manager | 中（有装前拒装护栏） |
| F-02 ✅ | 自己改过的设置条目，重启后又自动出现了 | 手动改过配置的用户 | 同一条目被两处声明 | 【dev 已防御】恢复的条目经过校验，无需处理 | 核心自愈机制、安装同步 | 低 |
| F-03 | 升级后界面样式整片失效，没有任何报错 | 升级后的所有用户 | 应用升级、旧样式名失效 | 先重启一次；不行就回退上一版并反馈 | dsh-web-mobile-fix、dsh-conversation-tweaks | 中 |
| F-04 | 桌宠面板和团队面板互相遮挡，只见其一 | 同时开两个面板的人 | 两面板同开 | 二选一暂时关闭 | dsh-pet、agent-teams | 中 |
| F-05 ✅ | ① 全新安装后一直「启动失败」反复闪退；② 按网上说法删掉插件，重启后它又回来了 | 新装机器用户；整机不可用（最重） | 全新环境命中缺配置的旧行 | 【dev 已修】现在重装/重启即可恢复（回来的必是补全过的健康行——但模块遮蔽清理的影子拷贝分支例外）；仍失败进安全模式、导出诊断。真实案例：#7/#14/#15/#131/#172/#246 + Linux #262/#266/#282 | dsh-pet、dsh-soul-md（历史版本）、装配写入链 | 高（dev 已修） |
| F-06 | ① 设置页某一组打不开或整片空白；② 报错显示同一核心组件被装出两个版本 | 桌面版与原版同装、或装了社区整合包的用户 | 特定插件组合使核心包双实例 | 升级到已修复版本；避开会提升核心包的安装方式 | better-sidebar、computer-user 等组合 | 高 |
| F-07 | 鲸鱼余额卡不跟随外观字体设置（峰谷提醒弹窗正常跟随，不受影响） | 用鲸鱼卡的人；单个卡片 | 字体插件与卡片对同一设置的写法互不相认 | 在卡片自身设置里单独调字体 | dsh-whale-widget、dsh-font-custom | 低 |
| F-08 | 弹窗弹出来被别的浮层盖住，点不到 | 打开弹窗的用户 | 多层浮层同时出现 | 先关掉别的浮层再操作 | offpeak、dsh-pet 等浮层插件与附录 A 所涉 8 个条目的越界声明 | 中 |
| F-09 | 装完发现有几个功能本来就没开——预期设计，不是坏了 | 精简版用户（14 个出厂停用）+ 3 个设计停用 | 首次安装精简版，或使用默认配置 | 设置 → 插件 → 管理里手动开启（精简版下功能开关页也停用，只剩这一条路） | lite 14 清单 + dsh-pet / dsh-whale-widget / image-paste | 低 |
| F-10 | 外部工具链认不出整合包的描述文件（日常使用无感，接工具链才失败） | 集成侧 | 接入发行校验工具链 | 等描述符修正后重新生成 | 安装包生成工具 | 中 |
| F-11 | ① 装了桌面版后，命令行原版开始报错、起不来；② 原版升级后桌面版跟着乱。已有真实用户报告（issue #283） | 同机装两份并交替使用的人 | 桌面版与原版共用同一主目录且共享链接被重建 | 只保留一份；被串改后从备份恢复 | 桌面端与原生 dsh | 高 |
| F-12 | ① 桥接插件一启动就显示失联；② 走桥接的外部入口全部无响应 | 依赖桥接的扩展功能用户 | 桥接服务未拉起或被拦 | 完全退出重开；仍失联导出诊断反馈 | dsh-eac-core-bridge | 高 |
| F-13 | 界面整体变英文 | 升级/重置后的用户；全局语言 | 应用升级或配置重置 | 设置里改回中文 | dsh-eac-locale-compat、皮肤 | 中 |
| F-14 | 界面出现黑边，内容被裁掉一块 | 全部用户 | 视口锁定与窗口尺寸失配 | 关掉视口锁定再开 | dsh-viewport-lock | 中 |
| F-15 | 市场入口从界面消失 | 靠市场装插件的用户 | 市场插件被停用或升级变化 | 从「插件 → 管理」进市场 | unified-market、dsh-navbar、皮肤 | 中 |
| F-16 | 装好的皮肤全部失效，界面回默认样式（单个皮肤坏只影响那一款） | 换皮肤的用户 | 皮肤切换器损坏或升级 | 重装坏的那款；全部失效就重置外观 | skin-switch、10 款皮肤 | 中 |
| F-17 | 对话里的公式、图表卡片变成纯文本 | 看公式/图表的用户 | 升级后渲染方式变化 | 新开会话刷新显示 | dsh-raw-html | 中 |
| F-18 | 右侧辅助面板不见了 | 用右侧面板的用户 | 升级后面板入口变化 | 从菜单/设置重新开启 | better-sidebar | 中 |
| F-19 | 手机上打不开或功能失效 | 用手机访问的用户 | 升级后手机入口变化 | 重启应用、确认同网络后重连 | dsh-meow-smooth | 中 |
| F-20 | 删掉的会话还在列表里 | 删会话的用户 | 删除未真正执行 | 重启后再次删除 | dsh-session-manager | 中 |
| F-21 | 想回退旧版本但回退失败 | 想回退的用户 | 新版装上后想回旧版 | 用旧版安装包覆盖安装 | dsh-undo-savepoint | 低 |
| F-22 | 配置好的人设丢了 | 用人设的用户 | 升级或重装后配置重置 | 从备份恢复或重新填写 | dsh-soul-md | 中 |
| F-23 | 发图片过去，模型说看不懂 | 发图片的用户 | 图片识别不可用 | 换支持图片的模型或改文字 | picturereader | 中 |
| F-24 | 对话节点导航条没了 | 用导航条的用户 | 升级后导航结构变化 | 重启应用恢复 | dsh-navbar | 中 |
| F-25 | 工具调用输出刷满屏幕 | 连续调工具的用户 | 输出收纳失效 | 收起输出或新开会话 | dsh-conversation-tweaks | 中 |
| F-26 | Skills/MCP 管理入口没了 | 管理技能的用户 | 升级后入口变化 | 从设置其他入口进入 | dsh-dock-settings | 中 |
| F-27 | 新手引导向导不出现了 | 新用户 | 新装或升级后首启 | 在设置里重新触发引导 | dsh-easy-setup | 中 |
| F-28 | 字体设置项消失了 | 调字体的用户 | 升级后设置项变化 | 暂用系统缩放顶替 | dsh-font-custom | 中 |
| F-29 | 设置页变长，条目堆叠难找 | 打开设置的用户 | 设置分组失效 | 刷新页面或重启 | dsh-settings-groups | 中 |
| F-30 | 手机端页面布局错乱 | 手机端用户 | 小屏访问时 | 清缓存或换竖屏重进 | dsh-web-mobile-fix | 低 |
| F-31 | 高峰时段没有收到提醒 | 开了提醒的用户 | 高峰时段到达 | 检查提醒开关并重启 | dsh-offpeak | 中 |
| F-32 | 拖拽文件回到旧行为 | 用拖拽的用户 | 拖拽增强失效 | 重开窗口恢复 | dsh-file-drop-eac | 低 |
| F-33 | 思考过程的中文展开失效 | 用中文展开的用户 | 内核思考格式变化 | 等插件适配新版内核 | dsh-think-zh-expand-eac | 中 |
| F-34 | 点了更新也重启了，界面还是老样子 | 任何更新的用户 | 更新内容嵌在主程序内部，无法热更 | 下载完整安装包覆盖安装 | 应用更新机制 | 中 |
| F-35 | 自己设置的字体过一会儿被改回默认 | 调字体的用户；全局字体项 | 字体自定义与多款皮肤写同一全局设置，后写覆盖先写 | 在当前皮肤的设置里再设一次，或只保留一个来源 | font-custom + 7 款皮肤（口径待复算） | 中 |
| F-36 | 输入框旁的按钮文字不停闪烁变来变去 | 观察到按钮的用户 | 两个界面脚本对同一按钮反复改写 | 停用其一 | conversation-tweaks 与文字改写方 | 中 |
| F-37 | 图片识别结果和新版行为不一致 | 用图片识别的用户 | 插件自带旧版组件拷贝未随更新 | 等插件清理自带拷贝或手动更新 | picturereader（内置 node_modules/src） | 中 |
| F-38 | 插件管理页里一大批（约 46 个）插件显示的版本号比实际发布的旧 | 查看插件列表的用户 | 版本声明滞后（**待复算**：peer 钉 rc.* 统计口径未留痕） | 以实际功能为准；复算后再修数 | peer 钉 rc.* 的插件批次 | 中（待复算） |
| F-39 | 想查某插件来自哪个版本、哪份代码，一条记录都查不到 | 全部插件台账 | 60 条来源记录全部没有版本快照 | 升级前自行备份；等台账补齐 | SOURCES.json 来源台账 | 中 |
| F-40 | 同时装官方版和整合包时，两边互相顶掉对方的应用标识 | 双安装用户 | 双安装并存（运行时 not-tested） | 只保留一份安装；等版本隔离功能 | tauri 应用标识（COEX-02 相关） | 中（not-tested） |
| F-41 | 安装/升级时，正开着的同名程序窗口被强行关闭（未实测） | 升级时开着应用的用户 | 安装器按程序名批量结束进程 | 升级前手动退出应用 | 安装器脚本（COEX-05 相关） | 中（not-tested） |
| F-42 | 卸载后重装，旧设置和旧会话还在 | 卸载重装的用户 | 数据目录卸载时不清理 | 不想保留就手动删数据目录 | 卸载器、用户数据目录 | 中 |

**严重度对账**：高 4（F-05/F-06/F-11/F-12）+ 中 32 + 低 6 = **42** ✓（F-38 复算若升级为高，则高 5/中 31/低 6，需同步更新总账）。

---

## 4. 交叉索引（60 行 × C/F 双列）

**基线 3 项适用范围**：C-01 适用 49 插件行 + 皮肤/SDK 安装期候选；C-03 适用 49 插件；F-02 为条件命中（约 24 个声明 dsh.bundle.patch 的插件）。**孤儿术语**：orphan = 仅基线命中（交叉索引 49 插件行中 C/F 双列均为"—"起首者实测 5 行：行 5/12/25/37/45@dev@`e46ebb2`@交叉索引行计，其中 4 行显式标 orphan、行 5 为反例位注记）；blank = 双列完全空白（实测 0，符合预期 0）。
**专项归属统计**：C-02 = 12 行（scoped 10：compact/composer-dynamic-island/computer-user/dsh-dafeiyu/openclaw-bridge/prompt-custom/soul-md/agent-teams/picturereader/raw-html；裸名 2：better-sidebar/side-session）；C-07 = 8 行（7 插件 + 皮肤 maid-atelier）；F-06 = 21；F-09 = 17（14 lite ∪ 4 defaultDisabled − dsh-stt 重叠）；F-16 = 11（skin-switch + 10 皮肤）；F-35 = 8（font-custom + 7 皮肤写全局字体，口径待复算）；专项 F 单行若干。

| # | id | 命中 C-ID（除基线） | 命中 F-ID（除基线） | 备注 |
|---|---|---|---|---|
| 1 | agent-teams | C-02, C-06 | F-04, F-09 | data-shell-overlay 消费 ×2（client.js:1465、ActivityPanel.js:332） |
| 2 | balance | C-09 | F-06 | .dsh-balance-dock 被 font-custom 未登记依赖 |
| 3 | better-sidebar | C-02, C-07, C-08 | F-06, F-18 | 裸 schemastery；硬编码哈希；junction 设计样本 |
| 4 | change-review | C-07 | F-06, F-09 | 附录 A 在列 |
| 5 | client-file-changes | —（反例位 2147482990） | — | 排除 C-07 |
| 6 | compact | C-02 | F-06 | 附录 A 零归属，已移出 C-07 |
| 7 | composer-dynamic-island | C-02 | F-06, F-08, F-09 | — |
| 8 | computer-user | C-02 | F-06, F-09 | peer ^3.18.1 |
| 9 | conversation-tweaks | C-08 | F-25 | 硬编码哈希 .Sxvs8a_*/._markdown_1nba0_5 |
| 10 | dock-settings | — | F-06, F-26 | — |
| 11 | dsh-dafeiyu | C-02 | F-06, F-09 | class=resource |
| 12 | dsh-feature-toggles | —（orphan） | — | 纯开关型 |
| 13 | dsh-navbar | — | F-24 | 曾被 bridge 5100 具名压值（bridge.ts:407） |
| 14 | dsh-pet | C-01（误命中对）, C-06, C-07, C-10 | F-04, F-05（历史，dev 已修）, F-06, F-09（设计停用） | int32 CSS ×3 + 测试固化 |
| 15 | dsh-pet-settings | C-01（误命中对） | F-06, F-09 | lite 停用 |
| 16 | dsh-phone | — | F-09 | lite 停用 |
| 17 | dsh-raw-html | C-02, C-04, C-05, C-07 | F-03, F-17 | optional 唯一声明者；bundle 件；3000→3006 内部阶梯 |
| 18 | dsh-session-manager | — | F-20 | 前置内核补丁 |
| 19 | dsh-undo | C-05 | F-21 | 目录名 dsh-undo-savepoint；双模 |
| 20 | dsh-webui-prompt-optimizer | — | F-08, F-09 | 曾被 bridge 5100 压值 |
| 21 | dsh-whale-widget | — | F-07, F-09（设计停用） | class=resource；不消费皮肤变量 |
| 22 | eac-core-bridge | — | F-12 | 桥本体 |
| 23 | eac-locale-compat | — | F-13 | — |
| 24 | easy-setup | — | F-06, F-08, F-27 | — |
| 25 | file-changes | —（orphan） | — | — |
| 26 | file-drop-eac | C-07 | F-06, F-32 | 附录 A ×2 |
| 27 | float-window | — | F-08, F-09 | lite 停用 |
| 28 | font-custom | C-07, C-09 | F-06, F-28, F-35 | 与 7 款皮肤双写字体 |
| 29 | image-paste | — | F-08, F-09（设计停用） | 与 picturereader 入口重叠 |
| 30 | meow-smooth | C-06 | F-19 | 读 data-shell-overlay；web-push 依赖 |
| 31 | message-rewind | C-07 | F-06, F-09 | 3200/3300 |
| 32 | mobile-fix | C-08 | F-03, F-30 | 硬编码 .YDXeBa_*（C-08 证据列作 web-mobile-fix，即本条目） |
| 33 | offpeak | C-09 | F-06, F-31 | .dspg_* 定义方；弹窗正常跟随外观 |
| 34 | openclaw-bridge | C-02 | F-06, F-09 | peer * |
| 35 | picturereader | C-02 | F-23, F-37 | macOS external-dependency；自带旧组件拷贝（F-37）；schemastery peer ^3.18.1 |
| 36 | plugin-manager | — | F-01 | — |
| 37 | plugin-shield | —（orphan，防御载体） | — | 保护中心 |
| 38 | plugin-wizard | — | F-08 | 向导弹窗 |
| 39 | prompt-custom | C-02 | F-06, F-09 | peer *；附录 A 零归属 |
| 40 | settings-groups | — | F-06, F-29 | — |
| 41 | settings-scroll-fix | —（修补载体；† = R1 名单沿用项，锚点未逐行复算） | F-06† | data-composer-card 消费 |
| 42 | side-session | C-02 | F-06, F-09 | 裸 schemastery；junction 设计样本 |
| 43 | skin-switch | — | F-03, F-16 | 皮肤行注册后唯一写者（初值由 companion-sync 播种） |
| 44 | soul-md | C-02, C-10, C-11 | F-05（历史，dev 已修）, F-06, F-22 | 缺文件时静默降级（该路径） |
| 45 | terminal | —（orphan，核心锁定） | — | — |
| 46 | unified-market | — | F-01, F-15 | 预检器所在插件 |
| 47 | viewport-lock | — | F-14 | 修复核心体验 |
| 48 | think-zh-expand-eac | — | F-33 | "抢座位"叙事仅 comment 档（dev 克隆 companion-sync.ts:288-289） |
| 49 | dsh-stt | — | F-09, F-26 | sherpa-onnx-node 原生件；LITE∩defaultDisabled 唯一重叠；排除 C-07（无越界声明） |
| 50–51、53–59 | ui-skin-blue-fantasy / dragon-heir / miku / minecraft / qq98 / ths / trading / whale-song / xp（9 款） | —（启停行经 skin-switch 写入） | F-16；F-35（其中 miku/minecraft/qq98/ths/trading/xp 写全局字体，whale-song 不写） | 启停行由 skin-switch 写入，无代码引用 |
| 52★ | ui-skin-maid-atelier | C-07 | F-16, F-35, F-08 | 不注册黑名单；源码级命中成立，F-16/F-35/F-08 均为条件命中（解除黑名单才被用户遇到）；int32+全屏；写全局字体 |
| 60 | sample-sdk-plugin | — | F-12（备注位） | 隔离 SDK 示例 |

（★ maid-atelier 行为 52 号，列于其原排序位；9 款可用皮肤为 50-51、53-59。）

---

## 附录 A · 顶层越界 z-index 清单（19 处，dev@`e46ebb2`）

谓词：`z-index:` ≥ 2147483000，限定 `dsh-desktop/assets` 源码、排除 .map；**宿主侧 bridge.ts 4 行（:486/:518/:541/:546，值 2147483000/2147483000/2147483002/2147483001）另册**，23−4=19 对账成立（19 行为命中口径，内含 1 行同源重复产物，去重后有效声明 18 处）。全量口径（含 950/1000/5000 等低位值的全部 z-index 声明）= 58 处/29 文件，另行登记、不与本表混用。

| # | 位置 | 选择器/载体 | 值 | !important | 插件/皮肤 |
|---|---|---|---|---|---|
| 1 | skins/maid-atelier/lib/client.js:55 | [class*=VOzbGW_overlay] | …647 | ✓ | maid-atelier（+全屏 fixed） |
| 2 | plugins/dsh-pet/lib/client.js:54 | .dsh-pet-root | …647 | — | dsh-pet |
| 3 | plugins/dsh-pet/lib/client.js:59 | [data-shell-overlay] | …647 | ✓ | dsh-pet |
| 4 | plugins/dsh-pet/lib/client.js:110 | .dsh-pet-call | …647 | — | dsh-pet |
| 5 | plugins/dsh-message-rewind/lib/client.js:372 | .dshrw-toast | …300 | — | message-rewind |
| 6 | plugins/dsh-message-rewind/lib/client.js:351 | .dshrw-overlay | …200 | — | message-rewind |
| 7 | plugins/dsh-font-custom/lib/client.js:266 | .__fc_wmock_overlay | …100 | — | font-custom |
| 8 | plugins/dsh-raw-html/lib/client.js:2125 | 字体面板 cssText | …006 | — | raw-html |
| 9 | plugins/dsh-raw-html/lib/client.js:1410 | .aes-picker | …006 | — | raw-html |
| 10 | plugins/dsh-raw-html/lib/client.js:1495 | .aes-fontcat-menu | …003 | — | raw-html |
| 11 | plugins/dsh-raw-html/lib/client.js:1514 | .aes-tagmenu | …003 | — | raw-html |
| 12 | plugins/dsh-raw-html/lib/client.js:1470 | .aes-modal | …002 | — | raw-html |
| 13 | plugins/dsh-file-drop-eac/lib/client.js:394 | [data-dsh-file-preview-modal] | …001 | — | file-drop-eac |
| 14 | plugins/dsh-raw-html/lib/client.js:1436 | 查看器全屏层 | …001 | — | raw-html |
| 15 | plugins/dsh-change-review/lib/client.js:67 | toast cssText | …000 | — | change-review |
| 16 | plugins/dsh-file-drop-eac/lib/client.js:696 | 拖放指示 cssText | …000 | — | file-drop-eac |
| 17 | plugins/dsh-better-sidebar/lib/client.js:13342 | 调试 bar cssText | …000 | — | better-sidebar |
| 18 | plugins/dsh-better-sidebar/lib/client-registry.js:13342 | 同上（重复构建产物，**低/不另计**） | …000 | — | better-sidebar |
| 19 | plugins/dsh-raw-html/lib/client.js:1158 | 顶栏入口 cssText | …000 | — | raw-html |

**反例位与注释行（不入表）**：client-file-changes client.js:756 = 2147482990（主动低于内核标题栏 10）；dsh-pet client.js:56 为注释行引用 …647（仅宽谓词命中，非声明）。
**剔除口径**：位运算数值（xterm/LSP）、第三方库代码（mermaid）、文档文字、`client.js.map` 源映射（sourcesContent 会重复计入）。

---

## 附录 B · 覆盖登记表（覆盖统计，不进冲突表）

**计数口径**：本机 grep 为 ugrep 7.8.4 WIN64，单行 JSON 必须用 `grep -o | wc -l` 计数；统一限定 `dsh-desktop/assets`、显式管道排除 `.map`、命令先贴后跑。

| # | 条目 | 定稿数字（三分法） | 命令原文 | 状态 |
|---|---|---|---|---|
| 1 | `--dsw-alias-` 消费文件·净口径 | **52**@dev@`e46ebb2`@仅js净 | `grep -rl --include="*.js" -e "var(--dsw-alias-" dsh-desktop/assets \| grep -v '\.map' \| wc -l` | 已定稿 |
| 2 | 同上·宽口径 | **54**@dev@`e46ebb2`@js+2文档 | `grep -rl -e "var(--dsw-alias-" dsh-desktop/assets \| grep -v '\.map' \| wc -l`（多出 raw-html 的 CHANGELOG.md 与 docs/EVOLUTION-2026-08-24.md） | 已定稿 |
| 3 | 同上·含 .map 全口径 | **57**@dev@`e46ebb2`@含3.map（agent-teams/meow-smooth/webui-prompt-optimizer） | 同上无排除 | 已定稿 |
| 4 | `--dsw-alias-` 定义方 | **12**@dev@`e46ebb2`@定义口径 = 10 皮肤 + dsh-agent-teams + dsh-font-custom | `grep -rlE -- '--dsw-alias-[a-z0-9-]+:' dsh-desktop/assets --include=*.js \| grep -v '\.map' \| wc -l` | 已定稿（2026-09-15 独立复算，组成全等） |
| 5 | `data-composer-card` | **81 次/8 文件**@净口径，revision 不变量（main@`8c17e99` 与 dev 同值）；91/9 含 meow-smooth .map 10 次 | 同式 -o/-rl | 已定稿 |
| 6 | `data-ds-dark-theme` 消费 | **14**@dev@`e46ebb2`@文件净口径（better-sidebar 3 bundle + 10 皮肤 + 类型声明） | `grep -rl 'data-ds-dark-theme' dsh-desktop/assets \| grep -v '\.map' \| wc -l` | 已定稿（2026-09-15 独立复算，组成全等） |
| 7 | `data-aionui-` 消费 | **8**@dev@`e46ebb2`@文件净口径（blue-fantasy/dragon-heir/miku/minecraft/qq98/ths/whale-song/xp） | `grep -rl 'data-aionui-' dsh-desktop/assets \| grep -v '\.map' \| wc -l` | 已定稿（2026-09-15 独立复算，组成全等） |
| 8 | body/head 挂载 bundle | 55 | 权威记录 | **待复算** |

---

## 附录 B-2 · 预检器问题码对账表（安装期护栏现状）

| 问题码 | 级别 | 对应 C 类 | 对账说明 |
|---|---|---|---|
| PATCH_DUP_ID / PATCH_DUP_NAME | refuse | C-01（安装期半边） | 需并注运行期 heal 才构成完整护栏 |
| BUILTIN_COLLISION | refuse | 来源-市场 vs 内置 | 市场候选与内置同名拒绝 |
| BUNDLE_COLLISION | refuse | C-05 | bundle 挂载 id 冲突的安装前检出 |
| DEP_REINSTALL | warn | C-02/运行环境 | 受 C-03 死检查限制，实际多为空转 |
| SETTINGS_NS_CLASH | warn | 设置命名空间（**死检查**：dsh.settings.key 结构化计数 0/49） | 仅测试夹具可命中 |
| CORE_DEP_CLASH | warn | C-02/运行环境 | 只读 dependencies 段，本发行版语料恒为 0 |
| （缺失）optional/peer 漏读 | — | C-04 | 预检器无此码，以 C-04 行记录盲区 |

---

## §5 · 边界声明与待确认

**边界**：①内核内部行为无法从仓库内证明，相关说法一律 not-tested；②“没找到”≠“不存在”，负面结论须附检索完整性证明；③“静默失效 > 响亮崩溃”是倾向不是定律，soul-md 修复版故意静默降级为反例。

**待确认**：billing 独立视图字段、批量 ≤10 条节奏、aio-v1 线处置（刷新或标 frozen）、`plugin:validate` 补 CI（3 行 yaml）、dsh-stt 原生件进打包裁剪清单、F-38“约 46 个”复算口径。
