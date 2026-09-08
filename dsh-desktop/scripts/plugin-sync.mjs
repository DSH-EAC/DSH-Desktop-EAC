#!/usr/bin/env node

/*
 * Offline manifest/lock tooling for the bundled plugin tree.
 *
 * This file deliberately has no package dependencies.  Network resolution,
 * mirroring, patch rebasing, staging and runtime overlay writes belong to later
 * layers; this command only validates local inputs and produces deterministic
 * reports/metadata.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_FILE);
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '../..');
const FORBIDDEN_NAMES = new Set(['node_modules', 'vendor', 'cache']);
const IGNORED_TREE_NAMES = new Set(['.git', ...FORBIDDEN_NAMES]);
const HEX_256 = /^[0-9a-f]{64}$/;

const INVENTORY_ROOTS = [
  { kind: 'plugin', manifestKey: 'plugins', relative: 'dsh-desktop/assets/plugins' },
  { kind: 'skin', manifestKey: 'skins', relative: 'dsh-desktop/assets/skins' },
  { kind: 'sdk-plugin', manifestKey: 'sdkPlugins', relative: 'dsh-desktop/assets/sdk-plugins' },
];
const ALLOWED_CLASSES = new Set([
  'follow-upstream',
  'patched',
  'internal',
  'manual',
  'resource',
  'isolated-sdk',
]);
const ALLOWED_SYNC_MODES = new Set(['mirror', 'patch-rebase', 'metadata-only', 'manual']);
const ALLOWED_SOURCE_KINDS = new Set(['npm', 'github', 'internal', 'unknown']);
const ALLOWED_RUNTIME_SOURCE_KINDS = new Set(['npm', 'github']);

export class PluginSyncError extends Error {
  constructor(message, code = 'validation') {
    super(message);
    this.name = 'PluginSyncError';
    this.code = code;
  }
}

class ValidationFailure extends PluginSyncError {
  constructor(errors) {
    super(errors.join('\n'), 'validation');
    this.errors = errors;
  }
}

function fail(message, code = 'validation') {
  throw new PluginSyncError(message, code);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSlashes(value) {
  return String(value).replaceAll('\\', '/');
}

function relativePosix(from, to) {
  return normalizeSlashes(path.relative(from, to));
}

function isSafeRelative(value) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) return false;
  const normalized = normalizeSlashes(value);
  return normalized !== '..'
    && !normalized.startsWith('../')
    && !normalized.startsWith('/')
    && !/^[A-Za-z]:\//.test(normalized)
    && !normalized.startsWith('//')
    && !normalized.includes('/../')
    && !normalized.includes('\0');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function prettyJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256Text(value) {
  return sha256Bytes(Buffer.from(String(value), 'utf8'));
}

function sha256File(file) {
  return sha256Bytes(readFileSync(file));
}

function byteCompare(a, b) {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

function sortedDirEntries(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => byteCompare(a.name, b.name));
}

function collectTreeFiles(directory) {
  const files = [];
  const excluded = [];
  const root = path.resolve(directory);

  function visit(current, relativeDirectory) {
    for (const entry of sortedDirEntries(current)) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolutePath = path.join(current, entry.name);
      if (IGNORED_TREE_NAMES.has(entry.name)) {
        excluded.push(relativePath);
        continue;
      }
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files.push({ absolutePath, relativePath: normalizeSlashes(relativePath), type: 'file' });
      } else if (entry.isSymbolicLink()) {
        // Hash the link itself rather than following it.  A link cannot smuggle
        // outside bytes into an otherwise local, reproducible tree digest.
        files.push({
          absolutePath,
          relativePath: normalizeSlashes(relativePath),
          type: 'symlink',
          target: readlinkSync(absolutePath),
        });
      } else {
        fail(`unsupported filesystem entry in plugin tree: ${relativePath}`);
      }
    }
  }

  if (!existsSync(root) || !lstatSync(root).isDirectory()) fail(`plugin tree is not a directory: ${directory}`);
  visit(root, '');
  files.sort((a, b) => byteCompare(a.relativePath, b.relativePath));
  excluded.sort(byteCompare);
  return { files, excluded };
}

/**
 * Hash included file paths and bytes.  mtime, mode and directory mtimes are
 * intentionally absent so a checkout on another filesystem has the same hash.
 */
export function treeSha256(directory) {
  const digest = createHash('sha256');
  for (const file of collectTreeFiles(directory).files) {
    digest.update(Buffer.from(`file\0${file.relativePath}\0`, 'utf8'));
    if (file.type === 'symlink') digest.update(Buffer.from(`symlink:${file.target}`, 'utf8'));
    else digest.update(readFileSync(file.absolutePath));
    digest.update(Buffer.from('\0', 'utf8'));
  }
  return digest.digest('hex');
}

export function treeSnapshot(directory) {
  const result = collectTreeFiles(directory);
  const digest = createHash('sha256');
  for (const file of result.files) {
    digest.update(Buffer.from(`file\0${file.relativePath}\0`, 'utf8'));
    if (file.type === 'symlink') digest.update(Buffer.from(`symlink:${file.target}`, 'utf8'));
    else digest.update(readFileSync(file.absolutePath));
    digest.update(Buffer.from('\0', 'utf8'));
  }
  return {
    treeSha256: digest.digest('hex'),
    files: result.files.map((file) => file.relativePath),
    excludedPaths: result.excluded,
  };
}

