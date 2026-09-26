/**
 * Client entry: mount the installer's Remote namespace and join the official
 * settings shell.
 *
 * Order matters and mirrors the voice-input precedent: mount the Remote
 * contribution first, then wait for `remote.eacPackInstaller` before rendering,
 * so the page can never paint a control whose transport is not there yet.
 *
 * @module client/index
 */

import { createClientAdapter, composeDisposers, type ClientContext, type Disposer } from './adapter/dsh-0.1.7-client.ts'
import { MESSAGES } from './messages.ts'
import { PackInstallerSection, type InstallerRemote } from './section.tsx'
import { TYPERT_REMOTE } from './typert-remote.ts'
import { LOCALE_NAMESPACE, SERVICE_NAME, SETTINGS_SECTION_ID, SETTINGS_SECTION_ORDER } from '../protocol.ts'

/** Client services this plugin requires. */
export const inject = ['remote', 'slots', 'locale']

/**
 * Activate the settings page.
 * @param ctx - the client Cordis context.
 * @returns a disposer that withdraws the page and the Remote namespace.
 */
export async function apply(ctx: ClientContext): Promise<Disposer> {
  const adapter = createClientAdapter(ctx)
  const disposers: Disposer[] = []

  try {
    disposers.push(await adapter.mountRemote(TYPERT_REMOTE))

    const locale = adapter.bindLocale(LOCALE_NAMESPACE, MESSAGES)
    disposers.push(locale.dispose)

    // `ctx.inject` parks the callback until the Remote namespace exists; the
    // slot registration then joins the official settings shell. The namespace
    // is resolved at registration time, when it is guaranteed to be mounted.
    adapter.injectSection(() =>
      adapter.registerSection(
        {
          kind: 'list',
          id: SETTINGS_SECTION_ID,
          order: SETTINGS_SECTION_ORDER,
          label: () => locale.t('nav'),
          locale: LOCALE_NAMESPACE
        },
        (props: Record<string, unknown>) =>
          PackInstallerSection({ ...props, remote: adapter.remoteNamespace<InstallerRemote>(SERVICE_NAME), t: locale.t })
      )
    )
  } catch (error) {
    await composeDisposers(disposers)()
    throw error
  }

  return composeDisposers(disposers)
}

export { PackInstallerSection } from './section.tsx'
export { REMOTE_SERVICE_KEY, TYPERT_REMOTE } from './typert-remote.ts'
