'use strict';

import crypto = require('node:crypto');
import fs = require('node:fs');
import path = require('node:path');
import { writeFileAtomic } from './lib/atomic-json';

const MANAGED_ROUTER_PRESETS = Object.freeze([
  'router-standard',
  'v4-flash-godmode-opencode-go',
]);

const BUGGY_ROUTER_CORE_HASHES = Object.freeze<Record<string, string>>({
  'router-standard': '6f91e7aaa6f43179adff43db86e4648fc89197fab1517c7d74f64dbc29b091a1',
  'v4-flash-godmode-opencode-go': '0d03a662f3f52608ae1fe55baf183fdf1926fcc45b472d8f169de9b3b90388bd',
});

interface MigrationResult {
  status: 'missing' | 'kept' | 'customized' | 'migrated' | 'failed';
  file: string;
  backup?: string;
  error?: string;
}

function normalizedSha256(text: string): string {
  return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

function migrateRouterCoreFile(
  sourceFile: string,
  installedFile: string,
  buggyHash: string,
  log: (message: string) => void = () => {},
): MigrationResult {
  let sourceText: string;
  let installedText: string;
  try {
    sourceText = fs.readFileSync(sourceFile, 'utf8');
    installedText = fs.readFileSync(installedFile, 'utf8');
  } catch {
    return { status: 'missing', file: installedFile };
  }

  if (normalizedSha256(installedText) === normalizedSha256(sourceText)) {
    return { status: 'kept', file: installedFile };
  }
  if (normalizedSha256(installedText) !== buggyHash) {
    return { status: 'customized', file: installedFile };
  }

  const backup = installedFile + '.persona-card-fix.bak';
  try {
    if (!fs.existsSync(backup)) fs.copyFileSync(installedFile, backup);
    writeFileAtomic(installedFile, sourceText);
    return { status: 'migrated', file: installedFile, backup };
  } catch (error) {
    const message = String(((error as Error) && (error as Error).message) || error);
    log(`failed to migrate router persona preset: ${installedFile}: ${message}`);
    return { status: 'failed', file: installedFile, error: message };
  }
}

function migrateManagedRouterPersonaPresets(
  assetsRoot: string,
  presetsRoot: string,
  log: (message: string) => void = () => {},
): MigrationResult[] {
  return MANAGED_ROUTER_PRESETS.map((name) => migrateRouterCoreFile(
    path.join(assetsRoot, name, 'router-core.mjs'),
    path.join(presetsRoot, name, 'router-core.mjs'),
    BUGGY_ROUTER_CORE_HASHES[name]!,
    log,
  ));
}

export = {
  BUGGY_ROUTER_CORE_HASHES,
  MANAGED_ROUTER_PRESETS,
  migrateManagedRouterPersonaPresets,
  migrateRouterCoreFile,
  normalizedSha256,
};