function globToRegExp(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${source}$`);
}

function allFilesUnder(root) {
  const output = [];
  function visit(current, relativeDirectory) {
    for (const entry of sortedDirEntries(current)) {
      if (IGNORED_TREE_NAMES.has(entry.name)) continue;
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolutePath, relativePath);
      else if (entry.isFile()) output.push({ absolutePath, relativePath: normalizeSlashes(relativePath) });
    }
  }
  if (existsSync(root) && lstatSync(root).isDirectory()) visit(root, '');
  output.sort((a, b) => byteCompare(a.relativePath, b.relativePath));
  return output;
}

function resolvePatchMatches(root, declaredPath) {
  if (!isSafeRelative(declaredPath)) fail(`unsafe patch path: ${declaredPath}`);
  const pattern = normalizeSlashes(declaredPath);
  const candidates = allFilesUnder(root);
  const regex = globToRegExp(pattern);
  const matches = candidates.filter((candidate) => regex.test(candidate.relativePath));
  if (matches.length === 0 && !pattern.includes('*') && !pattern.includes('?')) {
    const absolute = path.resolve(root, pattern);
    if (existsSync(absolute) && lstatSync(absolute).isFile()) {
      return [{ absolutePath: absolute, relativePath: pattern }];
    }
  }
  if (matches.length === 0) fail(`declared patch file does not exist: ${declaredPath}`);
  return matches;
}

/** Hash the declared patch set, including sorted paths and bytes. */
export function patchSetSha256(root, patches = []) {
  if (!Array.isArray(patches)) fail('patch set must be an array');
  const resolved = [];
  for (const patch of patches) resolved.push(...resolvePatchMatches(root, patch));
  const unique = new Map(resolved.map((file) => [file.relativePath, file]));
  const digest = createHash('sha256');
  for (const file of [...unique.values()].sort((a, b) => byteCompare(a.relativePath, b.relativePath))) {
    digest.update(Buffer.from(`patch\0${file.relativePath}\0`, 'utf8'));
    digest.update(readFileSync(file.absolutePath));
    digest.update(Buffer.from('\0', 'utf8'));
  }
  return digest.digest('hex');
}

function patchSetFiles(root, patches = []) {
  const resolved = [];
  for (const patch of patches) resolved.push(...resolvePatchMatches(root, patch));
  return [...new Map(resolved.map((file) => [file.relativePath, file])).values()]
    .sort((a, b) => byteCompare(a.relativePath, b.relativePath))
    .map((file) => file.relativePath);
}

/**
 * Atomically replace a file.  The temporary file is in the target directory so
 * rename remains atomic; the old target is never removed before the new bytes
 * are ready.  `hooks.beforeRename` is intentionally exposed for interruption
 * tests and is not used by the CLI.
 */
export function writeFileAtomic(file, content, hooks = {}) {
  const target = path.resolve(file);
  mkdirSync(path.dirname(target), { recursive: true });
  const token = `${process.pid}-${Date.now()}-${randomBytes(6).toString('hex')}`;
  const temporary = `${target}.tmp-${token}`;
  let backup = null;
  let movedOld = false;
  try {
    writeFileSync(temporary, content);
    if (typeof hooks.beforeRename === 'function') hooks.beforeRename();
    try {
      renameSync(temporary, target);
    } catch (firstError) {
      // Windows may reject replacing an open target.  Keep a recoverable old
      // name while trying the second rename; a failure restores it.
      backup = `${target}.old-${token}`;
      try {
        renameSync(target, backup);
        movedOld = true;
      } catch {
        backup = null;
      }
      try {
        renameSync(temporary, target);
      } catch (secondError) {
        if (movedOld) {
          try { renameSync(backup, target); } catch { /* leave old backup for diagnosis */ }
        }
        throw secondError || firstError;
      }
    }
    if (movedOld && backup) {
      try { rmSync(backup, { force: true }); } catch { /* next write cleans stale backups */ }
    }
  } catch (error) {
    try { rmSync(temporary, { force: true }); } catch { /* best effort */ }
    if (movedOld && backup && !existsSync(target)) {
      try { renameSync(backup, target); } catch { /* preserve backup rather than overwrite */ }
    }
    throw error;
  }
}

export function writeJsonAtomic(file, value, hooks = {}) {
  writeFileAtomic(file, prettyJson(value), hooks);
}

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`${label} cannot be parsed: ${detail}`);
  }
}

function projectPaths(root) {
  return {
    root,
    sync: path.join(root, '.sync'),
    manifest: path.join(root, '.sync', 'plugins.json'),
    schema: path.join(root, '.sync', 'plugins.schema.json'),
    policies: path.join(root, '.sync', 'policies.json'),
    lock: path.join(root, '.sync', 'plugins.lock.json'),
    registry: path.join(root, 'dsh-desktop', 'lib', 'desktop', 'plugin-sync-registry.ts'),
  };
}

export function loadProject(root = DEFAULT_ROOT) {
  const paths = projectPaths(path.resolve(root));
  return {
    paths,
    manifest: readJson(paths.manifest, 'manifest'),
    schema: readJson(paths.schema, 'schema'),
    policies: readJson(paths.policies, 'policies'),
  };
}

function schemaTypeMatches(value, type) {
  if (type === 'object') return isObject(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'null') return value === null;
  return true;
}

function resolveSchemaRef(schemaRoot, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  let current = schemaRoot;
  for (const segment of ref.slice(2).split('/')) {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    current = current?.[key];
  }
  return current;
}

function schemaMatches(value, schema, schemaRoot) {
  if (!isObject(schema)) return true;
  if (schema.$ref) {
    const referenced = resolveSchemaRef(schemaRoot, schema.$ref);
    return referenced ? schemaMatches(value, referenced, schemaRoot) : false;
  }
  if (schema.const !== undefined && stableJson(value) !== stableJson(schema.const)) return false;
  if (schema.enum && !schema.enum.some((item) => stableJson(item) === stableJson(value))) return false;
  if (schema.type && !schemaTypeMatches(value, schema.type)) return false;
  if (schema.required && isObject(value) && schema.required.some((key) => !(key in value))) return false;
  if (schema.properties && isObject(value)) {
    for (const [key, child] of Object.entries(schema.properties)) {
      if (key in value && !schemaMatches(value[key], child, schemaRoot)) return false;
    }
  }
  if (schema.additionalProperties === false && isObject(value)) {
    const known = new Set(Object.keys(schema.properties || {}));
    if (Object.keys(value).some((key) => !known.has(key))) return false;
  }
  if (schema.items && Array.isArray(value) && value.some((item) => !schemaMatches(item, schema.items, schemaRoot))) return false;
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) return false;
  if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) return false;
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) return false;
  if (schema.anyOf && !schema.anyOf.some((child) => schemaMatches(value, child, schemaRoot))) return false;
  if (schema.allOf && schema.allOf.some((child) => !schemaMatches(value, child, schemaRoot))) return false;
  if (schema.not && schemaMatches(value, schema.not, schemaRoot)) return false;
  if (schema.if && schemaMatches(value, schema.if, schemaRoot) && schema.then && !schemaMatches(value, schema.then, schemaRoot)) return false;
  return true;
}

function validateSchema(value, schema, label) {
  const errors = [];
  const root = schema;

  function visit(current, rule, pointer) {
    if (!isObject(rule)) return;
    if (rule.$ref) {
      const referenced = resolveSchemaRef(root, rule.$ref);
      if (!referenced) errors.push(`${pointer}: unresolved schema reference ${rule.$ref}`);
      else visit(current, referenced, pointer);
      return;
    }
    if (rule.const !== undefined && stableJson(current) !== stableJson(rule.const)) {
      errors.push(`${pointer}: must equal ${JSON.stringify(rule.const)}`);
    }
    if (rule.enum && !rule.enum.some((item) => stableJson(item) === stableJson(current))) {
      errors.push(`${pointer}: must be one of ${rule.enum.join(', ')}`);
    }
    if (rule.type && !schemaTypeMatches(current, rule.type)) {
      errors.push(`${pointer}: expected ${rule.type}`);
      return;
    }
    if (rule.required && isObject(current)) {
      for (const key of rule.required) {
        if (!(key in current)) errors.push(`${pointer}: missing required property ${key}`);
      }
    }
    if (rule.additionalProperties === false && isObject(current)) {
      const known = new Set(Object.keys(rule.properties || {}));
      for (const key of Object.keys(current)) {
        if (!known.has(key)) errors.push(`${pointer}/${key}: additional property is not allowed`);
      }
    }
    if (rule.properties && isObject(current)) {
      for (const [key, child] of Object.entries(rule.properties)) {
        if (key in current) visit(current[key], child, `${pointer}/${key}`);
      }
    }
    if (rule.items && Array.isArray(current)) {
      current.forEach((item, index) => visit(item, rule.items, `${pointer}/${index}`));
    }
    if (rule.pattern && typeof current === 'string' && !new RegExp(rule.pattern).test(current)) {
      errors.push(`${pointer}: does not match ${rule.pattern}`);
    }
    if (rule.minLength !== undefined && typeof current === 'string' && current.length < rule.minLength) {
      errors.push(`${pointer}: must contain at least ${rule.minLength} characters`);
    }
    if (rule.minimum !== undefined && typeof current === 'number' && current < rule.minimum) {
      errors.push(`${pointer}: must be at least ${rule.minimum}`);
    }
    if (rule.anyOf && !rule.anyOf.some((child) => schemaMatches(current, child, root))) {
      errors.push(`${pointer}: does not match any allowed schema branch`);
    }
    if (rule.allOf) {
      for (const child of rule.allOf) visit(current, child, pointer);
    }
    if (rule.if && schemaMatches(current, rule.if, root) && rule.then) visit(current, rule.then, pointer);
    if (rule.not && schemaMatches(current, rule.not, root)) errors.push(`${pointer}: must not match prohibited schema`);
  }

  visit(value, schema, '$');
  return errors.map((error) => `${label}: ${error}`);
}

function allManifestEntries(manifest) {
  if (!isObject(manifest)) return [];
  return INVENTORY_ROOTS.flatMap((root) => (
    Array.isArray(manifest[root.manifestKey]) ? manifest[root.manifestKey] : []
  ));
}

function packageRoot(root, entry) {
  if (!isSafeRelative(entry.path)) fail(`unsafe package path: ${entry.path}`);
  return path.resolve(root, entry.path);
}

function packageLicense(pkg) {
  return typeof pkg.license === 'string' && pkg.license ? pkg.license : 'UNKNOWN';
}

function packageExportTargets(exportsField) {
  const targets = [];
  function visit(value) {
    if (typeof value === 'string') {
      targets.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (isObject(value)) Object.values(value).forEach(visit);
  }
  visit(exportsField);
  return targets;
}

function sourceMapFromText(text) {
  const marker = /plugin-sync:update-sources\s+([^\n]+)/.exec(text);
  if (!marker) return null;
  try {
    const parsed = JSON.parse(marker[1]);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sourceMap(paths) {
  // The generated registry is the only runtime source of truth.  Do not fall
  // back to a legacy companion table: that would allow the checked-in
  // generated artifact to disappear while validation still reports success.
  if (!existsSync(paths.registry)) return null;
  return sourceMapFromText(readFileSync(paths.registry, 'utf8'));
}

function pushError(errors, message) {
  errors.push(message);
}

function validateManifestInternal(project, { checkRuntimeRegistry = true } = {}) {
  const { paths, manifest, schema, policies } = project;
  const { root } = paths;
  const errors = validateSchema(manifest, schema, 'manifest');
  const manifestObject = isObject(manifest) ? manifest : {};
  const entries = allManifestEntries(manifestObject);
  const ids = new Map();
  const pathsSeen = new Map();
  const rootsByKind = new Map(INVENTORY_ROOTS.map((item) => [item.kind, item]));

  if (manifestObject.schemaVersion !== 1) pushError(errors, 'manifest: schemaVersion must be 1');
  if (manifestObject.generatedRegistry !== 'dsh-desktop/lib/desktop/plugin-sync-registry.ts') {
    pushError(errors, 'manifest: generatedRegistry must point to the runtime registry');
  }
  if (!isObject(policies)) pushError(errors, 'policies: expected an object');

  for (const inventory of INVENTORY_ROOTS) {
    const configured = Array.isArray(policies?.inventoryRoots)
      ? policies.inventoryRoots.find((item) => item?.kind === inventory.kind)
      : null;
    if (!configured || configured.path !== inventory.relative || configured.manifestKey !== inventory.manifestKey) {
      pushError(errors, `policies: inventory root mismatch for ${inventory.kind}`);
    }
    const directory = path.join(root, inventory.relative);
    if (!existsSync(directory) || !lstatSync(directory).isDirectory()) {
      pushError(errors, `inventory directory missing: ${inventory.relative}`);
      continue;
    }
    const actualDirectories = readdirSync(directory, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort(byteCompare);
    const listedDirectories = entries
      .filter((entry) => entry?.kind === inventory.kind)
      .map((entry) => normalizeSlashes(entry?.path || '').split('/').pop())
      .sort(byteCompare);
    if (stableJson(actualDirectories) !== stableJson(listedDirectories)) {
      pushError(errors, `${inventory.kind}: manifest directories do not match the inventory tree`);
    }
  }

  for (const entry of entries) {
    const pointer = `manifest entry ${entry?.id || '<missing>'}`;
    if (!isObject(entry)) {
      pushError(errors, `${pointer}: expected an object`);
      continue;
    }
    if (ids.has(entry.id)) pushError(errors, `${pointer}: duplicate id (also ${ids.get(entry.id)})`);
    else ids.set(entry.id, entry.path);
    if (pathsSeen.has(entry.path)) pushError(errors, `${pointer}: duplicate path (also ${pathsSeen.get(entry.path)})`);
    else pathsSeen.set(entry.path, entry.id);

    const inventory = rootsByKind.get(entry.kind);
    const normalizedEntryPath = normalizeSlashes(entry.path || '');
    if (!inventory || !normalizedEntryPath.startsWith(`${inventory.relative}/`)) {
      pushError(errors, `${pointer}: path is outside its ${entry.kind} inventory root`);
    }
    if (!isSafeRelative(entry.path)) pushError(errors, `${pointer}: path must be a safe relative path`);
    if (entry.class && !ALLOWED_CLASSES.has(entry.class)) pushError(errors, `${pointer}: invalid class ${entry.class}`);
    if (entry.sync?.mode && !ALLOWED_SYNC_MODES.has(entry.sync.mode)) {
      pushError(errors, `${pointer}: invalid sync mode ${entry.sync.mode}`);
    }
    if (entry.source?.kind && !ALLOWED_SOURCE_KINDS.has(entry.source.kind)) {
      pushError(errors, `${pointer}: invalid source kind ${entry.source.kind}`);
    }
    if (entry.source?.kind === 'unknown' && entry.source.repository !== undefined) {
      pushError(errors, `${pointer}: unknown source must not contain a repository`);
    }
    if ((entry.source?.kind === 'unknown' || entry.source?.kind === 'internal') && !entry.source?.reason) {
      pushError(errors, `${pointer}: ${entry.source.kind} source requires a reason`);
    }
    if (entry.source?.kind === 'npm' && !entry.source.name) pushError(errors, `${pointer}: npm source requires name`);
    if (entry.source?.kind === 'github' && !entry.source.repository) pushError(errors, `${pointer}: github source requires repository`);
    if (entry.request?.mode === 'latest') {
      if (typeof entry.request.range !== 'string') pushError(errors, `${pointer}: latest request requires range`);
      if (typeof entry.request.releaseAgeHours !== 'number' || entry.request.releaseAgeHours < 0) {
        pushError(errors, `${pointer}: latest request requires a non-negative releaseAgeHours`);
      }
    } else if (entry.request?.mode === 'exact') {
      if (!entry.request.version && !entry.request.commit) pushError(errors, `${pointer}: exact request requires version or commit`);
    }
    if (entry.runtimeUpdate?.allowed === true) {
      if (!entry.runtimeUpdate.source) pushError(errors, `${pointer}: enabled runtime update requires a source`);
      if (!ALLOWED_RUNTIME_SOURCE_KINDS.has(entry.runtimeUpdate.source?.kind)) {
        pushError(errors, `${pointer}: runtime update source kind is invalid`);
      }
    } else if (entry.runtimeUpdate?.source !== undefined) {
      pushError(errors, `${pointer}: disabled runtime update must not declare a source`);
    }
    const ownerPaths = Array.isArray(policies?.owners?.[entry.owner]) ? policies.owners[entry.owner] : [];
    if (ownerPaths.length === 0 || !ownerPaths.some((prefix) => (
      typeof prefix === 'string' && normalizedEntryPath.startsWith(prefix)
    ))) {
      pushError(errors, `${pointer}: owner ${entry.owner} does not own ${normalizedEntryPath}`);
    }
    if (entry.kind === 'skin') {
      if (entry.class !== 'resource') pushError(errors, `${pointer}: skins must use class resource`);
      if (entry.sync?.mode !== 'metadata-only') pushError(errors, `${pointer}: skins must use metadata-only sync`);
      if (entry.runtimeUpdate?.allowed !== false) pushError(errors, `${pointer}: skins cannot use runtime updates`);
    }
    if (entry.kind === 'sdk-plugin') {
      if (entry.class !== 'isolated-sdk') pushError(errors, `${pointer}: SDK plugins must use class isolated-sdk`);
      if (entry.runtimeUpdate?.allowed !== false) pushError(errors, `${pointer}: SDK plugins cannot use runtime updates`);
    }

    const packageDirectory = packageRoot(root, entry);
    const packageFile = path.join(packageDirectory, 'package.json');
    if (!existsSync(packageDirectory) || !lstatSync(packageDirectory).isDirectory()) {
      pushError(errors, `${pointer}: package directory is missing`);
      continue;
    }
    if (!existsSync(packageFile)) {
      pushError(errors, `${pointer}: package.json is missing`);
      continue;
    }
    let pkg;
    try {
      pkg = readJson(packageFile, `${pointer} package.json`);
    } catch (error) {
      pushError(errors, error.message);
      continue;
    }
    if (!isObject(pkg)) {
      pushError(errors, `${pointer}: package.json must contain an object`);
      continue;
    }
    if (entry.packageName !== pkg.name) pushError(errors, `${pointer}: packageName ${entry.packageName} does not match package.json name ${pkg.name}`);
    if (typeof pkg.version !== 'string' || !pkg.version) pushError(errors, `${pointer}: package.json version is missing`);
    if (entry.request?.mode === 'exact' && entry.request.version && pkg.version !== entry.request.version) {
      pushError(errors, `${pointer}: exact request version ${entry.request.version} does not match package.json ${pkg.version}`);
    }
    if (entry.license?.expected !== packageLicense(pkg)) {
      pushError(errors, `${pointer}: license ${entry.license?.expected} does not match package.json ${packageLicense(pkg)}`);
    }
    const entrypoints = Array.isArray(entry.validation?.entrypoints) ? entry.validation.entrypoints : [];
    if (entrypoints.length === 0) pushError(errors, `${pointer}: at least one entrypoint is required`);
    for (const entrypoint of entrypoints) {
      if (!isSafeRelative(entrypoint) || entrypoint.startsWith('/')) {
        pushError(errors, `${pointer}: unsafe entrypoint ${entrypoint}`);
      } else if (!existsSync(path.join(packageDirectory, entrypoint))
        || !lstatSync(path.join(packageDirectory, entrypoint)).isFile()) {
        pushError(errors, `${pointer}: entrypoint is missing ${entrypoint}`);
      }
    }
    if (pkg.main !== undefined) {
      if (typeof pkg.main !== 'string' || !isSafeRelative(pkg.main)) {
        pushError(errors, `${pointer}: package.json main is unsafe ${String(pkg.main)}`);
      } else if (!existsSync(path.join(packageDirectory, pkg.main))
        || !lstatSync(path.join(packageDirectory, pkg.main)).isFile()) {
        pushError(errors, `${pointer}: package.json main is missing ${pkg.main}`);
      }
    }
    for (const target of packageExportTargets(pkg.exports)) {
      if (target.startsWith('./')) {
        const relativeTarget = target.slice(2);
        if (!isSafeRelative(relativeTarget)) {
          pushError(errors, `${pointer}: package.json export is unsafe ${target}`);
        } else if (!relativeTarget.includes('*')
          && (!existsSync(path.join(packageDirectory, relativeTarget))
            || !lstatSync(path.join(packageDirectory, relativeTarget)).isFile())) {
          pushError(errors, `${pointer}: package.json export is missing ${target}`);
        }
      } else if (target.startsWith('../') || path.isAbsolute(target)) {
        pushError(errors, `${pointer}: package.json export is unsafe ${target}`);
      }
    }
    for (const field of ['patches', 'preservePaths']) {
      for (const declared of Array.isArray(entry.sync?.[field]) ? entry.sync[field] : []) {
        const segments = normalizeSlashes(declared).split('/');
        if (!isSafeRelative(declared)) {
          pushError(errors, `${pointer}: ${field} must be a safe relative path ${declared}`);
        }
        if (segments.some((segment) => FORBIDDEN_NAMES.has(segment))) {
          pushError(errors, `${pointer}: ${field} may not target forbidden path ${declared}`);
        }
      }
    }
  }

  const updates = sourceMap(paths);
  if (checkRuntimeRegistry && updates === null) {
    pushError(errors, 'runtime source registry is missing from generated registry');
  } else if (checkRuntimeRegistry) {
    const runtimeEntries = entries.filter((entry) => entry.runtimeUpdate?.allowed === true);
    const expectedCount = policies?.runtimeUpdates?.legacySourceCount;
    if (typeof expectedCount === 'number' && expectedCount !== Object.keys(updates).length) {
      pushError(errors, `runtime source registry count ${Object.keys(updates).length} does not match policy ${expectedCount}`);
    }
    const expectedIds = new Set(runtimeEntries.map((entry) => entry.id));
    for (const id of Object.keys(updates)) {
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry) {
        pushError(errors, `runtime source ${id} has no manifest entry`);
        continue;
      }
      if (!entry.runtimeUpdate?.allowed) pushError(errors, `runtime source ${id} is not allowed by the manifest`);
      const update = updates[id];
      const runtime = entry.runtimeUpdate?.source;
      if (update.npm && (runtime?.kind !== 'npm' || runtime.name !== update.npm)) {
        pushError(errors, `runtime source ${id} npm mapping differs from manifest`);
      }
      if (update.github && (runtime?.kind !== 'github' || runtime.repository !== `https://github.com/${update.github}`)) {
        pushError(errors, `runtime source ${id} GitHub mapping differs from manifest`);
      }
    }
    for (const id of expectedIds) if (!Object.hasOwn(updates, id)) pushError(errors, `manifest runtime source ${id} is missing from registry`);
    if (policies?.runtimeUpdates?.sourceMapMustBeOneToOne && Object.keys(updates).length !== expectedIds.size) {
      pushError(errors, 'runtime source registry must map one-to-one to allowed manifest entries');
    }
  }

  return { errors, entries, updates: updates || {} };
}

