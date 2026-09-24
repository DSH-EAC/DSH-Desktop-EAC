import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateDistribution } from '../../dsh-desktop/scripts/plugin-sync.mjs';

const repoRoot = new URL('../../', import.meta.url).pathname;
const completeRemovalEvidence = {
  artifactComplete: true,
  lifecycleVerified: true,
  singleKernelVerified: true,
  installRecoveryReady: true,
  userConfigMigrationVerified: true,
  platformMatrixVerified: true,
};

function fixture(plugins, inventory, expectedCounts, sources = [], history = inventory) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-distribution-qa-'));
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
  writeFileSync(
    join(root, '.sync', 'plugin-inventory-history.json'),
    JSON.stringify({
      schemaVersion: 1,
      plugins: history.map((entry) => ({ id: entry.id, path: entry.path, patched: false })),
    }),
  );
  writeFileSync(
    join(root, 'dsh-desktop', 'assets', 'SOURCES.json'),
    JSON.stringify({ components: sources }),
  );
  return {
    root,
    project: {
      paths: { root },
      policies: {
        pluginDistribution: {
          enabled: true,
          expectedCounts,
          inventoryHistory: '.sync/plugin-inventory-history.json',
        },
      },
    },
    inventory,
  };
}

function run(name, testFixture) {
  try {
    const errors = validateDistribution(testFixture.project, testFixture.inventory);
    console.log(JSON.stringify({ name, errors }));
  } finally {
    rmSync(testFixture.root, { recursive: true, force: true });
  }
}

run('mutable npm range rejected at source-ready', fixture(
  [{
    id: 'demo',
    distributionClass: 'external',
    delivery: 'market',
    sourceRef: 'npm:demo-plugin',
    version: '^1.2.3',
    integrity: { sha256: 'a'.repeat(64) },
    migration: { current: 'bundled', target: 'market', state: 'source-ready' },
  }],
  [{ id: 'demo', kind: 'plugin', path: 'dsh-desktop/assets/plugins/demo-plugin' }],
  { builtin: 0, recommended: 0, external: 1 },
  [{ type: 'plugin', path: 'dsh-desktop/assets/plugins/demo-plugin', origin: 'internal', audit: {} }],
));

run('migrated plugin accepted after inventory removal', fixture(
  [{
    id: 'demo',
    distributionClass: 'external',
    delivery: 'market',
    sourceRef: 'npm:demo-plugin',
    version: '1.2.3',
    integrity: { sha256: 'a'.repeat(64) },
    patchConclusion: 'not-patched',
    removalEvidence: completeRemovalEvidence,
    migration: { current: 'market', target: 'market', state: 'migrated' },
  }],
  [],
  { builtin: 0, recommended: 0, external: 1 },
  [{ type: 'plugin', path: 'dsh-desktop/assets/plugins/demo-plugin', origin: 'internal', audit: {} }],
  [{ id: 'demo', path: 'dsh-desktop/assets/plugins/demo-plugin' }],
));
