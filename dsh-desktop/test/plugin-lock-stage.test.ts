import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  copyPluginLock,
  pluginLockManifest,
  validatePluginLock,
} from '../../tauri-shell/plugin-lock-stage.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const stage = readFileSync(path.join(root, 'tauri-shell', 'stage-resources.mjs'), 'utf8');
const lockStage = readFileSync(path.join(root, 'tauri-shell', 'plugin-lock-stage.mjs'), 'utf8');

function readWorkflow(name: string): string {
  return readFileSync(path.join(root, '.github', 'workflows', name), 'utf8');
}

test('stage validates the locked plugin tree before cleanup and copies the exact lock', () => {
  const validateAt = stage.indexOf('validatePluginLock(root');
  const cleanupAt = stage.indexOf("rmSync(path.join(staged, 'sidecar')");
  const copyAt = stage.indexOf('copyPluginLock(pluginLock');
  assert.ok(validateAt >= 0, 'stage must run the offline lock validator');
  assert.ok(cleanupAt > validateAt, 'lock validation must precede staging cleanup');
  assert.ok(copyAt > cleanupAt, 'lock copy must happen after the staging directory exists');
  assert.match(lockStage, /plugin-lock\.json/);
  assert.match(stage, /pluginLockManifest\(pluginLock/);
});

test('CI and all release platforms validate the same checked-in lock before dependency installation', () => {
  const workflows = [
    ['ci.yml', /npm run ci:install|npm install(?: -g| --global) pnpm/],
    ['release-tauri.yml', /npm run ci:install|npm install(?: -g| --global) pnpm/],
    ['release-macos.yml', /npm run ci:install|npm install(?: -g| --global) pnpm/],
  ] as const;
  for (const [name, dependencyInstall] of workflows) {
    const source = readWorkflow(name);
    const validateAt = source.indexOf('plugin-sync.mjs validate --locked');
    const dependencyAt = source.search(dependencyInstall);
    assert.ok(validateAt >= 0, `${name} must validate the lock`);
    assert.ok(dependencyAt > validateAt, `${name} must validate before dependency installation`);
  }
});

test('staging has no network resolver or rolling latest lookup', () => {
  assert.doesNotMatch(stage, /\b(?:npm\s+(?:view|outdated)|fetch\s*\(|https?:\/\/|latest)\b/i);
});

test('staging invokes the checked-in TypeScript compiler without an npx fallback', () => {
  assert.doesNotMatch(stage, /\bnpx(?:\s+--no-install)?\s+tsc\b/);
  assert.match(stage, /path\.join\(dd, 'node_modules', 'typescript', 'bin', 'tsc'\)/);
});

test('staged lock metadata is traceable and its digest covers the copied bytes', () => {
  const metadata = validatePluginLock(root, { buildCommit: 'abc1234' });
  assert.equal(metadata.applicationVersion, JSON.parse(readFileSync(path.join(root, 'dsh-desktop', 'package.json'), 'utf8')).version);
  assert.equal(metadata.buildCommit, 'abc1234');
  assert.match(metadata.sha256, /^[a-f0-9]{64}$/);

  const temp = mkdtempSync(path.join(os.tmpdir(), 'dsh-plugin-lock-stage-'));
  try {
    const stagedDesktop = path.join(temp, 'dsh-desktop');
    const stagedPath = copyPluginLock(metadata, stagedDesktop);
    assert.equal(existsSync(stagedPath), true);
    assert.deepEqual(readFileSync(stagedPath), metadata.bytes);
    assert.deepEqual(pluginLockManifest(metadata), {
      path: 'dsh-desktop/plugin-lock.json',
      sha256: metadata.sha256,
      applicationVersion: metadata.applicationVersion,
      buildCommit: 'abc1234',
    });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