export function validateManifest(root = DEFAULT_ROOT, options = {}) {
  const project = loadProject(root);
  const result = validateManifestInternal(project, options);
  if (result.errors.length > 0) throw new ValidationFailure(result.errors);
  return {
    root: project.paths.root,
    manifest: project.manifest,
    policies: project.policies,
    entries: result.entries,
    updates: result.updates,
    counts: {
      plugins: Array.isArray(project.manifest.plugins) ? project.manifest.plugins.length : 0,
      skins: Array.isArray(project.manifest.skins) ? project.manifest.skins.length : 0,
      sdkPlugins: Array.isArray(project.manifest.sdkPlugins) ? project.manifest.sdkPlugins.length : 0,
    },
  };
}

function registryPayload(manifest) {
  const entries = {};
  const updates = {};
  for (const entry of allManifestEntries(manifest).sort((a, b) => byteCompare(a.id, b.id))) {
    entries[entry.id] = {
      kind: entry.kind,
      path: entry.path,
      packageName: entry.packageName,
      class: entry.class,
      syncMode: entry.sync.mode,
      source: entry.source,
      runtimeUpdate: entry.runtimeUpdate,
    };
    if (entry.runtimeUpdate.allowed) {
      const source = entry.runtimeUpdate.source;
      updates[entry.id] = source.kind === 'npm'
        ? { npm: source.name }
        : { github: source.repository.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '') };
    }
  }
  return {
    schemaVersion: manifest?.schemaVersion,
    manifest: '.sync/plugins.json',
    entries,
    updateSources: updates,
  };
}

