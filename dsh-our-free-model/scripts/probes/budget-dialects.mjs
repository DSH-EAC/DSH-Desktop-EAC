import { generateSessionId, generateRequestId } from "./open-sse/executors/opencode.js";
import { applyFingerprintTools } from "./open-sse/utils/opencodeFingerprint.js";

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
const PROMPT = "A ladder leans against a wall, 13 m long, foot 5 m from the wall. The top slides down 1 m. How far does the foot move? Solve carefully.";

function mean(a) { return a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0; }

async function post(path, body, anthropic) {
  const res = await fetch(`${B}${path}`, {
    method: "POST",
    headers: { ...HEADERS, "x-opencode-request": generateRequestId(), ...(anthropic ? { "anthropic-version": "2023-06-01" } : {}) },
    body: JSON.stringify(body), redirect: "error",
  });
  const txt = await res.text();
  let reasoning = null, out = null;
  for (const line of txt.split("\n")) {
    if (!line.startsWith("data: {")) continue;
    try {
      const j = JSON.parse(line.slice(6));
      const u = j.usage;
      if (u) {
        reasoning = u.completion_tokens_details?.reasoning_tokens ?? u.output_tokens_details?.reasoning_tokens ?? null;
        out = u.output_tokens ?? u.completion_tokens ?? null;
      }
      if (typeof u?.thinking_tokens === "number") reasoning = u.thinking_tokens;
    } catch {}
  }
  return { status: res.status, reasoning, out, txt };
}

async function measure(label, run, n = 3) {
  const rs = [], os = [];
  let err = "";
  for (let i = 0; i < n; i++) {
    const r = await run();
    if (r.status !== 200) { err = `${r.status} ${r.txt.slice(0, 70).replace(/\s+/g, " ")}`; break; }
    rs.push(r.reasoning); os.push(r.out);
  }
  console.log(`  ${err ? `FAIL ${err}` : `reasoning=[${rs.join(",")}] mean=${mean(rs)} out=[${os.join(",")}]`}  <- ${label}`);
}

const chat = (model, extra) => async () => {
  const body = { model, messages: [{ role: "user", content: PROMPT }], stream: true, ...extra };
  applyFingerprintTools(body, false);
  return post("/zen/v1/chat/completions", body);
};

for (const model of ["ling-3.0-flash-fin-free", "space-bunny-free"]) {
  console.log(`\n===== ${model} (chat lane) =====`);
  await measure("baseline", chat(model));
  await measure("max_tokens=64", chat(model, { max_tokens: 64 }));
  await measure("max_tokens=1024", chat(model, { max_tokens: 1024 }));
  await measure("thinking.budget=64", chat(model, { thinking: { type: "enabled", budget_tokens: 64 } }));
  await measure("thinking.budget=2048", chat(model, { thinking: { type: "enabled", budget_tokens: 2048 } }));
  await measure("enable_thinking=false", chat(model, { enable_thinking: false }));
  await measure("thinking_budget=0", chat(model, { thinking_budget: 0 }));
  await measure("reasoning.effort=low+budget", chat(model, { reasoning: { effort: "low", budget_tokens: 32 } }));
}

console.log(`\n===== anthropic /zen/v1/messages lane =====`);
for (const model of ["ling-3.0-flash-fin-free", "space-bunny-free", "mimo-v2.6-flash-free"]) {
  await measure(`messages ${model}`, async () => {
    const body = { model, max_tokens: 2048, stream: true, messages: [{ role: "user", content: PROMPT }] };
    return post("/zen/v1/messages", body, true);
  }, 1);
}
