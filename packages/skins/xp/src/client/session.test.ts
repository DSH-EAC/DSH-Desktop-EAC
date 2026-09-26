import assert from "node:assert/strict";
import { test } from "node:test";
import { activateXpSession } from "./session.ts";

test("xp activation registers disposers and teardown is idempotent", () => {
  const ctx = {
    effect(execute: () => (() => unknown) | void) { return execute(); },
    uiSkinLoader: { registerSkin: () => () => {} },
  } as unknown as import("../context.ts").SkinClientContext;
  const controller = new AbortController();
  let disposed = 0;
  const session = activateXpSession(ctx, { signal: controller.signal, logger: { debug() {}, info() {}, warn() {}, error() {} } }, (vendor) => {
    vendor.effect(() => () => { disposed++; });
  });
  session.teardown();
  session.teardown();
  assert.equal(disposed, 1);
});