export function generateRegistryText(manifest) {
  const payload = registryPayload(manifest);
  return [
    '// GENERATED FILE — do not edit by hand.',
    '// Source: .sync/plugins.json (run generate-plugin-registry.mjs).',
    `// plugin-sync:update-sources ${JSON.stringify(payload.updateSources)}`,
    '',
    `export const PLUGIN_SYNC_REGISTRY = ${prettyJson(payload).replace(/\n$/, '')} as const;`,
    'export const PLUGIN_UPDATE_SOURCES = PLUGIN_SYNC_REGISTRY.updateSources;',
    'export default PLUGIN_SYNC_REGISTRY;',
    '',
  ].join('\n');
}

export function generateRegistry(root = DEFAULT_ROOT, { check = false } = {}) {
  // A write regenerates the derived artifact from the manifest, so a missing
  // or stale registry must not prevent generation. --check remains strict and
  // validates the currently checked-in source map before reporting drift.
  const result = validateManifest(root, { checkRuntimeRegistry: check });
  const file = projectPaths(path.resolve(root)).registry;
  const expected = generateRegistryText(result.manifest);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (check) {
    if (current !== expected) {
      throw new ValidationFailure([`generated registry drift: ${relativePosix(path.resolve(root), file)}`]);
    }
    return { file, changed: false, checked: true };
  }
  if (current !== expected) writeFileAtomic(file, expected);
  return { file, changed: current !== expected, checked: false };
}

