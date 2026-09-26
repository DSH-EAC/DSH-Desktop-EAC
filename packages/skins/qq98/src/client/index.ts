import type { SkinClientContext } from "../context.ts";
import { SKIN_META } from "../identity.ts";
import { PREVIEW_SVG } from "../preview.ts";
import { createQq98Activation } from "./session.ts";

export const inject: string[] = ["uiSkinLoader"];
export function apply(ctx: SkinClientContext): void {
  const activation = createQq98Activation(ctx);
  const unregister = ctx.uiSkinLoader.registerSkin({
    ...SKIN_META,
    preview: PREVIEW_SVG,
    activate: (skinCtx) => activation.activate(skinCtx),
    deactivate: () => activation.deactivate(),
  });
  ctx.effect(() => unregister, "skn-qq98: unregister on fiber dispose");
}
