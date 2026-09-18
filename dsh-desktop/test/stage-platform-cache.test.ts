import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canReuseStagedNodeModules,
  writeStagedPlatformStamp,
} from '../../tauri-shell/stage-platform-cache.mjs';

test('staging reuses node_modules only for the stamped target platform and architecture', () => {
  const root = mkdtempSync(join(tmpdir(), 'eac-stage-platform-'));
  const nodeModules = join(root, 'node_modules');
  const stamp = join(root, '.node-modules-platform');
  mkdirSync(nodeModules);
  writeFileSync(join(nodeModules, 'sentinel'), 'ok');
  try {
    assert.equal(canReuseStagedNodeModules(true, 'linux', 'arm64', nodeModules, stamp), false);
    writeStagedPlatformStamp(stamp, 'linux', 'arm64');
    assert.equal(canReuseStagedNodeModules(true, 'linux', 'arm64', nodeModules, stamp), true);
    assert.equal(canReuseStagedNodeModules(true, 'linux', 'x64', nodeModules, stamp), false);
    assert.equal(canReuseStagedNodeModules(true, 'win32', 'arm64', nodeModules, stamp), false);
    assert.equal(canReuseStagedNodeModules(false, 'linux', 'arm64', nodeModules, stamp), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