function resolvedSource(entry, packageJson, treeHash) {
  const source = { kind: entry.source.kind };
  if (entry.source.name) source.name = entry.source.name;
  if (entry.source.repository) source.repository = entry.source.repository;
  if (packageJson.version) source.version = packageJson.version;
  if (entry.request.commit) source.commit = entry.request.commit;
  // This is the digest of the local source snapshot available offline.  A
  // future network resolver may replace it with a tarball/archive digest, but
  // it must not pretend that a network artifact was fetched here.
  source.sha256 = treeHash;
  return source;
}

export function buildLock(root = DEFAULT_ROOT) {
  const result = validateManifest(root);
  const project = loadProject(root);
  const lockEntries = {};
  for (const entry of [...result.entries].sort((a, b) => byteCompare(a.id, b.id))) {
    const directory = packageRoot(project.paths.root, entry);
    const pkg = readJson(path.join(directory, 'package.json'), `${entry.id} package.json`);
    const snapshot = treeSnapshot(directory);
    const patches = Array.isArray(entry.sync?.patches) ? entry.sync.patches : [];
    const patchHash = patchSetSha256(project.paths.root, patches);
    const requested = entry.request.mode === 'latest'
      ? 'latest'
      : (entry.request.version || entry.request.commit);
    lockEntries[entry.id] = {
      requested,
      source: resolvedSource(entry, pkg, snapshot.treeSha256),
      local: {
        path: entry.path,
        packageName: pkg.name,
        packageVersion: pkg.version,
        license: packageLicense(pkg),
        entrypoints: entry.validation.entrypoints,
        treeSha256: snapshot.treeSha256,
        fileCount: snapshot.files.length,
        excludedPaths: snapshot.excludedPaths,
      },
      sourceCommit: entry.request.commit || null,
      patchSet: patches.length > 0 ? `sha256:${patchHash}` : 'none',
      patchSetSha256: patchHash,
      patchFiles: patchSetFiles(project.paths.root, patches),
      compatibility: {},
      runtimeUpdate: entry.runtimeUpdate.allowed ? 'enabled' : 'disabled',
      manifestEntrySha256: sha256Text(stableJson(entry)),
    };
  }
  const manifestBytes = readFileSync(project.paths.manifest);
  return {
    schemaVersion: 1,
    manifest: '.sync/plugins.json',
    manifestRevision: sha256Bytes(manifestBytes),
    generatedRegistry: project.manifest.generatedRegistry,
    plugins: lockEntries,
  };
}

