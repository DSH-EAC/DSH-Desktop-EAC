import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { prepareWebView2Loader } from '../../tauri-shell/prepare-webview2-loader.mjs';

test('WebView2 loader preparation selects the requested Windows architecture', () => {
  const root = mkdtempSync(join(tmpdir(), 'webview2-loader-'));
  const registry = join(root, 'registry', 'src', 'index', 'webview2-com-sys-0.38.2');
  const staged = join(root, 'staged-resources');
  mkdirSync(join(registry, 'x64'), { recursive: true });
  mkdirSync(join(registry, 'arm64'), { recursive: true });
  writeFileSync(join(registry, 'x64', 'WebView2Loader.dll'), 'x64');
  writeFileSync(join(registry, 'arm64', 'WebView2Loader.dll'), 'arm64');

  try {
    const copied = prepareWebView2Loader({ cargoHome: root, arch: 'arm64', staged });
    assert.equal(copied, join(staged, 'WebView2Loader.dll'));
    assert.equal(existsSync(copied), true);
    assert.equal(readFileSync(copied, 'utf8'), 'arm64');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});