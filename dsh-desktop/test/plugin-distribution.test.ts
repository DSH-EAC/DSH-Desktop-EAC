import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(desktopRoot, '..');
const script = join(desktopRoot, 'scripts', 'plugin-sync.mjs');
const sync = await import(pathToFileURL(script).href);

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8'));
}

const expected = {
  builtin: [
    'balance',
    'client-file-changes',
    'compact',
    'eac-core-bridge',
    'eac-locale-compat',
    'easy-setup',
    'file-changes',
    'file-drop-eac',
    'plugin-manager',
    'plugin-shield',
    'plugin-wizard',
    'settings-scroll-fix',
    'skin-switch',
    'terminal',
    'unified-market',
    'viewport-lock',
  ],
  recommended: [
    'better-sidebar',
    'change-review',
    'composer-dynamic-island',
    'conversation-tweaks',
    'dock-settings',
    'dsh-navbar',
    'dsh-raw-html',
    'dsh-session-manager',
    'message-rewind',
    'mobile-fix',
    'offpeak',
    'picturereader',
    'prompt-custom',
    'soul-md',
  ],
  external: [
    'agent-teams',
    'computer-user',
    'dsh-dafeiyu',
    'dsh-feature-toggles',
    'dsh-pet',
    'dsh-pet-settings',
    'dsh-phone',
    'dsh-stt',
    'dsh-undo',
    'dsh-webui-prompt-optimizer',
    'dsh-whale-widget',
    'float-window',
    'font-custom',
    'image-paste',
    'meow-smooth',
    'openclaw-bridge',
    'settings-groups',
    'side-session',
    'think-zh-expand-eac',
  ],
} as const;

function idsFor(distribution: any, distributionClass: keyof typeof expected) {
  return distribution.plugins
    .filter((entry: any) => entry.distributionClass === distributionClass)
    .map((entry: any) => entry.id)
    .sort();
}

function validationFixture(
  plugins: any[],
  expectedCounts: Record<string, number>,
  options: {
    inventory?: any[];
    history?: any[];
    sources?: any[];
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-distribution-test-'));
  mkdirSync(join(root, '.sync'), { recursive: true });
  mkdirSync(join(root, 'dsh-desktop', 'assets'), { recursive: true });
  copyFileSync(
    join(repoRoot, '.sync', 'plugin-distribution.schema.json'),
    join(root, '.sync', 'plugin-distribution.schema.json'),
  );
  writeFileSync(
    join(root, '.sync', 'plugin-distribution.json'),
    JSON.stringify({ schemaVersion: 1, plugins }),
  );
  const inventory = options.inventory ?? [{
    id: 'demo',
    kind: 'plugin',
    path: 'dsh-desktop/assets/plugins/demo-plugin',
  }];
  const history = options.history ?? [{
    id: 'demo',
    path: 'dsh-desktop/assets/plugins/demo-plugin',
    patched: false,
  }];
  writeFileSync(
    join(root, '.sync', 'plugin-inventory-history.json'),
    JSON.stringify({ schemaVersion: 1, plugins: history }),
  );
  writeFileSync(
    join(root, 'dsh-desktop', 'assets', 'SOURCES.json'),
    JSON.stringify({
      components: options.sources ?? [{
        type: 'plugin',
        path: 'dsh-desktop/assets/plugins/demo-plugin',
        origin: 'internal',
        audit: {},
      }],
    }),
  );
  const project = {
    paths: { root },
    policies: {
      pluginDistribution: {
        enabled: true,
        expectedCounts,
        inventoryHistory: '.sync/plugin-inventory-history.json',
      },
    },
  };
  return { root, project, inventory };
}

function immutableExternal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'demo',
    distributionClass: 'external',
    delivery: 'market',
    sourceRef: 'npm:demo-plugin',
    version: '1.2.3',
    integrity: { sha256: 'a'.repeat(64) },
    migration: { current: 'bundled', target: 'market', state: 'removal-ready' },
    ...overrides,
  };
}

const completeRemovalEvidence = {
  artifactComplete: true,
  lifecycleVerified: true,
  singleKernelVerified: true,
  installRecoveryReady: true,
  userConfigMigrationVerified: true,
  platformMatrixVerified: true,
};