function validateLockShape(lock, errors) {
  if (!isObject(lock)) {
    errors.push('lock: expected an object');
    return;
  }
  if (lock.schemaVersion !== 1) errors.push('lock: schemaVersion must be 1');
  if (lock.manifest !== '.sync/plugins.json') errors.push('lock: manifest must be .sync/plugins.json');
  if (typeof lock.manifestRevision !== 'string' || !HEX_256.test(lock.manifestRevision)) errors.push('lock: manifestRevision must be a SHA-256 digest');
  if (lock.generatedRegistry !== 'dsh-desktop/lib/desktop/plugin-sync-registry.ts') errors.push('lock: generatedRegistry must point to the runtime registry');
  if (!isObject(lock.plugins)) errors.push('lock: plugins must be an object');
}

function validateLockInternal(project, manifestResult, lock) {
  const errors = [];
  validateLockShape(lock, errors);
  if (!isObject(lock) || !isObject(lock.plugins)) return errors;
  const entries = manifestResult.entries;
  const expectedIds = new Set(entries.map((entry) => entry.id));
  const actualIds = new Set(isObject(lock.plugins) ? Object.keys(lock.plugins) : []);
  for (const id of expectedIds) if (!actualIds.has(id)) errors.push(`lock completeness: missing ${id}`);
  for (const id of actualIds) if (!expectedIds.has(id)) errors.push(`lock completeness: unexpected ${id}`);
  if (HEX_256.test(lock.manifestRevision || '') && lock.manifestRevision !== sha256File(project.paths.manifest)) {
    errors.push('lock: manifestRevision does not match .sync/plugins.json');
  }

  for (const entry of entries) {
    const item = lock.plugins?.[entry.id];
    if (item === undefined) continue;
    const pointer = `lock ${entry.id}`;
    if (!isObject(item)) {
      errors.push(`${pointer}: expected an object`);
      continue;
    }
    const directory = packageRoot(project.paths.root, entry);
    let pkg;
    try { pkg = readJson(path.join(directory, 'package.json'), `${entry.id} package.json`); } catch (error) {
      errors.push(error.message);
      continue;
    }
    const snapshot = treeSnapshot(directory);
    const patches = Array.isArray(entry.sync?.patches) ? entry.sync.patches : [];
    let patchHash;
    try { patchHash = patchSetSha256(project.paths.root, patches); } catch (error) {
      errors.push(`${pointer}: ${error.message}`);
      continue;
    }
    if (!isObject(item.local)) {
      errors.push(`${pointer}: local lock record is missing`);
      continue;
    }
    if (item.local.path !== entry.path) errors.push(`${pointer}: local path differs from manifest`);
    if (item.local.packageName !== pkg.name || item.local.packageName !== entry.packageName) errors.push(`${pointer}: package name differs from manifest/package.json`);
    if (item.local.packageVersion !== pkg.version) errors.push(`${pointer}: package version differs from package.json`);
    if (item.local.license !== packageLicense(pkg) || item.local.license !== entry.license.expected) errors.push(`${pointer}: license differs from manifest/package.json`);
    if (stableJson(item.local.entrypoints) !== stableJson(entry.validation.entrypoints)) errors.push(`${pointer}: entrypoints differ from manifest`);
    if (!HEX_256.test(item.local.treeSha256 || '')) errors.push(`${pointer}: tree digest is missing or malformed`);
    else if (item.local.treeSha256 !== snapshot.treeSha256) errors.push(`${pointer}: tree digest mismatch`);
    if (item.local.fileCount !== snapshot.files.length) errors.push(`${pointer}: file count mismatch`);
    if (stableJson(item.local.excludedPaths || []) !== stableJson(snapshot.excludedPaths)) errors.push(`${pointer}: excluded forbidden paths changed`);
    const expectedSource = resolvedSource(entry, pkg, snapshot.treeSha256);
    if (stableJson(item.source) !== stableJson(expectedSource)) {
      errors.push(`${pointer}: source identity/resolution differs from manifest or local package`);
    }
    if (item.sourceCommit !== (entry.request.commit || null)) {
      errors.push(`${pointer}: sourceCommit differs from manifest`);
    }
    if (!HEX_256.test(item.patchSetSha256 || '') || item.patchSetSha256 !== patchHash) errors.push(`${pointer}: patch-set digest mismatch`);
    if (stableJson(item.patchFiles || []) !== stableJson(patchSetFiles(project.paths.root, patches))) errors.push(`${pointer}: patch file list mismatch`);
    if (patches.length === 0 && item.patchSet !== 'none') errors.push(`${pointer}: empty patch set must be recorded as none`);
    if (patches.length > 0 && item.patchSet !== `sha256:${patchHash}`) errors.push(`${pointer}: patch-set identifier mismatch`);
    const expectedRequested = entry.request.mode === 'latest'
      ? 'latest'
      : (entry.request.version || entry.request.commit);
    if (item.requested !== expectedRequested) errors.push(`${pointer}: requested version/commit differs from manifest`);
    if (item.runtimeUpdate !== (entry.runtimeUpdate.allowed ? 'enabled' : 'disabled')) errors.push(`${pointer}: runtime update policy differs from manifest`);
    if (item.manifestEntrySha256 !== sha256Text(stableJson(entry))) errors.push(`${pointer}: manifest entry digest mismatch`);
    if (entry.request.mode === 'latest' && item.source?.version !== pkg.version) errors.push(`${pointer}: latest resolution is not pinned to a local exact version`);
    if (entry.request.mode === 'exact' && entry.request.version && item.source?.version !== entry.request.version) errors.push(`${pointer}: exact source version mismatch`);
    if (entry.request.commit && item.source?.commit !== entry.request.commit) errors.push(`${pointer}: exact source commit mismatch`);
    if (item.source?.kind !== entry.source.kind) errors.push(`${pointer}: source kind differs from manifest`);
    if (item.local.files) {
      const forbidden = item.local.files.filter((file) => normalizeSlashes(file).split('/').some((part) => FORBIDDEN_NAMES.has(part)));
      if (forbidden.length > 0) errors.push(`${pointer}: lock attempts to include forbidden files ${forbidden.join(', ')}`);
    }
  }
  return errors;
}

