import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { verifyStagedRuntime } from '../scripts/verify-staged-runtime.mjs';
import { followTokenRedirect, requireMethodNotFound } from '../scripts/minimal-boot-smoke.mjs';

function createStageFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-stage-verify-'));
  const sidecar = join(root, 'sidecar');
  const desktop = join(root, 'dsh-desktop');
  mkdirSync(sidecar, { recursive: true });
  mkdirSync(join(desktop, 'lib', 'desktop'), { recursive: true });
  mkdirSync(join(desktop, 'node_modules', 'fixture'), { recursive: true });
  for (const file of ['server.js', 'bridge.js', 'capability-stubs.js']) {
    writeFileSync(join(sidecar, file), 'module.exports = {};\n');
  }
  for (const file of ['bundle-integrity.js', 'session-watcher.js', 'stable-port.js', 'stream-write-guard.js', 'updater.js']) {
    writeFileSync(join(desktop, file), file === 'bundle-integrity.js'
      ? "exports.verifyBundle = () => ({ ok: true, damaged: [] });\n"
      : 'module.exports = {};\n');
  }
  for (const file of ['atomic-json.js']) {
    mkdirSync(join(desktop, 'lib'), { recursive: true });
    writeFileSync(join(desktop, 'lib', file), 'module.exports = {};\n');
  }
  for (const file of ['proc.js', 'platform.js', 'runtime-paths.js', 'profile.js', 'runtime-patches.js', 'boot-server.js']) {
    writeFileSync(join(desktop, 'lib', 'desktop', file), 'module.exports = {};\n');
  }
  writeFileSync(join(desktop, 'bundle-manifest.json'), JSON.stringify({ version: 1, packages: { fixture: { files: 1 } } }));
  return root;
}

test('staged runtime verifier accepts the minimal runtime closure', () => {
  const root = createStageFixture();
  try {
    const result = verifyStagedRuntime(root);
    assert.equal(result.bundle.ok, true);
    assert.equal(result.requiredFiles, 15);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('staged runtime verifier rejects retired recovery artifacts', () => {
  const root = createStageFixture();
  try {
    const retired = join(root, 'dsh-desktop', 'assets', 'recovery-center.html');
    mkdirSync(join(retired, '..'), { recursive: true });
    writeFileSync(retired, 'retired');
    assert.throws(() => verifyStagedRuntime(root), /retired artifact is staged/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('staged runtime verifier rejects retired plugin-copy artifact', () => {
  const root = createStageFixture();
  try {
    const retired = join(root, 'dsh-desktop', 'lib', 'plugin-copy.js');
    writeFileSync(retired, 'retired');
    assert.throws(() => verifyStagedRuntime(root), /retired artifact is staged/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('token redirect helper requires 303 then authenticated 200', async () => {
  const seen: Array<{ url: string; cookie: string }> = [];
  const result = await followTokenRedirect('http://127.0.0.1:1234/?token=secret', async (url, init) => {
    seen.push({ url: String(url), cookie: String(init?.headers?.cookie || '') });
    if (seen.length === 1) {
      return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': 'dsh-auth=ok; Path=/; HttpOnly' } });
    }
    return new Response('ui', { status: 200 });
  });
  assert.deepEqual(result, { redirectStatus: 303, uiStatus: 200 });
  assert.equal(seen[1]?.cookie, 'dsh-auth=ok');
});

test('retired RPC assertion accepts only JSON-RPC method-not-found', () => {
  assert.doesNotThrow(() => requireMethodNotFound('rc.action', { error: { code: -32601, message: 'method not found: rc.action' } }));
  assert.throws(() => requireMethodNotFound('rc.action', { result: { unavailable: true } }), /must return -32601/);
});
