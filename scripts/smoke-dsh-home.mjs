import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { URL, fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const required = [
  'lib/index.js',
  'lib/client.js',
  'dsh-plugin.json',
  'cordis.patch.yml',
  'README.md'
]
for (const relative of required) {
  const path = join(root, relative)
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`missing release file: ${relative}`)
}
const manifest = JSON.parse(readFileSync(join(root, 'dsh-plugin.json'), 'utf8'))
if (manifest.id !== 'dev.dsh-eac.pack-installer') throw new Error('manifest id mismatch')
if (manifest.facets?.host?.entry !== 'lib/index.js') throw new Error('host entry mismatch')
const host = readFileSync(join(root, 'lib/index.js'), 'utf8')
const client = readFileSync(join(root, 'lib/client.js'), 'utf8')
if (!host.includes('eacPackInstaller')) throw new Error('host Remote service was not bundled')
if (!client.includes('settings.section')) throw new Error('client settings section was not bundled')
if (/DEEPSEEK_API_KEY\s*[:=]/i.test(host + client)) throw new Error('release bundle contains a credential assignment')
console.log('M5 offline package smoke passed: host/client/manifest/patch/snapshot boundary is present')
