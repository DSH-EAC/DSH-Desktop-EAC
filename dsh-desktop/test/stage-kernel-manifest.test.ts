import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  absolutizeKernelFileReferences,
  withAbsolutizedKernelManifests,
} from '../../tauri-shell/stage-kernel-manifest.mjs';

const stageResources = readFileSync(
  new URL('../../tauri-shell/stage-resources.mjs', import.meta.url),
  'utf8',
);

test('staging manifest uses one absolute kernel root for root and transitive overrides', () => {
  const source = JSON.stringify({
    dependencies: {
      '@deepseek-ai/dsh': 'file:vendor/kernel/0.1.2/deepseek-ai-dsh.tgz',
    },
    overrides: {
      '@deepseek-ai/schemastery': 'file:vendor/kernel/0.1.2/deepseek-ai-schemastery.tgz',
    },
    untouched: 'file:vendor/npm',
  });
  const kernel = path.join('H:\\build root', 'staged-resources', 'vendor', 'kernel');
  const absoluteKernel = path.resolve(kernel).replaceAll('\\', '/');

  const result = absolutizeKernelFileReferences(source, kernel);

  assert.match(result, new RegExp(`file:${escapeRegex(absoluteKernel)}/0\\.1\\.2/deepseek-ai-dsh\\.tgz`));
  assert.match(result, new RegExp(`file:${escapeRegex(absoluteKernel)}/0\\.1\\.2/deepseek-ai-schemastery\\.tgz`));
  assert.match(result, /file:vendor\/npm/);
  assert.doesNotMatch(result, /file:vendor\/kernel\//);
});

test('kernel manifest rewrite is restored after success and failure', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'dsh-kernel-manifest-'));
  try {
    const manifests = [path.join(temp, 'package.json'), path.join(temp, 'package-lock.json')];
    const originals = manifests.map((manifest, index) => JSON.stringify({
      index,
      resolved: 'file:vendor/kernel/0.1.2/example.tgz',
    }) + '\n');
    manifests.forEach((manifest, index) => writeFileSync(manifest, originals[index]));

    withAbsolutizedKernelManifests(manifests, path.join(temp, 'vendor', 'kernel'), () => {
      for (const manifest of manifests) {
        assert.doesNotMatch(readFileSync(manifest, 'utf8'), /file:vendor\/kernel\//);
      }
    });
    manifests.forEach((manifest, index) => assert.equal(readFileSync(manifest, 'utf8'), originals[index]));

    assert.throws(() => withAbsolutizedKernelManifests(
      manifests,
      path.join(temp, 'vendor', 'kernel'),
      () => { throw new Error('expected failure'); },
    ), /expected failure/);
    manifests.forEach((manifest, index) => assert.equal(readFileSync(manifest, 'utf8'), originals[index]));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('staging blocks lifecycle scripts and explicitly reapplies dependency patches', () => {
  assert.match(stageResources, /npm ci --omit=dev --ignore-scripts/);
  assert.match(stageResources, /patch-deps\.js/);
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
