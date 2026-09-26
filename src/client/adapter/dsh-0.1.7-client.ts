/**
 * Client adapter for DSH 0.1.7-rc.2.
 *
 * The client half needs no `@deepseek-ai/*` import at all: everything it uses
 * arrives as a Cordis client service (`slots`, `locale`, `remote`, `inject`).
 * Keeping the upstream-shaped calls in one file is still worth it, because the
 * exact shapes are version-specific:
 *
 *  - `ctx.remote.$mount(contribution)` mounts this plugin's own Remote
 *    namespace (precedent: `dsh-experimental-client-ui-voice-input`);
 *  - `ctx.slots.inject('settings.section', …)` + `ctx.slots.register({name:
 *    'settings.section', kind: 'list', id, order, label}, Component)` is how a
 *    page joins the official settings shell — the same contract the skin
 *    console and the official account section use.
 *
 * @module client/adapter/dsh-0.1.7-client
 */

import type { RemoteContribution } from '../typert-remote.ts'

/** Options one slot registration carries. */
export interface SlotRegistration {
  readonly name: string
  readonly kind?: string
  readonly id?: string
  readonly order?: number
  readonly label?: string | (() => string)
  readonly locale?: string
  readonly inject?: () => unknown
}

/** The client slot service. */
export interface ClientSlots {
  register(options: SlotRegistration, component: unknown): () => void
  inject(name: string, callback: () => (() => void) | void): () => void
}

/** The client Remote service. */
export interface ClientRemote {
  $mount(contribution: RemoteContribution): Promise<() => void | Promise<void>>
  $on?(event: string, listener: (...args: unknown[]) => void): () => void
}

/** The client locale service. */
export interface ClientLocale {
  register(namespace: string, dictionaries: Readonly<Record<string, Readonly<Record<string, string>>>>): () => void
  bind(namespace: string): (key: string, parameters?: Record<string, unknown>) => string
}

/** The client Cordis context, narrowed to what this plugin uses. */
export interface ClientContext {
  readonly remote: ClientRemote
  readonly slots: ClientSlots
  readonly locale: ClientLocale
  inject(dependencies: readonly string[], callback: (ctx: ClientContext) => void | (() => void)): unknown
}

/** Disposer returned by {@link ClientAdapter.mount}. */
export type Disposer = () => void | Promise<void>

/** What the client wiring needs from the adapter. */
export interface ClientAdapter {
  /** Mount this plugin's Remote namespace. */
  mountRemote(contribution: RemoteContribution): Promise<Disposer>
  /** Join the official settings shell. */
  registerSection(options: Omit<SlotRegistration, 'name'>, component: unknown): Disposer
  /** Wait for the settings shell to exist, then register. */
  injectSection(register: () => Disposer): Disposer
  /**
   * Read one mounted Remote namespace off the client Remote service.
   * @param name - namespace, i.e. this plugin's service key.
   * @returns the namespace service.
   * @throws {Error} when the namespace is not mounted yet.
   */
  remoteNamespace<T>(name: string): T
  /** Register this plugin's dictionaries and bind a translator. */
  bindLocale(namespace: string, dictionaries: Readonly<Record<string, Readonly<Record<string, string>>>>): {
    readonly t: (key: string, parameters?: Record<string, unknown>) => string
    readonly dispose: Disposer
  }
}

/**
 * Wrap a client context in the adapter the wiring uses.
 * @param ctx - the client Cordis context.
 * @returns the adapter.
 */
export function createClientAdapter(ctx: ClientContext): ClientAdapter {
  return {
    mountRemote: (contribution) => ctx.remote.$mount(contribution),

    registerSection(options, component) {
      return ctx.slots.register({ ...options, name: 'settings.section' }, component)
    },

    injectSection(register) {
      return ctx.slots.inject('settings.section', register)
    },

    remoteNamespace<T>(name: string): T {
      const namespace = (ctx.remote as unknown as Record<string, T | undefined>)[name]
      if (namespace === undefined) throw new Error(`remote namespace ${JSON.stringify(name)} is not mounted`)
      return namespace
    },

    bindLocale(namespace, dictionaries) {
      const dispose = ctx.locale.register(namespace, dictionaries)
      const translate = ctx.locale.bind(namespace)
      return {
        t: (key, parameters) => {
          try {
            return translate(key, parameters)
          } catch {
            // A missing key must never blank the page: fall back to the key.
            return key
          }
        },
        dispose
      }
    }
  }
}

/** Compose disposers so a partial start unwinds completely. */
export function composeDisposers(disposers: readonly Disposer[]): Disposer {
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    for (const dispose of [...disposers].reverse()) void dispose()
  }
}
