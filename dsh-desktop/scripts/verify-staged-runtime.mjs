#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REQUIRED_FILES = [
  'sidecar/server.js',
  'sidecar/bridge.js',
  'sidecar/capability-stubs.js',
  'dsh-desktop/session-watcher.js',
  'dsh-desktop/bundle-integrity.js',
  'dsh-desktop/stable-port.js',
  'dsh-desktop/stream-write-guard.js',
  'dsh-desktop/updater.js',
  'dsh-desktop/lib/atomic-json.js',
  'dsh-desktop/lib/desktop/proc.js',
  'dsh-desktop/lib/desktop/platform.js',
  'dsh-desktop/lib/desktop/runtime-paths.js',
  'dsh-desktop/lib/desktop/profile.js',
  'dsh-desktop/lib/desktop/runtime-patches.js',
  'dsh-desktop/lib/desktop/boot-server.js',
];

const RETIRED_PATHS = [
  'sidecar/phone-bridge.js',
  'sidecar/rescue-integration.js',
  'dsh-desktop/assets/recovery-center.html',
  'dsh-desktop/assets/recovery-center-preload.js',
  'dsh-desktop/lib/recovery-center',
  'dsh-desktop/lib/state.js',
  'dsh-desktop/lib/log.js',
  'dsh-desktop/lib/desktop/file-roots.js',
  'dsh-desktop/logger.js',
  'dsh-desktop/lib/plugin-copy.js',
  'dsh-desktop/shared/protocol.js',
];

function requireRegularFile(root, relative) {
  const file = path.join(root, relative);
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(`required staged file is missing: ${relative}`);
  }
}

export function verifyStagedRuntime(stageRoot) {
  const root = path.resolve(stageRoot);
  for (const relative of REQUIRED_FILES) requireRegularFile(root, relative);
  for (const relative of RETIRED_PATHS) {
    if (existsSync(path.join(root, relative))) {
      throw new Error(`retired artifact is staged: ${relative}`);
    }
  }

  const desktop = path.join(root, 'dsh-desktop');
  const manifestFile = path.join(desktop, 'bundle-manifest.json');
  requireRegularFile(root, 'dsh-desktop/bundle-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  if (manifest?.version !== 1 || !manifest.packages || typeof manifest.packages !== 'object') {
    throw new Error('bundle-manifest.json has an invalid schema');
  }

  const require = createRequire(import.meta.url);
  const { verifyBundle } = require(path.join(desktop, 'bundle-integrity.js'));
  const bundle = verifyBundle(path.join(desktop, 'node_modules'), manifest);
  if (!bundle?.ok) {
    throw new Error(`staged bundle integrity failed: ${JSON.stringify(bundle?.damaged || [])}`);
  }

  return {
    requiredFiles: REQUIRED_FILES.length,
    retiredPaths: RETIRED_PATHS.length,
    bundle,
    manifestPackages: Object.keys(manifest.packages).length,
  };
}

function main() {
  const stageRoot = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tauri-shell', 'staged-resources');
  const result = verifyStagedRuntime(stageRoot);
  console.log(`[stage-verify] PASS required=${result.requiredFiles} retired=${result.retiredPaths} packages=${result.manifestPackages}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error('[stage-verify] FAIL:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
