<div align="center">
  <img src="icon.svg" alt="Our Free Model — DeepSeek Harness 免费模型插件" width="120">

# dsh-our-free-model

**简体中文** | [English](README_EN.md)

  <img alt="许可证" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square">
  <img alt="零依赖" src="https://img.shields.io/badge/dependencies-zero-4b6fff?style=flat-square">
  <img alt="无构建步骤" src="https://img.shields.io/badge/build%20step-none-7da1de?style=flat-square">
  <img alt="适配内核" src="https://img.shields.io/badge/dsh-0.1.5--0.1.7--rc.2-2f6f4f?style=flat-square">
  <img alt="状态" src="https://img.shields.io/badge/status-beta-f0a441?style=flat-square">

</div>

<div align="center">

> 你只需在 dsh 里装上这个插件，无需登录、注册、填 API Key 或任何其它操作，
> 就能用上包括 Muse Spark 1.3、MiMo V2.6 在内的前沿模型——完全免费，不限量。
>
> *All you do is install this plugin in dsh: no login, no sign-up, no API key, nothing
> else. The frontier models are just there — Muse Spark 1.3, MiMo V2.6 and the rest.
> Free, with no usage cap.*
>
> 模型清单跟随上游刷新，可用性由**你自己这台机器的网络出口**实测得出，
> 思考强度下发的是真实预算而不是提示词，另附一个 OpenAI 兼容的本地转发端口。
>
> 纯插件挂载：不改内核、无构建步骤、零依赖。

</div>

---

## 亮点

