import { generateSessionId, generateRequestId } from "./open-sse/executors/opencode.js";
import { applyFingerprintTools } from "./open-sse/utils/opencodeFingerprint.js";
import { appendFileSync, writeFileSync } from "fs";

const OUT = ".probe9.log";
writeFileSync(OUT, "");
const log = (s) => { appendFileSync(OUT, s + "\n"); };

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

async function post(path, body, anthropic) {
  const res = await fetch(`${B}${path}`, {
    method: "POST",
    headers: { ...HEADERS, "x-opencode-request": generateRequestId(), ...(anthropic ? { "anthropic-version": "2023-06-01" } : {}) },
    body: JSON.stringify(body), redirect: "error",
  });
  const txt = await res.text();
  let reasoning = null;
  for (const line of txt.split("\n")) {
    if (!line.startsWith("data: {")) continue;
    try {
      const j = JSON.parse(line.slice(6));
      const u = j.usage;
      if (u) reasoning = u.completion_tokens_details?.reasoning_tokens ?? u.output_tokens_details?.reasoning_tokens ?? u.thinking_tokens ?? null;
    } catch {}
  }
  return { status: res.status, reasoning, txt };
}

const chat = (model, extra) => async () => {
  const body = { model, messages: [{ role: "user", content: PROMPT }], stream: true, ...extra };
  applyFingerprintTools(body, false);
  return post("/zen/v1/chat/completions", body);
};

async function measure(label, run, n = 3) {
  const rs = [];
  for (let i = 0; i < n; i++) {
    const r = await run();
    if (r.status !== 200) { log(`FAIL ${label}: ${r.status} ${r.txt.slice(0, 80).replace(/\s+/g, " ")}`); return; }
    rs.push(r.reasoning);
  }
  log(`  ${label.padEnd(30)} reasoning=[${rs.join(",")}]`);
}

for (const model of ["ling-3.0-flash-fin-free", "space-bunny-free"]) {
  log(`===== ${model} =====`);
  await measure("baseline", chat(model));
  await measure("max_tokens=64", chat(model, { max_tokens: 64 }));
  await measure("max_tokens=512", chat(model, { max_tokens: 512 }));
  await measure("thinking.budget=32", chat(model, { thinking: { type: "enabled", budget_tokens: 32 } }));
  await measure("thinking.budget=2048", chat(model, { thinking: { type: "enabled", budget_tokens: 2048 } }));
  await measure("enable_thinking=false", chat(model, { enable_thinking: false }));
}

// vision probe: 1x1 red png
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
async function vision(label, model, content) {
  const body = { model, max_tokens: 120, stream: true, messages: [{ role: "user", content }] };
  applyFingerprintTools(body, false);
  const r = await post("/zen/v1/chat/completions", body);
  log(`  ${label.padEnd(30)} ${r.status} ${r.status === 200 ? "accepted" : r.txt.slice(0, 120).replace(/\s+/g, " ")}`);
}
log("===== vision input =====");
for (const model of ["mimo-v2.6-flash-free", "ling-3.0-flash-fin-free", "space-bunny-free"]) {
  await vision(`openai-image ${model}`, model, [
    { type: "text", text: "What colour is this image? One word." },
    { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } },
  ]);
}
