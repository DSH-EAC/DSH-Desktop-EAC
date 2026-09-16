import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyPluginPackage } from '../lib/desktop/companion-sync.js';

const ROOT = join(import.meta.dirname, '..');
const PLUGIN = join(ROOT, 'assets', 'plugins', 'dsh-composer-dynamic-island');

function text(...parts: string[]): string {
  return readFileSync(join(...parts), 'utf8');
}

function json(...parts: string[]): Record<string, any> {
  return JSON.parse(text(...parts));
}

test('composer dynamic island is a registered and recommended EAC companion plugin', () => {
  const registry = text(ROOT, 'lib', 'desktop', 'companion-sync.ts');
  assert.match(
    registry,
    /\{ id: 'composer-dynamic-island', name: 'dsh-composer-dynamic-island', dir: 'dsh-composer-dynamic-island' \}/,
  );

  const distributionRegistry = text(ROOT, 'lib', 'desktop', 'plugin-sync-registry.ts');
  const marker = distributionRegistry.match(/plugin-sync:distribution\s+([^\n]+)/);
  assert.ok(marker);
  const distribution = JSON.parse(marker[1]);
  assert.ok(distribution.recommendedPluginIds.includes('composer-dynamic-island'));
});

test('vendored package exposes the EAC Web loader contract without changing the upstream runtime id', () => {
  const pkg = json(PLUGIN, 'package.json');
  assert.equal(pkg.name, 'dsh-composer-dynamic-island');
  assert.equal(pkg.version, '2.1.0');
  assert.equal(pkg.main, 'lib/types/index.js');
  assert.equal(pkg.exports['./client'], './lib/client.js');
  assert.ok(pkg.files.includes('EAC-ADAPTATION.md'));
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.deepEqual(pkg.dsh.client.inject, [
    'react',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-slots',
  ]);

  const patch = text(PLUGIN, 'cordis.patch.yml');
  assert.match(patch, /id: composer-dynamic-island/);
  assert.match(patch, /name: 'dsh-composer-dynamic-island'/);

  const client = text(PLUGIN, 'lib', 'client.js');
  assert.match(client, /window\.__ModuleLoader__\.load\(\{/);
  assert.match(client, /id: "dsh-composer-dynamic-island"/);
  assert.match(client, /exports\.inject = \["slots"\]/);
  assert.doesNotThrow(() => new Function(client));
});

test('vendored package preserves the audited Community v0.15 boundary and bilingual documentation', () => {
  const manifest = json(PLUGIN, 'dsh-plugin.json');
  assert.equal(manifest.manifestVersion, '0.15');
  assert.equal(manifest.id, 'io.github.says693.composer-dynamic-island');
  assert.deepEqual(manifest.permissions, []);
  assert.deepEqual(manifest.requires?.contracts, []);
  assert.equal(manifest.facets?.host?.entry, 'lib/types/index.js');

  const english = text(PLUGIN, 'README.md');
  const chinese = text(PLUGIN, 'README.zh-CN.md');
  assert.match(english, /\[简体中文\]\(README\.zh-CN\.md\)/);
  assert.match(chinese, /\[English\]\(README\.md\)/);
  assert.match(english, /solely by \[says693\]/);
  assert.match(chinese, /独立撰写并维护，无其他撰写者/);
  assert.ok(existsSync(join(PLUGIN, 'LICENSE')));
  assert.ok(existsSync(join(PLUGIN, 'docs', 'COMPATIBILITY.md')));
});

test('client adapter remains local-only and limits persistence to its selection key', () => {
  const client = text(PLUGIN, 'lib', 'client.js');
  assert.doesNotMatch(
    client,
    /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|document\.cookie|child_process|node:fs|node:https?/,
  );
  assert.match(client, /const STORE_KEY = "dsh-composer-dynamic-island-config-v1"/);
  assert.match(client, /const INPUT_SLOT_PATTERN = \/\^\(\?:conversation\\\.\)\?/);
  assert.match(client, /const TEXT_ENTRY_SELECTOR =/);
  assert.match(client, /observer\.disconnect\(\)/);
  assert.match(client, /removeEventListener/);
});

test('profile copy includes runtime files and the README.zh-CN translation', () => {
  const temp = mkdtempSync(join(tmpdir(), 'dsh-composer-island-eac-'));
  try {
    copyPluginPackage(temp, PLUGIN, 'dsh-composer-dynamic-island');
    const copied = join(temp, 'node_modules', 'dsh-composer-dynamic-island');
    for (const rel of [
      'package.json',
      'dsh-plugin.json',
      'cordis.patch.yml',
      'lib/client.js',
      'lib/types/index.js',
      'docs/COMPATIBILITY.md',
      'README.md',
      'README.zh-CN.md',
      'EAC-ADAPTATION.md',
      'LICENSE',
    ]) {
      assert.equal(existsSync(join(copied, rel)), true, `profile copy missing ${rel}`);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