- **装完即用，没有配置环节**——不需要账号、不需要 Key、不需要去哪个后台开配额。
- **清单跟随上游**——模型集合、上下文长度与能力每次刷新重新拉取，不是写死在插件里的一份快照。
- **选择器只给真能用的模型**——上游清单点名、但网关明确拒绝路由的模型（回 `Model is unavailable`、404 找不到这个 id）会从下拉框里移除，只在设置页留痕并写清拒因；网关自己的毛病（5xx）、配额（429）、超时断网这些**不是对模型的判定**，一律保持可达；地区门拦截的单独归到 `region-limited` 分组。整轮全部被拒时一律保留，绝不让选择器变空。
- **公告中心 + 实时推送**——仓库主人在仓库里编辑一份 JSON 并推送，所有安装最迟在一个轮询周期内收到；内容是白名单约束下的 HTML，支持图文排版；`urgent` 级别直接全屏弹窗；可选系统级通知。
- **应用内升级**——设置页一键升级：下载 → SHA-256 校验 → 备份 → 原子替换 → 校验回读 → 热重载，任一步失败自动回滚到上一个版本。
- **热重载**——升级与代码更新即时生效，不需要重启应用；也可在设置页手动触发，或开启文件监视自动重载。
- **流式响应认出 body 而不是认出 header**——网关在高负载下会用 `application/json` 的 content-type 回一整套 SSE 帧，插件按 body 的形状判定并把已嗅探的字节重新喂回流，既不会整轮报错，也不会因为一个 header 说谎就把能用的模型判成不可用。
- **思考强度真的生效**——`Light / Balanced / Deep` 对应输出 token 预算 2 048 / 8 192 / 模型上限，且逐次调用留痕。思考关不掉的模型（MiMo V2.6 这类）三档整体翻倍为 4 096 / 16 384 / 模型上限，因为思考与正文抢的是同一份额度；设置页每张模型卡都直接印出这一档实际会下发的上限。它不是把一个 effort 字符串丢给上游然后假装有用（原因见[为什么用预算而不是 reasoning_effort](#为什么用预算而不是-reasoning_effort)）。
- **无浏览器界面也能跑**——插件只把 `llm` 当作硬依赖，没有 web server 的 composition（`dsh-tui` 这类）里照样启动、照样出模型；看板半身挂在一条自己的 fiber 上，等 `webServer` 出现再挂载，所以既不会把模型车道拖下水，也不会因为插件先于 web 服务加载就永远丢掉设置页。
- **用量看板，全部留在本机**——Token 热力图、总量曲线（可看总计或单个模型）、输出速度与首字延迟逐次采样。不上传任何东西。
- **OpenAI 兼容转发端口**——本机其它工具用一个 base URL + Key 就能调用这些模型。
- **接口有鉴权围栏**——插件的 HTTP 路由优先级高于内核 `/api`，因此自带与内核一致的信任检查（优先复用 composition 的 connection 服务，缺失时退回结构化围栏）。

## 你会看到什么

**输入框的模型选择器**

| 分组 | 内容 |
| --- | --- |
| `Our Free Model` | 当前网络出口可直接使用的模型 |
| `Our Free Model · region-limited` | 上游对该地区不放行的模型，保留可见但单独隔离 |

被判定为「点名但不路由」的模型不出现在任何分组里——它们只在设置页的**不在选择器中**分组留痕，
带上拒因与探测时间，某一次探测重新通过后会自动回到选择器。

**设置页 `设置 → Our Free Model`**，六个分区：

1. **模型清单**——每个模型的可用性、视觉还是纯文本、上下文窗口、最长输出、各思考档位实际下发的
   输出上限、实测首字延迟，以及一次单调用基准测试按钮。
2. **公告中心**——仓库主人推送的公告流：未读计数、紧急徽章、单条/全部已读、检查新公告按钮、系统通知开关。公告正文按白名单渲染 HTML。
3. **用量看板**——总览计数、17 周 Token 热力图、总量曲线（Token / 请求数切换，总计与单模型切换）、速度迷你图、按模型汇总表。
4. **本地转发**——开关、监听地址与端口、复制 base URL、显示 / 复制 / 轮换 API Key，并给出一条可直接跑的 `curl` 示例。
5. **插件设置**——总开关、是否展示地区受限模型、探测间隔、默认输出上限，以及当前探测到的出口 IP 与国家。
6. **插件升级**——当前/最新版本、检查更新、一键升级（含进度与失败原因）、最近一次升级历史、热重载按钮与文件监视开关。

**首次启动公告**——分 5 页（前言 / 模型清单 / 使用步骤 / 功能介绍 / 公告与升级），确认一次后不再弹，除非文案版本号被提升。

## 安装

### 命令行（纯 `dsh web`）

```bash
dsh plugin --profile web add /绝对路径/dsh-our-free-model
```

装完重启一次应用。`--profile` 填你实际使用的那个。

### DSHEAC AIO / 桌面端：先看这段

桌面端在拉起 web 服务之前会跑一道 profile 闸门。它的扫描器**只**放行 dsh 自己在
`.dsh-module-fallback` 下生成的链接；profile 目录树里出现**任何其它符号链接或目录
junction，应用会直接拒绝启动**，报：

```text
PROFILE_UPGRADE_REQUIRED: offline dependency migration is not yet available
```

所以桌面端**不要用 `link:` 依赖安装，也不要建 junction**。请用应用内的插件管理器，
或者放一个真实目录。

手工以真实目录安装，在 `<DSH_HOME>/profiles/<profile>/` 下做三件事：

1. 把发布文件**复制**进 `node_modules/dsh-our-free-model/`
   （`index.js`、`client.js`、`src/`、`locale/`、`icon.svg`、`cordis.patch.yml`、`package.json`）
2. `dependencies` 里加 `"dsh-our-free-model": "1.1.2"`——写版本号，**不要写 `link:`**
3. `dsh.profile.bundles` 末尾追加 `"dsh-our-free-model"`

> **不要**再往 `cordis.patch.yml` 里加条目。被 `dsh.profile.bundles` 引用的包，它自带的
> patch 层会自动生效；两处都注册会报 `duplicate loader entry id: our-free-model`。

#### 整合包（托管安装）

插件被整合包（EAC 整合包、Mojobox 等）安装时，由**安装方**负责更新时机与字节：
在安装时把 bundle config 设为 `distribution: 'managed'`（或向 settings.json 写入
同一字段），插件的应用内升级、公告 feed 与热重载即全部停用——两个写入者同时操作
同一个安装目录只会把它写坏；模型 lane 不受影响。相关验收见
`scripts/offline-test.mjs`；目录就绪记录（manifest 0.15 / 出处 / 许可 / 完整性）
在 `catalog/` 下。

### 启动桌面端前先自检

不要盲试，直接调用桌面端自己的闸门代码：

```bash
node -e "
const g = require('<APP_ROOT>/sidecar/dist/lib/profile-upgrade.js');
const app = '<APP_ROOT>', profile = '<DSH_HOME>/profiles/<profile>';
console.log(g.planProfileUpgrade(app, profile));
g.assertProfileStartup(app, profile);
console.log('startup gate: PASS');
"
```

期望看到 `status: 'compatible'`、`mismatches` 为空数组，然后 `PASS`。
只想确认 bundle 组合是否正确、不启动界面：

```bash
DSH_HOME=<DSH_HOME> dsh --profile <profile> --dump-config | grep our-free-model
```

应当只出现**一个** `id: our-free-model`。

### 安装失败：`ERR_PNPM_VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF`

这是**目标 profile 的 pnpm 状态问题，与插件仓库无关**（报错发生在下载插件之前）：profile 里已有的
`node_modules` 是旧版 pnpm 生成的，dsh 更新后自带的 pnpm 版本变了，pnpm 拒绝在旧参数上继续安装。
关掉 dsh，删掉 profile 的 `node_modules` 和 `pnpm-lock.yaml` 让它重建，然后重新安装：

```bash
rd /s /q "%DSH_HOME%\profiles\web\node_modules"
del "%DSH_HOME%\profiles\web\pnpm-lock.yaml"
```

同时出现的 `Ignoring broken lockfile` 警告会随重建一起消失。

## 使用说明

**选模型**：打开输入框的模型选择器，选 `Our Free Model` 分组下的任意模型。选择按会话持久。

**调思考强度**：同一菜单里的 `Effort`，三档 `Light / Balanced / Deep`。档位越高，思考占用的
输出预算越多；上限是**强制下发**的，所以差异可测量，不是装饰。它是思考与可见回答**共用**的一
份额度，所以思考关不掉的模型会把三档整体抬高（`设置 → Our Free Model` 的模型卡上写着每一档
的实际数字）。如果觉得回答被截断，先换 `Deep`，或调高设置里的单次输出上限。

**给其它本地工具用**：`设置 → Our Free Model → 本地转发`，启用后复制 base URL 并生成 Key。支持：

```text
GET  /v1/models
POST /v1/chat/completions     流式与非流式
POST /v1/responses
```

**重新核对地区**：点"重新探测可用性"，会按当前出口重跑探测。开/关 VPN 后再点一次，
地区受限模型会在两个分组之间自动迁移。

**接收公告**：一切自动。仓库主人推送新公告后，运行中的插件在一个轮询周期内（默认
30 分钟，也可在公告中心点"检查新公告"立即拉取）收到通知：普通公告弹 toast，
`urgent` 级别直接全屏弹窗，两者都会出现在公告中心并保留未读标记。想同时收到
系统级通知，在公告中心点"开启系统通知"。

**升级插件**：`设置 → Our Free Model → 插件升级` → 检查更新 → 立即升级。全过程
在应用内完成（下载 → 校验 → 备份 → 替换 → 热重载），不需要重新安装，也不需要
重启应用。升级失败会自动恢复上一个版本并给出原因。

## 实现结构

```text
index.js        Host 半身：适配器注册、清单与可用性探测、设置/用量存储、
                webServer 路由、转发端口生命周期、公告/升级/热重载接线
adapter/        内核接缝：全包唯一允许 import @deepseek-ai/* 的地方
                （kernel.js：attribution User-Agent，失败降级为字面量）
src/adapter.js  结构性 LlmAdapter：providerInfo、listModels、resolveModel、
                prepareCall、stream、providerRetryPolicy
src/upstream.js 网关身份：凭据、session/request id 铸造、工具指纹、按线协议选端点
src/stream.js   三种线协议解码（chat / messages / responses）归一为 harness StreamChunk，
                并做不相交的 token 计数
src/messages.js harness 消息 -> 各线协议形态，外加工具调用配对修复
src/effort.js   思考档位 -> 输出预算
src/forward.js  独立的 OpenAI 兼容监听器
src/trust.js    插件路由的请求信任围栏（connection 服务桥 + 结构化围栏）
src/push.js     SSE 推送枢纽：公告到达、更新可用、升级完成
src/feed.js     远程公告 feed：多源拉取、校验、缓存、到达检测
src/updater.js  应用内升级：清单校验、SHA-256 分级校验、备份、原子替换、回滚
src/reload.js   自热重载：镜像内核 HMR 的缓存清除 + 重导入 + 重注册 + 回滚序列
client.js       浏览器半身：手写 ModuleLoader bundle，无构建步骤
```

几个值得知道的架构决定：

- **一个适配器，两条 provider 路由**。harness 的模型选择器严格按 provider 路由分组，
  而清单的线格式里根本没有 group / tag / badge 字段。所以要出现独立的 `region-limited`
  标题，唯一办法就是再注册一条路由；又因为客户端会丢弃空分组，一旦地区不再限制，
  两个分组会自动合并成一个。
- **结构性实现适配器，不 import `@deepseek-ai/dsh-llm`**。内核从不检查 `instanceof`，
  所以鸭子类型即可。这让插件不把依赖钉死在某个内核版本上，也是同一份代码能同时跑
  0.1.5 与 0.1.7 的原因。
- **自己的 JSON 存储，而不是 settings seam**。settings 注册 API 在两版内核间不一致；
  私有 JSON 存储行为一致，并且转发 Key 落在一个 `0600` 文件里，不进入任何共享设置文档。

### 为什么用预算，而不是 `reasoning_effort`

实测过：在这条车道上把 reasoning-effort 字符串发给上游是**空操作**——三个不同名义档位
反复采样，思考 token 数量在统计上无法区分。做一个不起作用的控件比不做更糟，
所以思考强度实现为**硬性输出 token 上限**，它确实会约束——留痕的思考 token 随档位单调上升。

### 三个真实浪费过调试时间的内核行为

这里摘出来是因为任何写 provider 插件的人都会踩：

1. **`providerRetryPolicy()` 被原样存下来用**。两版内核都不解析它，而退避调度器读的是
   **顶层**的 `initialDelayMs / maxDelayMs / jitterRatio`。把这三项嵌在 `backoff:{}` 里，
   它们读到 `undefined`，于是 `undefined * 2ⁿ = NaN`，而持久会话日志直接拒绝非有限数——
   一个本可恢复的瞬时故障就变成整轮对话报废。要返回**已解析好的扁平策略**。
2. **一次被打断的工具调用会永久毒化该会话**。没有对应结果的工具调用重放时上游回
   `400 invalid_request_error`，此后该会话里**每一次**请求都失败。本插件在发送前修复配对，
   三种线协议共用同一处修复。
3. **没在 `inject` 里声明的服务，属性直读是抛错不是 `undefined`；而 `ctx.get()` 在服务
   "还没被 provide 出来"时返回 `undefined`。** 这两条本轮各咬了一口：把 `inject` 缩到只剩
   `llm` 之后 `typeof ctx.interval === 'function'` 直接抛 `cannot get property "timer"
   without inject`（`ctx.interval` 是 `timer` 服务上的 mixin），插件在**所有** composition
   里都不再激活；改用 `ctx.get('webServer')` 之后它返回 `undefined`——不是因为没有 web
   server，而是因为插件比 web 半身先加载——于是设置页路由一条都没挂上。正解是
   `ctx.inject(deps, callback)`：为需要的服务开一条自己的 fiber，让它去待命，
   而不是在加载的那一瞬间猜一次。

### 为什么按 body 的形状而不是 `Content-Type` 读响应

这条车道会在高负载下用 200 + `application/json` 回一整套 SSE 帧。旧写法信 header，
于是 `await response.text()` 把整条流读成字符串、`JSON.parse` 失败、整轮报废——而那个
错误对象带着 `status: 200`，还会让可用性探测把这个**完全能用**的模型判成"不可路由"，
从下拉框里消失一轮。现在读法是先嗅探首块（≤4 KB）按形状分流，再把已经读到的字节
重新喂回流里，实时性一点不损失；`src/http.js` 的 `sniffBody` 是唯一判据。

### 为什么速度那一栏会显示 `—`

早先的版本给一条实际只有 ~40 tok/s 的车道报出过 2 941 tok/s。问题不在网关——直连
读包的探针显示 64 个帧跨了 5.6 秒，是实打实的增量投递——而在分子分母量的不是同一段
时间：一次调用计费 422 个输出 token，其中 291 个是**一个帧都没流出来**的 reasoning，
它们早在第一个可见 token 之前就生成完了，可窗口的起点正是那个 token。拿整段
completion 去除答案文本落地的几秒钟，不叫解码速度。

所以现在只有"装得下分子的那段时间"才允许出速率：`windowTokens()` 把没流出来的
reasoning token 从分子里剔掉，`decodeWindow()` 拒掉短到没法计时的窗口和快得不真实的
速率，看板和模型表都改成 `Σtoken / Σ秒` 而不是把每次的速率再取平均——曾经有一个 1 ms
的窗口把 26 次调用的均值抬了三个数量级。于是答案挤在一两个大帧里落地的模型，就是
没有可测的输出速度，它显示 `—`。

## 验收情况

在 Windows 环境、对真实上游实测。本节按轮次记录，并写明每一行的验证方式——只有标着
「真实上游」与「实机点击」的那些才是用户在界面上会看到的行为。

### 本轮：v1.2.2（对应 issue #1–#4、#6）

每一行都写明**用什么方式验的**：`离线假内核`不出网、`真实上游`是插件真打网关但跑在
手搭的 cordis context 上、`真实内核`才是把插件装进 dsh 里启动。这三者的差别本轮吃过一次
教训——见最后一行。

| 项目 | 方式 | 结果 |
| --- | --- | --- |
| 发布清单与实物一致 | 离线 `build-manifest.mjs --check` + `release-e2e.mjs` | 26 个发布文件全部一致。改动前线上 main 的 1.2.1 清单已漂移 **6 个文件**（`index.js`、`README.md`、`README_EN.md`、`src/catalog.js`、`src/store.js`、`src/upstream.js`），比 issue #1 报的 2 个更多——即提出 issue 之后又复发了一次。现已随版本重生成；`--check` 与新增的 `release-e2e.mjs`（拿真实清单+真实文件把升级完整跑一遍，含"清单谎报 1 个字节必须被拒绝"的反向对照）都进了 `npm test` 和 CI。本轮补上两个同源漏洞：清单现在按 **LF 归一化后的字节**计算（`.gitattributes` 是 `* text=auto eol=lf`，而 Windows 上的编辑器可以把工作区写成 CRLF 且 `git status` 不报错——这正是 issue #1 上一次的回来方式），目录也改成**递归**收集（旧的单层扫描会漏掉 `src/lib/x.js` 这类嵌套文件：npm 会装它、清单里没有它，而 `installStaged` 会把清单没点名的文件从用户机器上删掉）。两条各有一条常驻断言，后者还把 26 个文件全量转成 CRLF 再跑 `--check` |
| 离线套件 | `npm test`（14 个套件） | 14/14 通过；不出网、不花免费额度。套件端口取自临时端口段（写死的端口被两个进程同时跑会撞车：本轮实测——先占住 tui 写死的那个端口再跑它，请求打到别人家的监听上，套件一直挂到 runner 的超时被杀、打印出来的"失败详情"是六行 `ok`），runner 对每个套件有 60 s 硬超时并把挂死原因打出来 |
| 新测试真的能咬住回归 | 逐条把旧行为改回去再跑 | `computeMembership` 的未判定模型：改回旧写法 → picker 报 `Cannot read properties of undefined (reading 'state')`（2 条检查失败）；`postStreamed` 的 Content-Type 判定：改回旧写法 → sniff 7 条检查失败。恢复后各自全绿。本轮新增的断言另跑了一遍**变异测试**：在临时副本里把 9 处修复逐个改回去再跑对应套件，9/9 变红（逐条输出见下方"本轮复审"三行） |
| 探测判定与选择器广播 | 真实上游 `host-selftest.mjs` | 清单 10 个模型 → 主分组 7 + `region-limited` 2，转发端口 `/v1/models` 同步 9 个；`deepseek-v4-flash-free`（`Model is unavailable`）移出下拉框并在设置页保留拒因；5xx/429/断网一律保持可达（issue #3 的判定不再误伤抖动） |
| 未判定模型不再致命 | 离线假内核 `picker-test.mjs` | 清单新增一个模型、它的探测被测试按住时，`listModels` 与 `/summary` 都正常返回，该模型 `availability=unknown` 且照常广播 |
| 思考档位仍然强制 | 真实上游，MiMo V2.6 Flash | `light` 现在发 4096：同一 prompt 下 2 980 tokens 正常 `stop`；改动前 `light`=2048 在同一个 prompt 上以 `length` 收尾 |
| 长回答不再被截断 | 真实上游 `probes/long-answer.mjs` | `balanced` 实发 `max_tokens=16384`，一次请求 10 164 output tokens（19 914 字符、194 秒）后 `finish=stop`；同样的请求落在旧的 8192 档上必然以 `length` 结束——就是 issue #2 报的现象。设置页模型卡印出每一档真实数字（`默认档上限 16K`，已在浏览器里读到） |
| SSE 帧不再被 header 出卖（issue #6） | 离线假网关 `sniff-test.mjs` | 200 + `application/json` + 体内是 SSE 帧：正常吐 token，不报错；跨 chunk 截断的中文字符、超过 4 K 嗅探窗口的 400 帧长流、单包 JSON、空 body、HTML 杂七杂八全部按形状分流。同一场景在旧代码上会让探测把可用模型判成 `unavailable` |
| 无 web server 的 composition | 离线假内核 `scripts/tui-test.mjs` | 只挂 `llm` 时 `apply()` 不抛错、注册两条路由、跑完一轮流式对话、转发端口起来并拒掉无 Key 请求；后台循环走普通 unref 定时器。看板半身停在待命状态，`webServer` 一出现就自己挂上两条路由。**真实 dsh-tui 尚未实机验证**：本机两套内核（dsh 0.1.7 源码构建、AIO 6.9.3）都不含 tui profile |
| 插件在真实内核里真的能装 | **真实内核** `dsh` 0.1.7-rc.1 web，端口 3099 | 启动无 `did not activate`；`/api/our-free-model/summary` 200（10 个模型：6 available、2 region-blocked、1 unknown、1 unavailable）、`/events` 起来推 hello；浏览器里进 `设置 → Our Free Model` 逐项读到 10 张模型卡、`不在选择器中` 分组、`思考不可关` 与 `默认档上限 16K` 标签，控制台零报错。本轮最初版本在这一步是**失败**的：`inject` 只留 `llm` 之后读 `ctx.interval` 抛 `cannot get property "timer" without inject`，插件在所有 composition 里都不再激活 |
| 复审自己抓到的两个新问题 | 定向复现 + 常驻断言 | ① head 嗅探阶段被 abort 时抛的是原生 `AbortError`（`code` 是数字 20），`toFailure` 认不出来会降级成 `TRANSPORT`——而 `TRANSPORT` 在可重试名单里，用户主动取消的回合有被内核重试的口子；现在三条读取路径共用 `classifyStreamFailure`，sniff 里两条 abort 断言常驻。② 提交后我又改了 `src/http.js`，清单再次漂移，被 `--check` 与新加的 `release-e2e.mjs` 当场逮住——门禁按设计起作用，但也说明**任何一次改动后都得重跑** |
| 本轮复审：请求路径上两处"丢整轮/重复计费" | 本地假网关定向复现 + 常驻断言 | ① `readHead` 要填满 4 KB 才判定形状：一条**已经说完**的短回答，只要网关不立刻关掉连接，就会在嗅探窗口里等到 deadline，然后连已经读到的帧一起被 cancel 丢掉——整轮以一个可重试的 `TIMEOUT` 收场，内核再发一次、额度再花一次（复现输出就是 `frames delivered: 0`）。现在首帧认出是流就立刻放行，顺带不再压住每轮开头那 4 KB 的 token。② 流内错误的分类写进了 `llmCode`，而 `toFailure` 只读 `code`——于是每一条流内拒绝都降级成可重试的 `TRANSPORT`（已经吐过 token 的回合被重发），中途的 `RegionError` 也永远触发不了换出口重探。现在流内错误与错误信封走同一个 `classifyFailure` |
| 本轮复审：设置入口没做类型检查 | 离线 `picker-test.mjs` + `effort-test.mjs` | `probeIntervalMinutes:'abc'` → `Math.max(1,'abc')` 是 NaN，而 `setTimeout(fn, NaN)` 在 Node 里等价于 1 ms：一秒一整轮全量探测。`defaultMaxTokens:0`（把设置页输入框清空就会发 0）→ `min(容量, 0)`，每一轮都被裁到 512 token，而选择器照旧印着 4 K/16 K/32 K 的梯子。现在数值项在 `POST /settings` 入口和取用处各设一道，非正值一律按"没设过"回落。同一批断言还钉住转发端口**只能绑回环**（`0.0.0.0` 直接 400 并写明原因），以及 `connection` 的准入决定是**逐请求**读的（改回 apply 时一次快照 → 那条 401 断言当场变红） |
| 本轮复审：三条"看起来在测"的套件 | 变异测试（临时副本里逐条改回旧行为） | `retry-safety-test.mjs` 的四个用例全都落在"模型不在清单上"的提前返回（传的是 `model:"our-free-model/test-model-free"`，而 `baseModelId` 只剥 label 不剥路由），一个请求都没发出去过——改成真实调用后 7 个用例逐个钉住 code／可否重试／是否触发区域重探。`tui-test.mjs` 的 unref 断言比的是两个不同总体的计数（把 120 s 循环的 `unref()` 去掉仍然全绿）→ 改为按周期逐个核对。写死在套件里的端口（tui 的 18931）与另一个进程抢同一个端口时，表现为 180 s 静默挂死、打印出来的"失败详情"是六行 `ok` → 端口取自临时端口段，runner 加 60 s 硬超时并如实说明"它挂住了" |
| usage 计数干净 | 离线 `retry-safety-test.mjs` | 没有 `prompt_tokens_details` 的 usage 不再把 `inputTokens` 算成 `NaN`；转发端口按 `prompt_tokens/completion_tokens` 回报，被网关拒绝的转发请求返回错误而不是空的 200。Messages 线上 `message_delta` 只带 output 一侧，旧写法把整条 usage 记录覆盖掉、每个 Claude 回合的 prompt tokens 记成 0；现在按字段合并 |
| 本轮复审：5xx 的原因短语不再被当成判定（issue #3 的同类回归） | 离线 `sniff-test.mjs` + 反向验证 | `stateOf` 的消息兜底匹配不看状态，而反向代理给 503 的标准原因短语就是 `Service Unavailable`——过载的网关于是被读成"点名拒绝了这个模型"，模型一个个从选择器里消失（issue #3 修掉的代价从消息兜底那条路回来了）。现在这条兜底只在状态没能替网关回答时才出声；响应体里点名模型的（含 5xx 下的 `type: ModelError`）仍算拒绝。新增 4 条断言，还原旧实现后其中 2 条立刻变红 |

### 上一轮：v1.1.2（公告、升级、热重载与信任围栏）

全部新能力都做了**实际操作验证**，包括浏览器与 DSHEAC AIO 桌面窗口内的逐项点击：

| 项目 | 结果 |
| --- | --- |
| `dsh` 0.1.7-rc.1（源码构建） | 启动无报错；选择器两个分组正确；多轮工具调用完成 |
| `dsh` 0.1.5-rc.2（DSHEAC AIO 6.9.3 内核） | 启动无报错；与已装的其它第三方插件并存 |
| EAC 启动闸门 | 安装时与**应用内升级之后**各跑一次：`compatible` / `PASS` |
| 模型可调用性 | 10 个清单模型全部可达（该轮行为：连探测失败/暂不可用者也保留在选择器里；v1.2.2 起不再广播判定不可用的模型）；real chat、多轮工具、视觉输入在两套内核通过 |
| 真实 harness 对话 | dsh web 与 AIO 桌面端各自完成一轮真实对话并收到回复 |
| 公告 feed | 本地"仓库服务器"上推送新公告 → 运行中的两端在一个轮询周期内到达 |
| 公告中心 UI | 4 条公告渲染（粗体/代码/链接/列表）、紧急红色徽章、未读点、单条/全部已读 |
| 紧急公告 | `urgent` 推送触发全屏弹窗，"知道了"即写入已确认状态 |
| Toast + 系统通知 | 新公告实时 toast；桌面端 `window.Notification` 通道存在（WebView2 权限策略拒绝授权时 UI 如实提示） |
| 应用内升级 | dsh web 与 AIO 桌面端各完成一次 1.1.0 → 1.1.2 升级：23 文件下载、SHA-256 校验、备份、替换、热重载；升级后 `/meta` 立即报新版本 |
| 升级安全性 | 哈希不匹配 → staging 丢弃、已装包不动、历史记录失败；升级产物通过 EAC 闸门并完整重启加载 |
| 热重载 | 按钮、API 两种入口；ESM 缓存清除 + 重注册 + 回滚序列；`generation` 递增、客户端经 localStorage 提示一次 |
| 客户端 bundle 热更 | 替换 `client.js` 后浏览器端由内核 client-hmr 自动重载（实测两次） |
| 信任围栏 | 非 loopback Host / 跨站 `sec-fetch-site` / 异源 `Origin` 一律 403；无 cookie 回环请求 401（与内核 `/api` 一致） |
| SSE 推送 | `hello`/`announcements`/`update`/`upgraded` 事件实测；热重载后自动重连 |
| 思考强度传递 | light/balanced/deep 三档实测：reasoning 2048（被预算截断）/ 3386 / 3522，输出单调上升 |
| 地区门 | 受限模型报 `REGION_BLOCKED` 并留在自己的分组 |
| 转发端口 | `/v1/models`、流式与非流式 `/v1/chat/completions`；无 Key 请求被拒 `401` |
| 界面文案 | 无乱码；任何面向用户的位置都不出现上游厂名 |

**没验证的部分如实说明**：OS 级通知的**最终视觉呈现**没有逐像素确认——AIO
桌面端的 WebView2 权限策略拒绝了 `Notification.requestPermission()`（插件的
Tauri 通知通道存在，纯浏览器路径可用，被拒时设置页如实显示"需要在系统/浏览器
设置里手动恢复"）；AIO 对内置插件有报告式的静态启发扫描（`TROJAN_EXFIL_ENV`
对 `src/upstream.js` 的 env+URL 邻近模式会记一条报告日志），属报告不动文件。

## 已知边界

- **"不限量"指的是没有额度这套东西**：不充值、不按 token 计费、没有套餐和用量面板。但这条车道按 session 记速率，短时间内打满会回 `429`。插件把该模型标成"已达限额"而不是隐藏，下一轮探测自动恢复。
- **个别模型上游本身很慢**。`nemotron-3.5-lightning-free` 有一次实测首字超过 30 秒。这是上游延迟，看板会如实显示。
- **输出速度有时会显示 `—`**。答案只落在一两个大帧里、或者思考过程根本不流式返回的模型，没有值得相除的时间窗。看板宁可空着，也不会把"想的时间"算成"写的速度"。
- **能力只到探测能证明的程度**。公开清单和实测都拿不到证据的，就不标注。
- **源码是明文 JavaScript**。作为本地插件必须如此。能拿到这个目录的人就能读懂网关逻辑——请把它当成这种分发形态的固有属性，而不是"混淆一下就能解决"的问题。
- **桌面端安装需要真实目录**，原因见[安装](#安装)一节。
- **升级与热重载的信任边界**：应用内升级信任的是插件仓库本身——能推送仓库的人能推送任意代码，这与"安装一个插件更新"的信任模型相同。文件层面的完整性由 SHA-256 清单保障，代码层面的安全由客户端的白名单 HTML 渲染器与宿主的插件隔离承担。
- **DSHEAC AIO 的 WebView2 权限策略可能拒绝通知授权**（本机实测 `denied`）。被拒时公告中心的开关会如实提示；纯浏览器访问 dsh web 不受影响。
- **插件接口的鉴权取决于 composition**：挂了 connection 服务的 composition（dsh web、AIO 桌面端）下与内核 `/api` 同级（需要应用自己的 cookie/token）；没有 connection 服务的极简 composition 退回到结构化围栏（loopback + 同源检查），本机其它进程仍可访问——与内核在同类 composition 下的行为一致。

## 开发

```bash
npm test                          # 下面全部离线套件 + 清单一致性检查，一条命令
node scripts/client-lint.mjs        # 浏览器半身：文案键与样式键双向覆盖、bundle 可执行
node scripts/retry-safety-test.mjs  # 交给内核的失败对象、退避策略与 usage 计数必须可持久化
node scripts/speed-stat-test.mjs    # 没有任何一次调用能被平均成假的 tok/s
node scripts/sanitize-test.mjs      # 公告 HTML 白名单渲染器：XSS 语料必须全部被丢弃
node scripts/trust-test.mjs         # 插件路由的请求信任围栏
node scripts/feed-test.mjs          # 公告 feed：解析、故障转移、缓存、到达检测（本地 HTTP 服务器）
node scripts/updater-test.mjs       # 应用内升级：清单校验、SHA-256、备份/回滚（本地 HTTP 服务器）
node scripts/effort-test.mjs        # 思考档位 = 真正下发的 max_tokens，且与留痕的档位一致
node scripts/sniff-test.mjs         # 200 响应按 body 形状分流：SSE 帧、单包 JSON、空 body、跨 chunk 多字节、中途 abort
node scripts/release-e2e.mjs        # 用真实的 feed/manifest.json 装一遍升级，并验证谎报字节的清单会被拒绝
node scripts/picker-test.mjs        # 选择器只广播真能用的模型，且永不广播空集合
node scripts/tui-test.mjs           # 没有 web server 的 composition 里插件照样启动并出模型
node scripts/host-selftest.mjs      # Host 半身端到端，会真实出网
node scripts/build-manifest.mjs     # 发布：重新生成 feed/manifest.json（发布文件哈希清单）
```

`scripts/probes/` 是逆向过程中的一次性取证脚本——能力矩阵、地区门、
`reasoning_effort` 空操作采样、预算方言、悬空工具调用、工具名字符集规则、
原始读包时刻（`batch-delivery`）、逐帧到达与 usage 对照（`decode-window`）、
长回答会不会被额度截断（`long-answer`）。
其中六个跑的是本插件自己的代码，从仓库根目录就能执行
（`node scripts/probes/pairing-repair.mjs`）；其余借助一个第三方 SSE 客户端直连上游，
模块路径写成了那个仓库的样子，所以只作为取证记录保留，不能当测试套件用。
它们都没有接进 `npm test`——那是取证记录，不是套件；`npm test` 跑的是上面这些不需要
出网、不花免费额度的离线检查。

需要 Node `^22.19.0 || >=24.0.0`。无安装步骤、无依赖。

```bash
npm run typecheck                 # tsc --noEmit，严格检查 adapter/ 接缝（可选：需要 typescript）
```

## 安全与隐私

- 所有状态写在 `DSH_HOME/our-free-model/`；用量与设置只落本地，不上传任何地方。
- 转发监听**只绑回环地址**，默认 `127.0.0.1`，无 Key 请求一律拒绝。把地址改成可路由接口会被直接拒绝（`POST /settings` 回 400 并写明原因；没有 web server 的 composition 里手工写进 `settings.json` 也一样不起监听）——这一格流量花的是本机这条免密车道，不该由一个字符串决定要不要给整个子网用。
- 转发 Key 由 `crypto` 运行时生成、用 `timingSafeEqual` 比对、存在 `0600` 文件里。本仓库不含任何硬编码凭据。`/` 与 `/health` 是存活探针，先于 Key 检查应答，但只回答"在不在"，模型清单要 Key。
- 插件的 HTTP 路由带**请求信任围栏**（v1.1 起修复）：插件的 `/api/our-free-model` 前缀在 webServer 的最长前缀分发下优先于内核 `/api`，曾绕过内核鉴权。现在每个请求先走 composition 的 `connection` 服务准入（与内核 `/api` 完全同级的 cookie/token 校验）；connection 缺席的 composition 退回结构化围栏——loopback Host、拒绝跨站 `sec-fetch-site`、`Origin`/`Referer` 必须与 Host 同源同端口，**Host 缺失或为空也拒**（fail closed，不退回 socket 本地地址）。实测：异源 Host/Origin 403，无 cookie 回环请求 401。`connection` 是逐请求取的，因为浏览器半身要到插件加载之后才把它 provide 出来——快照式地在 apply 时读一次，围栏会整轮进程退化成结构化那一层（本轮把这条读取改回快照，picker-test 的 401 断言当场变红）。
- **公告 HTML 在客户端经严格白名单渲染**：`scripts/sanitize-test.mjs` 用 XSS 语料（脚本注入、事件属性、`javascript:`/`data:` URL、iframe/svg/form、样式注入、畸形标签）验证全部丢弃；不经过任何 `innerHTML` sink。公告源的 `feedUrl` 可被用户改指向任意 URL，因此渲染器按不可信输入对待。
- **应用内升级的完整性链**：清单校验（semver、路径逃逸、哈希格式）→ 下载逐文件 SHA-256 + 字节数 → staging 回读校验 → 安装后回读校验 → 任一步失败恢复备份；安装前强制重新拉取清单，杜绝陈旧清单。升级信任根是插件仓库本身（与安装插件更新相同），文件与代码边界见[已知边界](#已知边界)。
- 卸载只需移除 bundle 条目，插件不留任何补丁；它的数据目录是纯 JSON，可直接删除。

## 许可证

MIT，见 [LICENSE](LICENSE)。

本项目是独立插件，与任何模型提供方无隶属、认可或赞助关系。用它访问免费额度受各提供方
自身条款约束；在超出你自己机器的场景部署前，请先确认这些条款。
