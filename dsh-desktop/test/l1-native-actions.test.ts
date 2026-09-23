import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const sidecar = readFileSync(join(root, 'tauri-shell', 'sidecar', 'server.ts'), 'utf8');
const shell = readFileSync(join(root, 'tauri-shell', 'src', 'main.rs'), 'utf8');

test('Tauri sidecar keeps the boot surface and the restored file RPCs (v6 B-plan + Task 3.3)', () => {
  // v6 Task 3.1（ADR 0006 v5）收敛为 boot.* + shell.info + profile.name；
  // v6 Task 3.3 按其「插口契约」接回插件所需的最小文件面（files.*）。
  // 断言拆两组：恒在（boot）必须保留；已收敛面（clipboard）不得回归。
  assert.match(sidecar, /'boot\.start'/);
  assert.match(sidecar, /'boot\.state'/);
  // Task 3.3 接回：dsh-client-file-changes 消费
  assert.match(sidecar, /'files\.authorize-open'\s*:/);
  assert.match(sidecar, /'files\.revert'\s*:/);
  // 仍处收敛态：剪贴板写入无消费方，不得回归。
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
  // Task 3.3 接回：原生文件打开（先经 sidecar 授权再 ShellExecuteW）。
  assert.match(shell, /"files\.open"\s*=>/);
  // 安全契约：files.open 必须经 files.authorize-open 授权，不得直连 open_native_target。
  assert.match(shell, /"files\.open"\s*=>[\s\S]*?files\.authorize-open/);
  // 仍处收敛态：剪贴板写入无消费方，不得回归。
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
