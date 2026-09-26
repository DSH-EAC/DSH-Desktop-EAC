import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SKIN_ID, SKIN_META } from "./identity.ts";

test("minecraft metadata follows the skin covenant", () => {
  assert.match(SKIN_ID, /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
  assert.equal(SKIN_META.apiVersion, "dsh.ecosystem.ui-skin-loader/v1");
  assert.equal(SKIN_META.version, "1.1.0");
  assert.ok(SKIN_META.tags.length > 0);
});

test("minecraft vendor has no module-loader shell and exports apply", () => {
  const source = readFileSync(fileURLToPath(new URL("./vendor/dsh-web-ui-client.js", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /window\.__ModuleLoader__|sourceMappingURL/);
  assert.match(source, /export \{ apply \};/);
  assert.match(source, /function apply\(ctx\)/);
  assert.match(source, /data-plugin-css/);
});
