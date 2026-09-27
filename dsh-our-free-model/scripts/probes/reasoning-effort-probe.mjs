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

const PROMPT = "A farm has 12 animals, chickens and cows only, with 32 legs total. How many chickens? Reason carefully.";

async function run(model, extra, label) {
  const body = { model, messages: [{ role: "user", content: PROMPT }], stream: true, ...extra };
  applyFingerprintTools(body, false);
  const t0 = Date.now();
  let firstToken = 0;
  const res = await fetch(`${B}/zen/v1/chat/completions`, {
    method: "POST", headers: { ...HEADERS, "x-opencode-request": generateRequestId() }, body: JSON.stringify(body), redirect: "error",
  });
  if (!res.ok) { const t = await res.text(); console.log(`FAIL ${label} ${res.status} ${t.slice(0, 200).replace(/\s+/g, " ")}`); return; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", usage = null, answer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!firstToken) firstToken = Date.now() - t0;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: {")) continue;
      let j; try { j = JSON.parse(line.slice(6)); } catch { continue; }
      if (j.usage) usage = j.usage;
      for (const c of j.choices || []) {
        if (typeof c.delta?.content === "string") answer += c.delta.content;
      }
    }
  }
  console.log(`${label} | ttft=${firstToken}ms total=${Date.now() - t0}ms | reasoning=${usage?.completion_tokens_details?.reasoning_tokens} out=${usage?.completion_tokens} | ${answer.slice(0, 70).replace(/\s+/g, " ")}`);
}

for (const model of ["mimo-v2.6-flash-free", "space-bunny-free", "ling-3.0-flash-fin-free"]) {
  await run(model, {}, `${model} [default]`);
  await run(model, { reasoning_effort: "high" }, `${model} [effort=high]`);
  await run(model, { reasoning_effort: "low" }, `${model} [effort=low]`);
  await run(model, { thinking: { type: "disabled" } }, `${model} [thinking.disabled]`);
}
