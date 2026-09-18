import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shellSkinRoot = join(repoRoot, 'dsh-desktop', 'assets', 'shell-skin');
const packNames = ['eac-default', 'aio'] as const;
const productionConsumers = [
  'tauri-shell/src/main.rs',
  'tauri-shell/src/exit-overlay.js',
];

interface SkinManifest {
  id: string;
  type: string;
  kind: string;
  version: string;
  compatibility: { profile: string; forceable: boolean };
  owner: string;
  control: string;
  style: string;
  dependencies: Record<string, string>;
  consumers: string[];
  assets: string[];
}

function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function readPackFile(packName: string, file: string): string {
  return readFileSync(join(shellSkinRoot, packName, file), 'utf8');
}

function manifestFor(packName: string): SkinManifest {
  return JSON.parse(readPackFile(packName, 'skin.json')) as SkinManifest;
}

function tokenDefinitions(source: string): Set<string> {
  return new Set(Array.from(source.matchAll(/(--eac-shell-[\w-]+)\s*:/g), (match) => match[1]!));
}

function tokenConsumers(source: string): { name: string; hasFallback: boolean }[] {
  const consumers: { name: string; hasFallback: boolean }[] = [];
  const tokenStart = /var\(\s*(--eac-shell-[\w-]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenStart.exec(source)) !== null) {
    let depth = 1;
    let cursor = tokenStart.lastIndex;
    let hasTopLevelComma = false;
    let fallbackHasContent = false;

    while (cursor < source.length && depth > 0) {
      const char = source[cursor]!;
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (depth === 1 && char === ',') {
        hasTopLevelComma = true;
      } else if (hasTopLevelComma && depth > 0 && !/\s/.test(char)) {
        fallbackHasContent = true;
      }
      cursor += 1;
    }

    consumers.push({
      name: match[1]!,
      hasFallback: hasTopLevelComma && fallbackHasContent,
    });
    tokenStart.lastIndex = cursor;
  }

  return consumers;
}

test('both shell-skin packages preserve their identities and shared contract', () => {
  const expectedIds = {
    'eac-default': {
      id: 'system.default',
      control: 'system.shell-controls',
      style: 'system.shell-style',
    },
    aio: {
      id: 'io.github.dsh-eac.skin.aio',
      control: 'io.github.dsh-eac.aio.shell-controls',
      style: 'io.github.dsh-eac.aio.shell-style',
    },
  } as const;

  for (const packName of packNames) {
    for (const file of ['skin.json', 'README.md', 'tokens.css', 'controls.css']) {
      assert.equal(existsSync(join(shellSkinRoot, packName, file)), true, `${packName}/${file} missing`);
    }

    const manifest = manifestFor(packName);
    assert.equal(manifest.id, expectedIds[packName].id);
    assert.equal(manifest.control, expectedIds[packName].control);
    assert.equal(manifest.style, expectedIds[packName].style);
    assert.equal(manifest.type, 'skin');
    assert.equal(manifest.kind, 'shell-skin');
    assert.equal(manifest.compatibility.profile, 'dsh-desktop-eac-ui-skin-profile@^0.3');
    assert.equal(manifest.compatibility.forceable, false);
    assert.equal(manifest.dependencies[manifest.control], manifest.version);
    assert.equal(manifest.dependencies[manifest.style], manifest.version);
    assert.deepEqual(manifest.assets, ['tokens.css', 'controls.css']);
    assert.deepEqual(manifest.consumers, productionConsumers);
  }

  assert.deepEqual(
    tokenDefinitions(readPackFile('aio', 'tokens.css')),
    tokenDefinitions(readPackFile('eac-default', 'tokens.css')),
    'AIO and default packages must implement the same token interface',
  );
});

test('every manifest consumer exists and consumes defined tokens with fallbacks', () => {
  for (const packName of packNames) {
    const definitions = tokenDefinitions(readPackFile(packName, 'tokens.css'));
    for (const consumerPath of manifestFor(packName).consumers) {
      assert.equal(existsSync(join(repoRoot, consumerPath)), true, `${packName} consumer missing: ${consumerPath}`);
      const consumers = tokenConsumers(read(consumerPath));
      assert.ok(consumers.length > 0, `${consumerPath} does not consume shell tokens`);
      assert.deepEqual(
        consumers.filter(({ hasFallback }) => !hasFallback),
        [],
        `${consumerPath} has token consumers without fallbacks`,
      );
      assert.deepEqual(
        consumers.filter(({ name }) => !definitions.has(name)),
        [],
        `${consumerPath} consumes tokens missing from ${packName}`,
      );
    }
  }
});

test('package controls consume only tokens defined by both packages', () => {
  for (const packName of packNames) {
    const definitions = tokenDefinitions(readPackFile(packName, 'tokens.css'));
    const consumers = tokenConsumers(readPackFile(packName, 'controls.css'));
    assert.ok(consumers.length > 0, `${packName}/controls.css must consume shell tokens`);
    assert.deepEqual(consumers.filter(({ hasFallback }) => !hasFallback), []);
    assert.deepEqual(consumers.filter(({ name }) => !definitions.has(name)), []);
  }
});

test('retired pages and their dedicated tokens stay outside shell-skin packages', () => {
  const retiredPageLanguage = /recovery(?:-center)?|onboarding|update|about|恢复中心|安全模式|向导/i;
  const retiredToken = /^--eac-shell-(?:panel-|banner-|risk-|danger-btn-|warn-btn-|safe-mode-)/;

  for (const packName of packNames) {
    const packageText = ['skin.json', 'README.md', 'tokens.css', 'controls.css']
      .map((file) => readPackFile(packName, file))
      .join('\n');
    assert.doesNotMatch(packageText, retiredPageLanguage, `${packName} still documents a retired page`);
    assert.deepEqual(
      [...tokenDefinitions(readPackFile(packName, 'tokens.css'))].filter((name) => retiredToken.test(name)),
      [],
      `${packName} still defines retired page tokens`,
    );
  }
});
