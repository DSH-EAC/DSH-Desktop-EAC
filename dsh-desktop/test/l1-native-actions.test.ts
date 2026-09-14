import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const sidecar = readFileSync(join(root, 'tauri-shell', 'sidecar', 'server.ts'), 'utf8');
const shell = readFileSync(join(root, 'tauri-shell', 'src', 'main.rs'), 'utf8');

test('Tauri sidecar authorizes files but delegates native actions to L1', () => {
  assert.doesNotMatch(sidecar, /desktopPlatform\.(?:openPath|writeClipboardText)/);
  assert.match(sidecar, /'files\.authorize-open'/);
  assert.doesNotMatch(sidecar, /'clipboard\.write-text'\s*:/);
  // v6 Task 3.1（ADR 0006）：open-external 委托原属 client-update 面（已剥出，
  // v6.1 Task 8 接回）；system-notification 仍由 session-watcher 通知链消费。
  assert.match(sidecar, /notify\('shell\.system-notification'/);
});

test('Rust L1 owns file-open, external URL and clipboard methods', () => {
  assert.match(shell, /"files\.open"\s*=>/);
  assert.match(shell, /"clipboard\.write-text"\s*=>/);
  assert.match(shell, /fn open_native_target\(/);
  assert.match(shell, /async fn write_clipboard_text\(/);
  assert.match(shell, /"shell\.system-notification"\s*=>/);
  assert.match(shell, /fn show_system_notification\(/);
});

test('Windows native open bypasses cmd parsing and reports menu failures', () => {
  assert.match(shell, /ShellExecuteW/);
  assert.doesNotMatch(shell, /Command::new\("cmd"\)/);
  assert.match(shell, /native_action_result\(result\)/);
  assert.match(shell, /"open-browser"\s*=>[\s\S]*?native_action_result\(result\)/);
  assert.match(shell, /"feedback"\s*=>[\s\S]*?native_action_result\(result\)/);
});

test('Tauri keeps WebView2Loader as a Windows-only bundle resource', () => {
  const baseConfigPath = join(root, 'tauri-shell', 'tauri.conf.json');
  const windowsConfigPath = join(root, 'tauri-shell', 'tauri.windows.conf.json');

  assert.equal(existsSync(windowsConfigPath), true);
  const baseConfig = readFileSync(baseConfigPath, 'utf8');
  const windowsConfig = readFileSync(windowsConfigPath, 'utf8');
  assert.doesNotMatch(baseConfig, /WebView2Loader\.dll/);
  assert.match(windowsConfig, /staged-resources\/WebView2Loader\.dll/);
});