export function validateLocked(root = DEFAULT_ROOT) {
  const manifestResult = validateManifest(root);
  const project = loadProject(root);
  if (!existsSync(project.paths.lock)) fail('lock: .sync/plugins.lock.json is missing');
  const lock = readJson(project.paths.lock, 'lock');
  const errors = validateLockInternal(project, manifestResult, lock);
  try {
    generateRegistry(root, { check: true });
  } catch (error) {
    errors.push(error.message);
  }
  if (errors.length > 0) throw new ValidationFailure(errors);
  return {
    root: project.paths.root,
    lock,
    counts: { entries: Object.keys(lock.plugins).length },
  };
}

function parseArgs(argv) {
  const flags = new Map();
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check' || arg === '--dry-run' || arg === '--locked') flags.set(arg.slice(2), true);
    else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) fail(`missing value for --${key}`, 'usage');
      flags.set(key, value);
      index += 1;
    } else positionals.push(arg);
  }
  return { flags, positionals };
}

function printManifestReport(result) {
  console.log(`manifest valid: plugins=${result.counts.plugins} skins=${result.counts.skins} sdkPlugins=${result.counts.sdkPlugins}`);
}

function runSync(root, flags) {
  if (!flags.get('dry-run')) fail('sync writes are not implemented in Task 2; use --dry-run', 'unsupported');
  const result = validateManifest(root);
  const requestedPlugin = flags.get('plugin');
  if (typeof requestedPlugin !== 'string' || !requestedPlugin) fail('sync requires --plugin <id|all>', 'usage');
  const selected = requestedPlugin === 'all'
    ? result.entries
    : result.entries.filter((entry) => entry.id === requestedPlugin);
  if (selected.length === 0) fail(`sync plugin is not in manifest: ${requestedPlugin}`, 'usage');
  const mode = flags.get('mode');
  if (mode !== undefined && mode !== 'latest' && mode !== 'exact') fail(`unsupported sync mode: ${mode}`, 'usage');
  const version = flags.get('version');
  if (version !== undefined && (typeof version !== 'string' || version.length === 0)) {
    fail('--version must be an exact version string', 'usage');
  }
  if (mode === 'exact' && !version && selected.some((entry) => (
    entry.request.mode !== 'exact' || (!entry.request.version && !entry.request.commit)
  ))) {
    fail('exact sync requires --version or an exact manifest version/commit', 'usage');
  }
  const candidates = selected.map((entry) => ({
    id: entry.id,
    mode: version ? 'exact' : (mode || entry.request.mode),
    requested: version || (mode === 'exact' ? entry.request.version || entry.request.commit : entry.request.mode),
    currentVersion: readJson(path.join(root, entry.path, 'package.json'), `${entry.id} package.json`).version,
    source: entry.source,
    action: 'candidate-only',
    wouldWrite: false,
  }));
  console.log(JSON.stringify({ dryRun: true, networkAccessed: false, candidates }, null, 2));
}

