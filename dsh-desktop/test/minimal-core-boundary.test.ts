import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]): string => readFileSync(join(root, ...parts), 'utf8');
const main = read('tauri-shell', 'src', 'main.rs');
const server = read('tauri-shell', 'sidecar', 'server.ts');
const stubs = read('tauri-shell', 'sidecar', 'capability-stubs.ts');
const stage = read('tauri-shell', 'stage-resources.mjs');
const build = read('tauri-shell', 'build.rs');
const platform = read('dsh-desktop', 'lib', 'desktop', 'platform.ts');
const skinAssets = [
  read('dsh-desktop', 'assets', 'shell-skin', 'eac-default', 'skin.json'),
  read('dsh-desktop', 'assets', 'shell-skin', 'eac-default', 'README.md'),
  read('dsh-desktop', 'assets', 'shell-skin', 'eac-default', 'controls.css'),
  read('dsh-desktop', 'assets', 'shell-skin', 'eac-default', 'tokens.css'),
  read('dsh-desktop', 'assets', 'shell-skin', 'aio', 'skin.json'),
  read('dsh-desktop', 'assets', 'shell-skin', 'aio', 'tokens.css'),
].join('\n');

test('minimal shell has no recovery center entry points', () => {
  assert.doesNotMatch(main, /\/recovery-center|DSH_DESKTOP_RECOVERY|"rc\.open"|"shell\.relaunch-safe-mode"/);
  assert.equal(existsSync(join(root, 'dsh-desktop', 'assets', 'recovery-center.html')), false);
  assert.equal(existsSync(join(root, 'dsh-desktop', 'assets', 'recovery-center-preload.js')), false);
  assert.doesNotMatch(skinAssets, /recovery-center(?:\.html)?|恢复中心|safe-mode|card-raised/);
});

test('minimal sidecar does not register retired recovery RPC families', () => {
  assert.doesNotMatch(server, /DSH_DESKTOP_RECOVERY/);
  assert.doesNotMatch(server, /stubs\.(?:rcMethods|rescueMethods|guardMethods)/);
  assert.doesNotMatch(stubs, /['"](?:rc|rescue|guard)\.[\w-]+['"]\s*:/);
});

test('platform abstraction has no plugin-specific capability matrix', () => {
  assert.doesNotMatch(platform, /pluginCapabilityDetails|computerUser|plugins\s*:/);
});

test('minimal shell has no float, update, about, or renderer heartbeat implementation', () => {
  assert.doesNotMatch(main, /"float\.(?:open|close)"|fn open_float_window|fn update_page|fn about_page/);
  assert.doesNotMatch(main, /"(?:client-update\.(?:show|hide)|shell\.about|shell\.exit-dismiss|log\.renderer-heartbeat)"/);
});

test('staging excludes retired recovery and isolation modules', () => {
  for (const retired of [
    'recovery-center.html',
    'recovery-center-preload.js',
    'state.js',
    'log.js',
    'plugin-copy.js',
    'file-roots.js',
    'logger.js',
    'shared/protocol.js',
  ]) {
    assert.doesNotMatch(stage, new RegExp(retired.replaceAll('.', '\\.')));
  }
});

test('minimal shell keeps boot recovery, native window actions, and system notification', () => {
  assert.match(server, /['"]boot\.start['"]\s*:/);
  assert.match(server, /['"]boot\.restart['"]\s*:/);
  assert.match(main, /fn died_page\(/);
  assert.match(main, /"win\.minimize"\s*=>/);
  assert.match(main, /"win\.open-browser"\s*=>/);
  assert.match(main, /"win\.viewport-beat"\s*=>/);
  assert.match(main, /"shell\.system-notification"\s*=>/);
});

test('WS JSON-RPC client remains a single staged source for the main window bridge', () => {
  assert.match(build, /\.join\("assets"\)[\s\S]*\.join\("ws-jsonrpc-client\.js"\)/);
  assert.match(build, /bridge-bundle\.js/);
  assert.match(main, /BRIDGE_JS: &str = include_str!/);
  assert.match(stage, /'ws-jsonrpc-client\.js'/);
});

test('bundle integrity remains in build manifest generation and startup verification', () => {
  assert.match(stage, /buildBundleManifest|bundle-integrity\.js/);
  assert.match(server, /verifyBundle/);
});
