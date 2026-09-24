// TDD tests for bundled node_modules integrity verification (issue #7).
//
// Bug: after a botched upgrade the app's bundled node_modules contained
// packages that were empty directory skeletons (no package.json, no entry
// files, no native binaries). Node resolution stops at the skeleton instead
// of falling back up, so dsh web failed with ERR_MODULE_NOT_FOUND in a loop
// and the fallback junction pointed into the same damaged tree.
//
// Fix: after-pack writes a per-package file-count manifest at build time;
// at boot the desktop verifies the installed tree against it and reports
// damage explicitly instead of letting Node emit cryptic module errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundleManifest, verifyBundle } from '../bundle-integrity.js';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** commander(3 files) + @deepseek-ai/dsh(2) + @img/sharp-win32-x64(2 incl. .node) */
function makeTree() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-integrity-'));
  const mk = (rel, files) => {
    mkdirSync(join(root, rel), { recursive: true });
    for (const f of files) {
      mkdirSync(dirname(join(root, rel, f)), { recursive: true });
      writeFileSync(join(root, rel, f), 'x');
    }
  };
  mk('commander', ['package.json', 'index.js', 'lib/program.js']);
  mk('@deepseek-ai/dsh', ['package.json', 'lib/bin.js']);
  mk('@img/sharp-win32-x64', ['package.json', 'lib/sharp.node']);
  mk('.bin', ['dsh']);
  return root;
}

test('buildBundleManifest records per-package file counts for scoped and unscoped packages', () => {
  const root = makeTree();
  try {
    const m = buildBundleManifest(root);
    assert.equal(m.packages['commander'].files, 3);
    assert.equal(m.packages['@deepseek-ai/dsh'].files, 2);
    assert.equal(m.packages['@img/sharp-win32-x64'].files, 2);
    assert.equal(m.packages['.bin'], undefined);
    assert.equal(m.version, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifyBundle passes on an untouched healthy tree', () => {
  const root = makeTree();
  try {
    const m = buildBundleManifest(root);
    const r = verifyBundle(root, m);
    assert.equal(r.ok, true);
    assert.deepEqual(r.damaged, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifyBundle detects an empty skeleton (package.json stripped)', () => {
  const root = makeTree();
  try {
    const m = buildBundleManifest(root);
    // simulate issue #7: uninstaller deleted files but left dir skeleton
    unlinkSync(join(root, 'commander', 'package.json'));
    unlinkSync(join(root, 'commander', 'index.js'));
    unlinkSync(join(root, 'commander', 'lib', 'program.js'));
    const r = verifyBundle(root, m);
    assert.equal(r.ok, false);
    assert.ok(r.damaged.some((d) => d.name === 'commander'), 'commander must be flagged, got: ' + JSON.stringify(r.damaged));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifyBundle detects a wholly missing package directory', () => {
  const root = makeTree();
  try {
    const m = buildBundleManifest(root);
    rmSync(join(root, '@img', 'sharp-win32-x64'), { recursive: true, force: true });
    const r = verifyBundle(root, m);
    assert.equal(r.ok, false);
    assert.ok(r.damaged.some((d) => d.name === '@img/sharp-win32-x64'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifyBundle detects lost files (native binary removed) via count drop', () => {
  const root = makeTree();
  try {
    const m = buildBundleManifest(root);
    unlinkSync(join(root, '@img', 'sharp-win32-x64', 'lib', 'sharp.node'));
    const r = verifyBundle(root, m);
    assert.equal(r.ok, false);
    assert.ok(r.damaged.some((d) => d.name === '@img/sharp-win32-x64'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifyBundle tolerates extra files appearing (only losses are damage)', () => {
  const root = makeTree();
  try {
    const m = buildBundleManifest(root);
    writeFileSync(join(root, 'commander', 'extra-debug.log'), 'x');
    const r = verifyBundle(root, m);
    assert.equal(r.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifyBundle skips the check when no manifest is available (legacy install)', () => {
  const root = makeTree();
  try {
    const r = verifyBundle(root, null);
    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('packaged boot verifies bundle integrity before starting the server', () => {
  const server = readFileSync(join(sourceRoot, 'tauri-shell', 'sidecar', 'server.ts'), 'utf8');
  const bootStart = server.slice(server.indexOf("'boot.start':"), server.indexOf("'boot.stop':"));
  assert.match(server, /isPackagedRuntime\(\)[\s\S]*bundle-manifest\.json[\s\S]*verifyBundle/);
  assert.ok(bootStart.indexOf('verifyBundleIntegrity') >= 0, 'boot.start must invoke bundle verification');
  assert.ok(
    bootStart.indexOf('verifyBundleIntegrity') < bootStart.indexOf('guardedStartAndWait'),
    'bundle verification must happen before any server process starts',
  );
});

test('packaged boot rejects damaged bundles with bounded package summaries', () => {
  const server = readFileSync(join(sourceRoot, 'tauri-shell', 'sidecar', 'server.ts'), 'utf8');
  assert.match(server, /bundle integrity/i);
  assert.match(server, /damaged\.slice\(0, 10\)\.map/);
  assert.match(server, /expected/);
  assert.match(server, /actual/);
  assert.doesNotMatch(server, /while\s*\([^)]*verifyBundle/);
});
