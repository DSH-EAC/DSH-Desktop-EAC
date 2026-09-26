/**
 * The client half's Remote contribution.
 *
 * Upstream mounts a plugin's own Remote namespace from the client with
 * `ctx.remote.$mount(contribution)` — the precedent is
 * `@deepseek-ai/dsh-experimental-client-ui-voice-input`, whose client entry
 * calls `mountVoiceInput(ctx, TYPERT_REMOTE)` for the namespace it does not add
 * to the stable API Remotes. A third-party plugin is exactly that case: the
 * app's `dsh-api-remotes` client bundle is assembled from the packages the app
 * selected at build time, so the installer must mount its own namespace.
 *
 * The descriptor below is the same shape the upstream generator emits (see
 * `@deepseek-ai/dsh-plugin-manager/lib/typert.remote-client.js`). The codecs are
 * passthroughs, and that is deliberate rather than lazy: the client Remote layer
 * only validates that an input codec declares `mode: 'strict'`
 * (`dsh-api-gateway/lib/types/client/index.js` → `requireStrictCodec`) and never
 * executes it; the Host validates every argument for real. Writing a
 * browser-side schema here would be dead weight that could disagree with the
 * Host. {@link parameterCodec} says so at the call site.
 *
 * @module client/typert-remote
 */

import { SERVICE_NAME } from '../protocol.ts'

/** One parameter's wire description. */
interface RemoteParameter {
  readonly name: string
  readonly wire: string
  readonly source: 'json'
  readonly codec: { readonly mode: 'strict'; readonly typeSymbol: string; readonly create: () => unknown }
}

/** One Remote method's wire description. */
interface RemoteDescriptor {
  readonly id: string
  readonly service: string
  readonly namespace: string
  readonly method: string
  readonly invocation: { readonly kind: 'direct' }
  readonly parameters: readonly RemoteParameter[]
  readonly result: { readonly mode: 'strict'; readonly typeSymbol: string; readonly create: () => unknown }
}

/** The contribution object `ctx.remote.$mount` consumes. */
export interface RemoteContribution {
  readonly package: string
  readonly descriptors: readonly RemoteDescriptor[]
}

const PACKAGE = '@dsh-eac/pack-installer'

/**
 * Declare one parameter's wire codec.
 *
 * @param name - parameter name, as the Host method spells it.
 * @param typeSymbol - the Host type the argument carries.
 * @returns the descriptor entry.
 */
function parameterCodec(name: string, typeSymbol: string): RemoteParameter {
  return {
    name,
    wire: name,
    source: 'json',
    // Never executed on the client; the Host is the validating side.
    codec: { mode: 'strict', typeSymbol, create: () => (value: unknown) => value }
  }
}

function descriptor(method: string, parameters: readonly RemoteParameter[], resultType: string): RemoteDescriptor {
  return {
    id: `${PACKAGE}#${SERVICE_NAME}/${method}`,
    service: SERVICE_NAME,
    namespace: SERVICE_NAME,
    method,
    invocation: { kind: 'direct' },
    parameters,
    result: { mode: 'strict', typeSymbol: resultType, create: () => (value: unknown) => value }
  }
}

/** The installer's own Remote namespace. */
export const TYPERT_REMOTE: RemoteContribution = {
  package: PACKAGE,
  descriptors: [
    descriptor('catalog', [], '@dsh-eac/pack-installer/types#CatalogResult'),
    descriptor('install', [parameterCodec('request', '@dsh-eac/pack-installer/types#InstallRequest')], '@dsh-eac/pack-installer/types#InstallAccepted'),
    descriptor('progress', [parameterCodec('requestId', '@dsh-eac/pack-installer/types#InstallRequestId')], '@dsh-eac/pack-installer/types#InstallProgress'),
    descriptor('result', [parameterCodec('requestId', '@dsh-eac/pack-installer/types#InstallRequestId')], '@dsh-eac/pack-installer/types#InstallResultView'),
    descriptor('cancel', [parameterCodec('requestId', '@dsh-eac/pack-installer/types#InstallRequestId')], '@dsh-eac/pack-installer/types#InstallCancellation'),
    descriptor('hostSeam', [], '@dsh-eac/pack-installer/types#OfficialHostSeam')
  ]
}

/** Client service key of the mounted namespace (`remote.<namespace>`). */
export const REMOTE_SERVICE_KEY = `remote.${SERVICE_NAME}`