export async function main(argv = process.argv.slice(2)) {
  const { flags, positionals } = parseArgs(argv);
  const command = positionals[0];
  const root = path.resolve(String(flags.get('root') || DEFAULT_ROOT));
  if (!command) fail('a command is required: validate-manifest, validate, generate-registry, generate-lock, sync', 'usage');
  if (command === 'validate-manifest') {
    printManifestReport(validateManifest(root));
    return 0;
  }
  if (command === 'validate') {
    if (!flags.get('locked')) fail('validate currently requires --locked', 'usage');
    const result = validateLocked(root);
    console.log(`lock valid: entries=${result.counts.entries}`);
    return 0;
  }
  if (command === 'generate-registry') {
    const result = generateRegistry(root, { check: Boolean(flags.get('check')) });
    console.log(`${result.checked ? 'generated registry valid' : 'generated registry written'}: ${relativePosix(root, result.file)}`);
    return 0;
  }
  if (command === 'generate-lock') {
    const project = loadProject(root);
    const lock = buildLock(root);
    writeJsonAtomic(project.paths.lock, lock);
    console.log(`lock written: ${relativePosix(root, project.paths.lock)} entries=${Object.keys(lock.plugins).length}`);
    return 0;
  }
  if (command === 'sync') {
    runSync(root, flags);
    return 0;
  }
  fail(`unknown command: ${command}`, 'usage');
}

const isMain = path.resolve(process.argv[1] || '') === path.resolve(SCRIPT_FILE);
if (isMain) {
  try {
    const status = await main();
    process.exitCode = status;
  } catch (error) {
    const code = error?.code === 'usage' ? 2 : error?.code === 'unsupported' ? 2 : 1;
    console.error(`plugin-sync: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = code;
  }
}
