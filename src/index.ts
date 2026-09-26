/**
 * Host entry of the EAC pack installer.
 *
 * The default export is the Cordis service class; the Cordis Loader mounts it
 * from the profile patch row this bundle inserts (`cordis.patch.yml`), which is
 * the same shape `@deepseek-ai/dsh-plugin-manager` uses.
 *
 * @module index
 */

export { PackInstaller, PackInstaller as default, DEFAULT_CATALOG_URL } from './adapter/dsh-0.1.7-host.ts'
export { SERVICE_NAME, SETTINGS_NAMESPACE, CONVENTION_ID } from './protocol.ts'
