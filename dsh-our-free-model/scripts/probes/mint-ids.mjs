import { generateSessionId, generateRequestId } from "./open-sse/executors/opencode.js";
import { writeFileSync } from "fs";
const s = generateSessionId(), r = generateRequestId();
console.log(s, r);
writeFileSync(".probe-ids.json", JSON.stringify({ session: s, request: r }));
