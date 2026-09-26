import type { SkinActivationContext, SkinClientContext, VendoredSkinContext } from "../context.ts";
import { apply as applyVendoredSkin } from "../vendor/dsh-web-ui-client.js";

export interface SkinSession { teardown(): void }
const BODY_MARKER = "data-dsh-xp";
const UPSTREAM_PACKAGE = "@linxin666/dsh-client-ui-skin-xp";
const BODY_KEY = BODY_MARKER.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function ownStyles(): Array<{ remove(): void }> {
  if (typeof document === "undefined") return [];
  return Array.from(document.querySelectorAll(`style[data-plugin="${UPSTREAM_PACKAGE}"]`)) as unknown as Array<{ remove(): void }>;
}
function ownChrome(): Array<{ remove(): void }> {
  if (typeof document === "undefined") return [];
  return Array.from(document.querySelectorAll("[data-skin-chrome]")) as unknown as Array<{ remove(): void }>;
}
function dataFavicons(): Array<{ remove(): void }> {
  if (typeof document === "undefined") return [];
  return Array.from(document.querySelectorAll('link[rel~="icon"]')).filter((node) => {
    const href = (node as HTMLLinkElement).href || node.getAttribute("href") || "";
    return href.startsWith("data:");
  }) as unknown as Array<{ remove(): void }>;
}
function readHostService(ctx: SkinClientContext, name: string): unknown {
  try {
    const host = ctx as SkinClientContext & { get?(name: string): unknown };
    return typeof host.get === "function" ? host.get(name) : (ctx as unknown as Record<string, unknown>)[name];
  } catch { return undefined; }
}

export function activateXpSession(
  ctx: SkinClientContext,
  skinCtx: SkinActivationContext,
  applyImpl: (ctx: VendoredSkinContext) => void = applyVendoredSkin,
): SkinSession {
  let tornDown = false;
  const disposers: Array<() => void> = [];
  const stylesBefore = new Set(ownStyles());
  const chromeBefore = new Set(ownChrome());
  const faviconBefore = new Set(dataFavicons());
  const markerBefore = typeof document !== "undefined" && BODY_KEY in document.body.dataset;
  const titleBefore = typeof document !== "undefined" ? document.title : "";
  const vendored: VendoredSkinContext = {
    effect(execute) {
      const disposer = execute();
      if (typeof disposer === "function") disposers.push(disposer);
      return disposer;
    },
    get(name) { return readHostService(ctx, name); },
  };
  const onAbort = () => teardown();
  skinCtx.signal.addEventListener("abort", onAbort);
  try {
    applyImpl(vendored);
  } catch (error) {
    teardown();
    throw error;
  }
  function teardown(): void {
    if (tornDown) return;
    tornDown = true;
    skinCtx.signal.removeEventListener("abort", onAbort);
    for (let i = disposers.length - 1; i >= 0; i--) {
      try { disposers[i]!(); }
      catch (error) { skinCtx.logger.warn("xp: teardown step failed", { error: String(error) }); }
    }
    for (const node of ownStyles()) if (!stylesBefore.has(node)) node.remove();
    for (const node of ownChrome()) if (!chromeBefore.has(node)) node.remove();
    for (const node of dataFavicons()) if (!faviconBefore.has(node)) node.remove();
    if (!markerBefore && typeof document !== "undefined" && BODY_KEY in document.body.dataset) {
      delete document.body.dataset[BODY_KEY];
    }
    if (typeof document !== "undefined" && document.title !== titleBefore && document.title.includes("Windows XP (Luna)")) {
      document.title = titleBefore;
    }
  }
  return { teardown };
}

export function createXpActivation(ctx: SkinClientContext) {
  let active: SkinSession | null = null;
  let safety = false;
  return {
    activate(skinCtx: SkinActivationContext): void {
      active?.teardown();
      active = activateXpSession(ctx, skinCtx);
      if (!safety) {
        safety = true;
        ctx.effect(() => () => active?.teardown(), "skn-xp: session safety net");
      }
    },
    deactivate(): void { active?.teardown(); active = null; },
  };
}
