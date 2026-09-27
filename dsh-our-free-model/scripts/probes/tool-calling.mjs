import { generateSessionId, generateRequestId } from "./open-sse/executors/opencode.js";
import { applyFingerprintTools } from "./open-sse/utils/opencodeFingerprint.js";
import { writeFileSync } from "fs";

const session = generateSessionId();
const B = "https://opencode.ai";
const HEADERS = {
  "Content-Type": "application/json",
  "Authorization": "Bearer public",
  "User-Agent": "opencode/1.18.31",
  "x-opencode-client": "desktop",
  "x-opencode-session": session,
  "x-opencode-project": "global",
  "Accept": "text/event-stream",
};

const TOOLS = [
  { type: "function", function: { name: "get_weather", description: "Get weather for a city", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } },
];

async function turn(label, body) {
  const t0 = Date.now();
  const res = await fetch(`${B}/zen/v1/chat/completions`, {
    method: "POST", headers: { ...HEADERS, "x-opencode-request": generateRequestId() }, body: JSON.stringify(body), redirect: "error",
  });
  const txt = await res.text();
  const ms = Date.now() - t0;
  const toolCalls = [];
  const texts = [];
  let usage = null;
  let finish = null;
  for (const line of txt.split("\n")) {
    if (!line.startsWith("data: {")) continue;
    let j; try { j = JSON.parse(line.slice(6)); } catch { continue; }
    if (j.usage) usage = j.usage;
    for (const c of j.choices || []) {
      if (c.finish_reason) finish = c.finish_reason;
      const d = c.delta || {};
      if (typeof d.content === "string") texts.push(d.content);
      for (const tc of d.tool_calls || []) {
        const i = tc.index ?? 0;
        toolCalls[i] = toolCalls[i] || { name: "", args: "" };
        if (tc.function?.name) toolCalls[i].name += tc.function.name;
        if (tc.function?.arguments) toolCalls[i].args += tc.function.arguments;
      }
    }
  }
  console.log(`### ${label} [${res.status}] ${ms}ms finish=${finish}`);
  console.log(`    text: ${JSON.stringify(texts.join("").slice(0, 200))}`);
  console.log(`    toolCalls: ${JSON.stringify(toolCalls)}`);
  console.log(`    usage: ${JSON.stringify(usage)}`);
  if (!res.ok) console.log(`    raw: ${txt.slice(0, 300).replace(/\s+/g, " ")}`);
  return { status: res.status, toolCalls, texts: texts.join("") };
}

const USER = "What is the weather in Shanghai? You MUST call the get_weather tool.";

for (const model of ["mimo-v2.6-flash-free", "space-bunny-free", "ling-3.0-flash-fin-free"]) {
  const body = { model, messages: [{ role: "user", content: USER }], stream: true, tools: TOOLS.map(t => ({ ...t })) };
  applyFingerprintTools(body, false);
  const r = await turn(`toolcall ${model}`, body);
  if (r.status === 200 && r.toolCalls.length) {
    const withResult = {
      model,
      messages: [
        { role: "user", content: USER },
        { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: r.toolCalls[0].name, arguments: r.toolCalls[0].args } }] },
        { role: "tool", tool_call_id: "call_1", content: '{"temp":22,"cond":"sunny"}' },
      ],
      stream: true,
      tools: TOOLS.map(t => ({ ...t })),
    };
    applyFingerprintTools(withResult, false);
    await turn(`toolround2 ${model}`, withResult);
  }
}
