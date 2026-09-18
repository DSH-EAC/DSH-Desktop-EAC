import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));

test('production dependency advisories are pinned to fixed glob and qs releases', () => {
  assert.equal(manifest.overrides.glob, '10.5.0');
  assert.equal(manifest.overrides.qs, '6.16.0');
  assert.equal(lock.packages['node_modules/glob']?.version, '10.5.0');
  assert.equal(lock.packages['node_modules/qs']?.version, '6.16.0');
});

test('kernel override regeneration preserves application security overrides', () => {
  const generator = readFileSync(join(ROOT, 'scripts', 'gen-kernel-overrides.ts'), 'utf8');
  assert.match(generator, /const nonKernelOverrides = Object\.entries\(manifest\.overrides \?\? \{\}\)/);
  assert.match(generator, /!name\.startsWith\('@deepseek-ai\/'\)/);
  assert.match(generator, /\.\.\.nonKernelOverrides, \.\.\.specByName\.entries\(\)/);
  assert.match(generator, /\^\\d\+\\\.\\d\+\\\.\\d\+\(\?:-\[0-9A-Za-z\.\]\+\)\?\$/,
    'vendor/kernel/.build and other work directories must not be treated as versions');
});
