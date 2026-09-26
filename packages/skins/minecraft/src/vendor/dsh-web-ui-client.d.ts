export function apply(ctx: { effect(execute: () => (() => unknown) | void, label?: string): unknown; get(name: string): unknown }): void;
