/** Local structural types for a covenant skin; no upstream imports. */
export interface SkinClientContext {
  effect(execute: () => (() => unknown) | void, label?: string): unknown;
  readonly uiSkinLoader: { registerSkin(registration: SkinRegistrationLike): () => void };
}
export interface SkinActivationContext {
  readonly logger: {
    debug(message: string, details?: Record<string, unknown>): void;
    info(message: string, details?: Record<string, unknown>): void;
    warn(message: string, details?: Record<string, unknown>): void;
    error(message: string, details?: Record<string, unknown>): void;
  };
  readonly signal: AbortSignal;
}
export interface VendoredSkinContext {
  effect(execute: () => (() => unknown) | void, label?: string): unknown;
  get(name: string): unknown;
}
export interface SkinRegistrationLike {
  apiVersion: string;
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  tags?: readonly string[];
  preview?: string;
  settingsHint?: string;
  activate: (skinCtx: SkinActivationContext) => void | Promise<void>;
  deactivate: () => void | Promise<void>;
}
