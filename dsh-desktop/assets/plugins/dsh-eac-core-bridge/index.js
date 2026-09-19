/**
 * dsh-eac-core-bridge — VNext Phase 2 Core Bridge（受信 cordis 组件）。
 *
 * 运行位置：Core Harness（dsh web 进程）内，经 cordis.patch.yml 以受信
 * 身份注入 Core Profile（与其它内置配套插件同一机制，不改 dsh 源码）。
 *
 * 职责（架构文档 §5）：
 *   1. 工具桥接：启动时（及每 60s 增量）从桌面 Supervisor 的回环端点拉取
 *      全部运行中隔离插件的工具元数据，逐个以 `eac_<pluginId>_<tool>`
 *      注册为 dsh Agent 工具；execute 经 HTTP 转发到对应 Extension Host。
 *   2. 上下文注入：挂 system-prompt/assemble 瀑布（agent ctx，同
 *      tdai-memory 的挂法），每回合向 Supervisor 收集隔离插件的上下文
 *      贡献并追加到 assembly.contexts；任何失败/超时（1.2s）都返回原
 *      assembly —— 扩展卡死绝不阻塞核心回合。
 *
 * 鉴权：端点 URL 与一次性 token 由桌面端经环境变量注入
 * （DSH_EAC_BRIDGE_URL / DSH_EAC_BRIDGE_TOKEN，见 lib/server.ts childEnv）。
 * 环境缺失（如脱离桌面端直接跑 dsh web）时本组件静默空转。
 */

import http from "node:http";
import { defineTool } from "@deepseek-ai/dsh-tools";

const name = "eac-core-bridge";
// 仅声明实际使用的服务：原列表里的 "sessions" 全文件从未消费（无 ctx.sessions），
// 多余声明会让宿主做无谓的作用域装配。
const inject = ["tools"];

/** 回环端点（环境注入；缺失即空转）。 */
const BASE = process.env.DSH_EAC_BRIDGE_URL || "";
const TOKEN = process.env.DSH_EAC_BRIDGE_TOKEN || "";

/** 工具清单轮询间隔（隔离插件运行期启停后补注册新工具）。 */
const TOOLS_REFRESH_MS = 60_000;

/** 单次桥接请求超时：上下文收集必须远小于回合预算。 */
const CONTEXT_TIMEOUT_MS = 1_200;
/** 工具调用超时由 Supervisor 侧统一（120s），这里只做传输层兜底。 */
const INVOKE_TIMEOUT_MS = 130_000;

/** 已注册工具名集合（轮询时只补新工具，不重复注册）。
 *  per-apply（非模块级）：宿主重载/插件禁用后再启用会拿到全新 tools 注册表，
 *  模块级 Set 会让已登记名字永不重新注册（工具静默消失）；随 effect 处置清空。 */

/** 工具清单轮询定时器（模块级，保证任意时刻至多一个 interval）。 */
let toolsRefreshTimer = null;

/**
 * JSON POST（带 token + 超时；失败抛错由调用方决定降级）。
 *
 * 刻意用 node:http 直连而非 global fetch：Node ≥ 24 的 fetch 默认尊重
 * HTTP(S)_PROXY 环境变量，用户代理（常见 0.0.0.0:xxxx 配置）会把回环
 * 请求劫去直接 EADDRNOTAVAIL —— 桥接通道绝不能依赖用户代理配置。
 */
function post(pathname, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + pathname);
    const payload = JSON.stringify(body ?? {});
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", "x-eac-token": TOKEN },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error(`桥接请求超时（${timeoutMs}ms）: ${pathname}`));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

/** 工具名归一化：eac_<pluginId>_<tool>，仅 [a-z0-9_]（Agent 工具名约定）。 */
function bridgeToolName(pluginId, tool) {
  return `eac_${String(pluginId).toLowerCase()}_${String(tool).toLowerCase()}`
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 64);
}

