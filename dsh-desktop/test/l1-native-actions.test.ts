import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const sidecar = readFileSync(join(root, 'tauri-shell', 'sidecar', 'server.ts'), 'utf8');
const shell = readFileSync(join(root, 'tauri-shell', 'src', 'main.rs'), 'utf8');

test('Tauri sidecar keeps only the minimal boot surface (v6 B-plan)', () => {
  // v6 Task 3.1（ADR 0006 v5）：sidecar RPC 面收敛为 boot.* + shell.info +
  // profile.name（文件围栏 files.* / 原生剪贴板 / 外链打开等随壳最小控制面
  // 迁至 Rust L1 的 win.* 或整体删除）。
  assert.match(sidecar, /'boot\.start'/);
  assert.match(sidecar, /'boot\.state'/);
  assert.doesNotMatch(sidecar, /'files\.authorize-open'\s*:/);
  assert.doesNotMatch(sidecar, /'clipboard\.write-text'\s*:/);
  // system-notification 仍由 session-watcher 通知链消费（保留）。
  assert.match(sidecar, /notify\('shell\.system-notification'/);
});

test('Rust L1 owns window controls and the web-open action (v6 B-plan)', () => {
  // B 方案：壳最小控制面 = win.*（窗口控制）+ boot.*；L1 仍负责原生动作
  //（open_external / ShellExecuteW）与系统通知。
  assert.match(shell, /"win\.minimize"\s*=>/);
  assert.match(shell, /"win\.open-browser"\s*=>/);
  assert.match(shell, /fn open_external\(/);
  assert.match(shell, /"shell\.system-notification"\s*=>/);
  assert.match(shell, /fn show_system_notification\(/);
  // 已随接口收敛删除：原生文件打开 / 剪贴板写入（无消费方）。
  assert.doesNotMatch(shell, /"files\.open"\s*=>/);
  assert.doesNotMatch(shell, /"clipboard\.write-text"\s*=>/);
});

test('Windows native open bypasses cmd parsing', () => {
  assert.match(shell, /ShellExecuteW/);
  assert.doesNotMatch(shell, /Command::new\("cmd"\)/);
  assert.match(shell, /native_action_result\(result\)/);
  // B 方案：open-browser 动作迁至 win.open-browser（feedback 随 EAC 面删除）。
  assert.match(shell, /"win\.open-browser"\s*=>[\s\S]*?native_action_result\(result\)/);
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
