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

const results = [];

async function probe(kind, url, model, body, extraHeaders) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...HEADERS, "x-opencode-request": generateRequestId(), ...extraHeaders },
      body: JSON.stringify(body),
      redirect: "error",
    });
    const txt = await res.text();
    const ms = Date.now() - t0;
    results.push({ kind, model, status: res.status, ms, body: txt.slice(0, 6000) });
    console.log(`${res.ok ? "OK" : "--"} ${kind} ${res.status} ${ms}ms ${model} :: ${res.ok ? "" : txt.slice(0, 150).replace(/\s+/g, " ")}`);
  } catch (e) {
    results.push({ kind, model, status: 0, ms: Date.now() - t0, error: String(e) });
    console.log(`!! ${kind} ${model} :: ${e}`);
  }
}

const chatBody = (m) => { const b = { model: m, messages: [{ role: "user", content: "Reply with exactly: PROBE-OK" }], stream: true }; applyFingerprintTools(b, false); return b; };
const respBody = (m) => { const b = { model: m, input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Reply with exactly: PROBE-OK" }] }], stream: true, store: false }; applyFingerprintTools(b, true); return b; };
const msgBody = (m) => ({ model: m, max_tokens: 64, messages: [{ role: "user", content: "Reply with exactly: PROBE-OK" }], stream: true });

const FREE = [
  "deepseek-v4-flash-free", "mimo-v2.6-flash-free", "mimo-v2.5-free",
  "ling-3.0-flash-fin-free", "nemotron-3-ultra-free", "nemotron-3.5-lightning-free",
  "space-bunny-free", "jev-1.13-free",
];
for (const m of FREE) await probe("chat", `${B}/zen/v1/chat/completions`, m, chatBody(m));
await probe("messages", `${B}/zen/v1/messages`, "union-alpha", msgBody("union-alpha"), { "anthropic-version": "2023-06-01" });
await probe("responses", `${B}/zen/v1/responses`, "muse-spark-1.3-contributor-free", respBody("muse-spark-1.3-contributor-free"));
await probe("responses", `${B}/zen/v1/responses`, "muse-spark-1.2-contributor-free", respBody("muse-spark-1.2-contributor-free"));

writeFileSync(".probe-results.json", JSON.stringify(results, null, 2));
