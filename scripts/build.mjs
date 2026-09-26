import { mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const libDir = join(packageDir, 'lib')
const packageName = '@dsh-eac/pack-installer'

await rm(libDir, { recursive: true, force: true })
await mkdir(libDir, { recursive: true })

await esbuild.build({
  entryPoints: [join(packageDir, 'src/index.ts')],
  outfile: join(libDir, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  external: ['@deepseek-ai/*'],
  sourcemap: false,
  logLevel: 'warning'
})

const banner = `window.__ModuleLoader__.load({\n  id: ${JSON.stringify(packageName)},\n  factory: (require) => {\n    var module = { exports: {} };\n`
const footer = `\n    return module.exports;\n  },\n});\n`

await esbuild.build({
  entryPoints: [join(packageDir, 'src/client/index.ts')],
  outfile: join(libDir, 'client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2023',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/*'],
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: banner },
  footer: { js: footer },
  sourcemap: false,
  logLevel: 'warning'
})

console.log('built lib/index.js + lib/client.js')
