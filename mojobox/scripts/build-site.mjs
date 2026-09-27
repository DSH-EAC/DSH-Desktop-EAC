import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ZipArchive } from 'archiver'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const generated = join(root, 'site', 'public', 'generated')
const artifactCache = join(root, '.cache', 'artifacts')
const fixedDate = new Date('1980-01-01T00:00:00Z')

const readJson = async path => JSON.parse(await readFile(join(root, path), 'utf8'))
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

async function jsonFiles(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => join(directory, entry.name).replaceAll('\\', '/'))
    .sort()
}

async function fetchArtifact(manifest) {
  const expected = manifest.artifact?.digest
  const url = manifest.artifact?.path
  if (!expected || !url) throw new Error(`${manifest.id} has no downloadable artifact`)

  const cachePath = join(artifactCache, expected.slice('sha256:'.length))
  try {
    const cached = await readFile(cachePath)
    if (sha256(cached) === expected) return cachePath
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const actual = sha256(bytes)
  if (actual !== expected) throw new Error(`${manifest.id} artifact digest mismatch: ${actual}`)
  await mkdir(artifactCache, { recursive: true })
  await writeFile(cachePath, bytes)
  return cachePath
}

async function createPackArchive(pack, lock, manifests) {
  const filename = `${pack.metadata.id}-${pack.metadata.version}.dshpack`
  const outputPath = join(generated, 'downloads', filename)
  await mkdir(dirname(outputPath), { recursive: true })

  const objects = new Map()
  for (const component of [...lock.components].sort((a, b) => a.id.localeCompare(b.id))) {
    const manifest = manifests.get(component.id)
    const manifestBytes = await readFile(join(root, component.manifest))
    if (sha256(manifestBytes) !== component.manifestDigest) throw new Error(`${component.id} Manifest digest mismatch`)
    objects.set(component.manifestDigest, manifestBytes)
    const path = await fetchArtifact(manifest)
    objects.set(component.artifactDigest, await readFile(path))
  }

  await new Promise((resolveArchive, rejectArchive) => {
    const output = createWriteStream(outputPath)
    const archive = new ZipArchive({ zlib: { level: 9 } })
    output.on('close', resolveArchive)
    output.on('error', rejectArchive)
    archive.on('error', rejectArchive)
    archive.pipe(output)
    archive.append(`${JSON.stringify(pack, null, 2)}\n`, { name: 'pack.json', date: fixedDate, mode: 0o644 })
    archive.append(`${JSON.stringify(lock, null, 2)}\n`, { name: 'pack.lock.json', date: fixedDate, mode: 0o644 })
    for (const [digest, bytes] of [...objects].sort(([left], [right]) => left.localeCompare(right))) {
      archive.append(bytes, {
        name: `objects/sha256/${digest.slice('sha256:'.length)}`,
        date: fixedDate,
        mode: 0o644
      })
    }
    archive.finalize()
  })

  return `generated/downloads/${filename}`
}

export async function buildSite() {
  await rm(generated, { recursive: true, force: true })
  await mkdir(join(generated, 'manifests'), { recursive: true })
  await mkdir(join(generated, 'packs'), { recursive: true })

  const pluginPaths = await jsonFiles('catalog/plugins')
  const evidencePaths = await jsonFiles('catalog/evidence')
  const packPaths = (await jsonFiles('catalog/packs')).filter(path => path.endsWith('.pack.json'))
  const manifests = new Map()
  const evidenceBySubject = new Map()

  for (const path of pluginPaths) {
    const manifest = await readJson(path)
    manifests.set(manifest.id, manifest)
    await copyFile(join(root, path), join(generated, 'manifests', basename(path)))
  }

  for (const path of evidencePaths) {
    const evidence = await readJson(path)
    const records = evidenceBySubject.get(evidence.subject.id) || []
    records.push(evidence)
    evidenceBySubject.set(evidence.subject.id, records)
  }

  const plugins = pluginPaths.map(path => {
    const manifest = manifests.get(basename(path, '.json'))
    return manifest
  }).filter(Boolean).map(manifest => ({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    license: manifest.license || null,
    source: manifest.source || null,
    artifact: manifest.artifact || null,
    maintenance: manifest['x-mojobox-maintenance'] || null,
    packageMetadata: manifest['x-mojobox-package'] || null,
    manifestUrl: `generated/manifests/${manifest.id}.json`,
    evidence: evidenceBySubject.get(manifest.id) || []
  }))

  const packs = []
  for (const packPath of packPaths) {
    const lockPath = packPath.replace('.pack.json', '.lock.json')
    const pack = await readJson(packPath)
    const lock = await readJson(lockPath)
    await copyFile(join(root, packPath), join(generated, 'packs', basename(packPath)))
    await copyFile(join(root, lockPath), join(generated, 'packs', basename(lockPath)))
    packs.push({
      ...pack,
      lock,
      packUrl: `generated/packs/${basename(packPath)}`,
      lockUrl: `generated/packs/${basename(lockPath)}`,
      archiveUrl: await createPackArchive(pack, lock, manifests)
    })
  }

  const catalog = {
    apiVersion: 'catalog.mojobox.dev/v1alpha1',
    specifications: await readJson('spec-revisions.json'),
    plugins: plugins.sort((a, b) => a.name.localeCompare(b.name)),
    packs: packs.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))
  }
  await writeFile(join(generated, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`)
  console.log(`Built static catalog with ${plugins.length} plugins and ${packs.length} Packs.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildSite()
}
