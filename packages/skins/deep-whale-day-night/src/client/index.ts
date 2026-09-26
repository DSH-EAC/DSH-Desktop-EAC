import type { SkinClientContext } from "../context.ts";
import { SKIN_META } from "../identity.ts";
import { PREVIEW_SVG } from "../preview.ts";
import { createDeepWhaleDayNightActivation } from "./session.ts";

export const inject: string[] = ["uiSkinLoader", "theme"];
export function apply(ctx: SkinClientContext): void {
  const activation = createDeepWhaleDayNightActivation(ctx);
  const unregister = ctx.uiSkinLoader.registerSkin({
    ...SKIN_META,
    preview: PREVIEW_SVG,
    activate: (skinCtx) => activation.activate(skinCtx),
    deactivate: () => activation.deactivate(),
  });
  ctx.effect(() => unregister, "skn-deep-whale-day-night: unregister on fiber dispose");
}