/** 从端点拉工具清单并注册新增项。 */
async function syncTools(ctx, registered) {
  let data;
  try {
    data = await post("/tools", {}, 5_000);
  } catch (error) {
    ctx.logger.warn(`[eac-bridge] 工具清单拉取失败: ${String(error)}`);
    return;
  }
  for (const t of data.tools ?? []) {
    const full = bridgeToolName(t.pluginId, t.name);
    if (registered.has(full)) continue;
    // bridgeToolName 把 pluginId/tool 折叠进 64 个 [a-z0-9_]，不同插件可能
    // 折出同名；注册前查重，已存在（他方先注册）时告警并跳过，绝不覆盖。
    // 计入 registered 保证只告警一次，之后轮询静默跳过。
    if (typeof ctx.tools.get === "function" && ctx.tools.get(full)) {
      registered.add(full);
      ctx.logger.warn(`[eac-bridge] 桥接工具名冲突，跳过注册: ${full}（${t.pluginId}.${t.name} 与既有工具同名）`);
      continue;
    }
    registered.add(full);
    const pluginId = t.pluginId;
    const tool = t.name;
    ctx.tools.register(
      defineTool({
        name: full,
        description: `[${pluginId}] ${t.description || `隔离插件 ${pluginId} 的 ${tool} 工具`}`,
        parameters: t.parameters ?? {},
        output: {
          schema: { type: "string" },
          render: (_args, value) => [{ type: "text", text: value }],
        },
        async execute(args) {
          const r = await post("/invoke", { pluginId, tool, args }, INVOKE_TIMEOUT_MS);
          if (!r.ok) throw new Error(`eac-bridge: ${r.error ?? "工具调用失败"}`);
          const v = r.result;
          return typeof v === "string" ? v : JSON.stringify(v ?? null);
        },
      }),
    );
    ctx.logger.info(`[eac-bridge] 已桥接工具 ${full}`);
  }
}

export { name, inject };

export async function apply(ctx) {
  if (!BASE || !TOKEN) {
    // 脱离桌面端（直接 dsh web）：隔离插件本就不可用，静默空转。
    ctx.logger.info("[eac-bridge] 无桥接端点（非桌面端运行），隔离插件工具未启用");
    return;
  }

  // ── 工具桥接：首拉 + 周期补注册 ─────────────────────────────────────────
  const registered = new Set();
  await syncTools(ctx, registered);
  // 幂等：apply 可能被重入（组件重载/重复启用），先清掉旧轮询再建新的，
  // 避免多个 interval 并行重复拉取与注册。
  if (toolsRefreshTimer !== null) clearInterval(toolsRefreshTimer);
  // effect 兜底 teardown：插件禁用/宿主卸载时 interval 必须死（否则禁用后
  // 仍以旧 ctx 轮询）；registered 随处置清空，重启用拿到全新注册表能重新登记。
  ctx.effect(() => {
    toolsRefreshTimer = setInterval(() => {
      syncTools(ctx, registered).catch(() => {});
    }, TOOLS_REFRESH_MS);
    toolsRefreshTimer.unref?.();
    return () => {
      if (toolsRefreshTimer !== null) { clearInterval(toolsRefreshTimer); toolsRefreshTimer = null; }
      registered.clear();
    };
  });

  // ── 上下文注入：agent 作用域的 system-prompt/assemble 瀑布 ─────────────
  // （与 tdai-memory 同一挂法：session/created 后一拍再取 agent.ctx，
  //  根级监听器看不到 agent 作用域的 assembly。）
  ctx.on("session/created", (session) => {
    setTimeout(() => {
      try {
        const agents = ctx.get("agents");
        const agent = agents?.get?.(session.id);
        if (!agent?.ctx) return;
        agent.ctx.on("system-prompt/assemble", async (assembly) => {
          try {
            const data = await post("/context", { sessionId: session.id }, CONTEXT_TIMEOUT_MS);
            const extras = (data.contributions ?? []).filter((c) => typeof c?.text === "string" && c.text);
            if (extras.length === 0) return assembly;
            return {
              ...assembly,
              contexts: [
                ...assembly.contexts,
                ...extras.map((c) => ({ name: c.name, order: c.order, text: c.text })),
              ],
            };
          } catch {
            // 收集超时/失败：返回原 assembly，核心回合不受影响。
            return assembly;
          }
        });
      } catch (error) {
        ctx.logger.warn(`[eac-bridge] 上下文注入挂载失败: ${String(error)}`);
      }
    }, 0);
  });
}
