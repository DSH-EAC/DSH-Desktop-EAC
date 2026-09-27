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
const PROMPT = "Two trains 300 km apart approach each other at 60 and 90 km/h. A bird flies 120 km/h between them until they meet. How far does the bird travel? Work it out fully.";

async function sample(model, extra) {
  const body = { model, messages: [{ role: "user", content: PROMPT }], stream: true, ...extra };
  applyFingerprintTools(body, false);
  const res = await fetch(`${B}/zen/v1/chat/completions`, {
    method: "POST", headers: { ...HEADERS, "x-opencode-request": generateRequestId() }, body: JSON.stringify(body), redirect: "error",
  });
  if (!res.ok) return { err: `${res.status} ${(await res.text()).slice(0, 90).replace(/\s+/g, " ")}` };
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = "", usage = null;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: {")) continue;
      try { const j = JSON.parse(line.slice(6)); if (j.usage) usage = j.usage; } catch {}
    }
  }
  return { r: usage?.completion_tokens_details?.reasoning_tokens ?? 0, out: usage?.completion_tokens ?? 0 };
}

const VARIANTS = {
  "none": {},
  "flat:minimal": { reasoning_effort: "minimal" },
  "flat:low": { reasoning_effort: "low" },
  "flat:xhigh": { reasoning_effort: "xhigh" },
  "nested:low": { reasoning: { effort: "low" } },
  "nested:xhigh": { reasoning: { effort: "xhigh" } },
};

const N = 3;
for (const model of ["space-bunny-free", "ling-3.0-flash-fin-free"]) {
  console.log(`\n===== ${model} =====`);
  for (const [name, extra] of Object.entries(VARIANTS)) {
    const rs = [];
    for (let i = 0; i < N; i++) { const s = await sample(model, extra); rs.push(s.err ? `E(${s.err.slice(0,40)})` : s.r); }
    console.log(`  ${name.padEnd(14)} reasoning=[${rs.join(", ")}]`);
  }
}