test('validate-manifest includes distribution validation', () => {
  const result = spawnSync(process.execPath, [script, 'validate-manifest'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /manifest valid: plugins=49/);
});

test('distribution ledger partitions the 49 inventory plugins as 16/14/19', () => {
  const distribution = readJson('.sync/plugin-distribution.json');
  const inventory = readJson('.sync/plugins.json');
  const entries = distribution.plugins;
  const ids = entries.map((entry: any) => entry.id);
  const inventoryIds = inventory.plugins.map((entry: any) => entry.id).sort();

  assert.equal(entries.length, 49);
  assert.equal(new Set(ids).size, 49, 'distribution ids must be unique');
  assert.deepEqual([...ids].sort(), inventoryIds, 'distribution must cover the plugin inventory exactly');
  assert.deepEqual(idsFor(distribution, 'builtin'), [...expected.builtin].sort());
  assert.deepEqual(idsFor(distribution, 'recommended'), [...expected.recommended].sort());
  assert.deepEqual(idsFor(distribution, 'external'), [...expected.external].sort());
});

test('distribution classes use conservative delivery and migration states', () => {
  const distribution = readJson('.sync/plugin-distribution.json');

  for (const entry of distribution.plugins) {
    assert.equal(entry.migration.current, 'bundled', `${entry.id} current delivery`);
    if (entry.distributionClass === 'builtin') {
      assert.equal(entry.delivery, 'bundled', entry.id);
      assert.equal(entry.migration.target, 'bundled', entry.id);
      assert.equal(entry.migration.state, 'migrated', entry.id);
      assert.equal(entry.pack, undefined, entry.id);
      assert.equal(entry.sourceRef, undefined, entry.id);
      continue;
    }

    assert.equal(entry.migration.state, 'source-pending', entry.id);
    assert.equal(entry.sourceRef, undefined, `${entry.id} must not guess a source ref`);
    assert.equal(entry.version, undefined, `${entry.id} must not guess a version`);
    assert.equal(entry.integrity, undefined, `${entry.id} must not guess integrity`);
    if (entry.distributionClass === 'recommended') {
      assert.equal(entry.delivery, 'pack', entry.id);
      assert.equal(entry.pack, 'dev.dsh-eac.desktop-recommended', entry.id);
      assert.equal(entry.migration.target, 'pack', entry.id);
    } else {
      assert.equal(entry.distributionClass, 'external', entry.id);
      assert.equal(entry.delivery, 'market', entry.id);
      assert.equal(entry.pack, undefined, entry.id);
      assert.equal(
        entry.migration.target,
        entry.id === 'dsh-feature-toggles' ? 'retired' : 'market',
        entry.id,
      );
    }
  }
});

test('distribution ids retain inventory and source-ledger evidence', () => {
  const distribution = readJson('.sync/plugin-distribution.json');
  const inventory = readJson('.sync/plugins.json');
  const sources = readJson('dsh-desktop/assets/SOURCES.json');
  const inventoryById = new Map(inventory.plugins.map((entry: any) => [entry.id, entry]));
  const sourcePaths = new Set(
    sources.components
      .filter((component: any) => component.type === 'plugin')
      .map((component: any) => component.path),
  );

  for (const entry of distribution.plugins) {
    const inventoryEntry: any = inventoryById.get(entry.id);
    assert.ok(inventoryEntry, `${entry.id} must remain in the current inventory baseline`);
    assert.ok(sourcePaths.has(inventoryEntry.path), `${entry.id} must resolve through SOURCES.json`);
  }
});

test('source-ready entries require immutable source evidence', () => {
  const entry = {
    id: 'demo',
    distributionClass: 'external',
    delivery: 'market',
    migration: { current: 'bundled', target: 'market', state: 'source-ready' },
  };
  const t = validationFixture([entry], { builtin: 0, recommended: 0, external: 1 });
  try {
    const errors = sync.validateDistribution(t.project, t.inventory);
    assert.match(errors.join('\n'), /missing required property sourceRef/);
    assert.match(errors.join('\n'), /missing required property version/);
    assert.match(errors.join('\n'), /missing required property integrity/);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test('source-ready npm entries reject mutable version ranges', () => {
  const t = validationFixture(
    [immutableExternal({
      version: '^1.2.3',
      migration: { current: 'bundled', target: 'market', state: 'source-ready' },
    })],
    { builtin: 0, recommended: 0, external: 1 },
  );
  try {
    const errors = sync.validateDistribution(t.project, t.inventory);
    assert.match(errors.join('\n'), /npm source requires an exact semver version/);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test('removal-ready entries require patch conclusion and all removal evidence', () => {
  const t = validationFixture(
    [immutableExternal()],
    { builtin: 0, recommended: 0, external: 1 },
  );
  try {
    const errors = sync.validateDistribution(t.project, t.inventory);
    assert.match(errors.join('\n'), /missing required property patchConclusion/);
    assert.match(errors.join('\n'), /missing required property removalEvidence/);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test('removal-ready npm entries reject mutable version ranges', () => {
  const t = validationFixture(
    [immutableExternal({
      version: '^1.2.3',
      patchConclusion: 'not-patched',
      removalEvidence: completeRemovalEvidence,
    })],
    { builtin: 0, recommended: 0, external: 1 },
  );
  try {
    const errors = sync.validateDistribution(t.project, t.inventory);
    assert.match(errors.join('\n'), /npm source requires an exact semver version/);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test('migrated entries may leave current inventory with historical source evidence', () => {
  const t = validationFixture(
    [immutableExternal({
      patchConclusion: 'not-patched',
      removalEvidence: completeRemovalEvidence,
      migration: { current: 'market', target: 'market', state: 'migrated' },
    })],
    { builtin: 0, recommended: 0, external: 1 },
    { inventory: [] },
  );
  try {
    assert.deepEqual(sync.validateDistribution(t.project, t.inventory), []);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test('non-migrated entries may not leave current inventory', () => {
  const t = validationFixture(
    [immutableExternal({
      migration: { current: 'market', target: 'market', state: 'source-ready' },
    })],
    { builtin: 0, recommended: 0, external: 1 },
    { inventory: [] },
  );
  try {
    const errors = sync.validateDistribution(t.project, t.inventory);
    assert.match(errors.join('\n'), /id is not present in the current plugin inventory/);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test('off-inventory migrated entries require known historical ids and SOURCES evidence', () => {
  const entry = immutableExternal({
    patchConclusion: 'not-patched',
    removalEvidence: completeRemovalEvidence,
    migration: { current: 'market', target: 'market', state: 'migrated' },
  });
  const unknown = validationFixture(
    [entry],
    { builtin: 0, recommended: 0, external: 1 },
    { inventory: [], history: [] },
  );
  const missingSource = validationFixture(
    [entry],
    { builtin: 0, recommended: 0, external: 1 },
    { inventory: [], sources: [] },
  );
  try {
    assert.match(
      sync.validateDistribution(unknown.project, unknown.inventory).join('\n'),
      /id is not present in plugin inventory history/,
    );
    assert.match(
      sync.validateDistribution(missingSource.project, missingSource.inventory).join('\n'),
      /historical inventory path must resolve to exactly one plugin in SOURCES.json/,
    );
  } finally {
    rmSync(unknown.root, { recursive: true, force: true });
    rmSync(missingSource.root, { recursive: true, force: true });
  }
});

test('plugin inventory history rejects duplicate and unknown ids', () => {
  const t = validationFixture(
    [immutableExternal({
      patchConclusion: 'not-patched',
      removalEvidence: completeRemovalEvidence,
    })],
    { builtin: 0, recommended: 0, external: 1 },
    {
      history: [
        { id: 'demo', path: 'dsh-desktop/assets/plugins/demo-plugin', patched: false },
        { id: 'demo', path: 'dsh-desktop/assets/plugins/demo-plugin', patched: false },
        { id: 'unknown', path: 'dsh-desktop/assets/plugins/unknown', patched: false },
      ],
    },
  );
  try {
    const errors = sync.validateDistribution(t.project, t.inventory).join('\n');
    assert.match(errors, /plugin inventory history entry demo: duplicate id/);
    assert.match(errors, /inventory history id unknown is unknown/);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test('plugin inventory history validates its version and entry collection', () => {
  const t = validationFixture(
    [immutableExternal({
      patchConclusion: 'not-patched',
      removalEvidence: completeRemovalEvidence,
    })],
    { builtin: 0, recommended: 0, external: 1 },
  );
  writeFileSync(
    join(t.root, '.sync', 'plugin-inventory-history.json'),
    JSON.stringify({ schemaVersion: 2, plugins: {} }),
  );
  try {
    const errors = sync.validateDistribution(t.project, t.inventory).join('\n');
    assert.match(errors, /plugin inventory history: schemaVersion must be 1/);
    assert.match(errors, /plugin inventory history: plugins must be an array/);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test('patched assets reject a not-patched removal conclusion', () => {
  const t = validationFixture(
    [immutableExternal({
      patchConclusion: 'not-patched',
      removalEvidence: completeRemovalEvidence,
    })],
    { builtin: 0, recommended: 0, external: 1 },
    {
      history: [{
        id: 'demo',
        path: 'dsh-desktop/assets/plugins/demo-plugin',
        patched: true,
      }],
    },
  );
  try {
    const errors = sync.validateDistribution(t.project, t.inventory);
    assert.match(errors.join('\n'), /patched asset requires upstream-absorbed or eac-fork-published/);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});

test('recommended pack draft names all 14 intended members but contains no unready refs', () => {
  const distribution = readJson('.sync/plugin-distribution.json');
  const pack = readJson('.sync/packs/desktop-recommended.pack.json');

  assert.equal(pack.formatVersion, 1);
  assert.equal(pack.id, 'dev.dsh-eac.desktop-recommended');
  assert.equal(pack['x-eac'].status, 'draft');
  assert.deepEqual([...pack['x-eac'].intendedPluginIds].sort(), [...expected.recommended].sort());
  assert.deepEqual(
    pack.plugins,
    distribution.plugins
      .filter((entry: any) => entry.distributionClass === 'recommended' && entry.migration.state !== 'source-pending')
      .map((entry: any) => sync.packPluginFromDistribution(entry)),
  );
  assert.ok(pack.plugins.every((entry: any) => !entry.ref.startsWith('builtin:')));
  assert.ok(pack.plugins.every((entry: any) => entry.ref !== 'latest' && entry.version !== 'latest'));
});

test('immutable distribution refs map to existing pack ref and version fields', () => {
  assert.deepEqual(
    sync.packPluginFromDistribution({ sourceRef: 'npm:@dsh-eac/demo', version: '1.2.3' }),
    { ref: '@dsh-eac/demo', version: '1.2.3' },
  );
  assert.deepEqual(
    sync.packPluginFromDistribution({
      sourceRef: `github:dsh-eac/demo@${'a'.repeat(40)}`,
      version: '1.2.3-eac.1',
    }),
    { ref: 'github:dsh-eac/demo', version: 'a'.repeat(40) },
  );
});

test('recommended pack cannot be published until all 14 members are source-ready', () => {
  const distribution = readJson('.sync/plugin-distribution.json');
  const snapshot = readJson('dsh-desktop/assets/plugins/dsh-unified-market/data/packs-snapshot.json');
  const errors = sync.validateRecommendedPack(
    { paths: { root: repoRoot } },
    distribution.plugins,
    { forPublish: true },
  );
  assert.match(errors.join('\n'), /publish blocked: 0\/14 recommended plugins are source-ready/);
  assert.equal(snapshot.packs.some((entry: any) => entry.id === 'dev.dsh-eac.desktop-recommended'), false);
});

test('migration report covers every non-builtin plugin and its current pending state', () => {
  const distribution = readJson('.sync/plugin-distribution.json');
  const report = readFileSync(join(repoRoot, 'docs', 'PLUGIN-DISTRIBUTION-MIGRATION.md'), 'utf8');
  const nonBuiltin = distribution.plugins.filter((entry: any) => entry.distributionClass !== 'builtin');

  assert.equal(nonBuiltin.length, 33);
  for (const entry of nonBuiltin) {
    const rowPrefix = `| \`${entry.id}\` |`;
    const row = report.split('\n').find((line) => line.startsWith(rowPrefix));
    assert.ok(row, `${entry.id} report row`);
    assert.ok(row.includes(`| \`${entry.migration.state}\` |`), `${entry.id} migration state`);
  }
});

test('distribution validation rejects duplicate ids', () => {
  const entry = {
    id: 'demo',
    distributionClass: 'builtin',
    delivery: 'bundled',
    migration: { current: 'bundled', target: 'bundled', state: 'migrated' },
  };
  const t = validationFixture([entry, entry], { builtin: 2, recommended: 0, external: 0 });
  try {
    const errors = sync.validateDistribution(t.project, t.inventory);
    assert.match(errors.join('\n'), /duplicate id/);
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});
