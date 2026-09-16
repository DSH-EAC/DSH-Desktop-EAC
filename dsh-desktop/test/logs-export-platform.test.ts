import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const requireFromTest = createRequire(import.meta.url);
const rescue = requireFromTest(path.join(testDir, '..', '..', 'tauri-shell', 'sidecar', 'rescue-integration.js')) as {
  createLogsArchive(logsDir: string, zipPath: string): Promise<void>;
  resolveLogsExportDir(env: NodeJS.ProcessEnv, homeDir: string, fallbackDir: string): string;
};

test('log export selects an existing redirected desktop and falls back safely', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-log-export-path-'));
  try {
    const redirected = path.join(root, '云盘 用户', 'Desktop');
    const fallback = path.join(root, 'diagnostics-exports');
    fs.mkdirSync(redirected, { recursive: true });
    assert.equal(
      rescue.resolveLogsExportDir({ OneDrive: path.dirname(redirected) }, path.join(root, 'home'), fallback),
      redirected,
    );
    assert.equal(rescue.resolveLogsExportDir({}, path.join(root, 'missing-home'), fallback), fallback);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('log export archives Unicode and spaced paths without a shell', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-log-export-unicode-'));
  try {
    const logsDir = path.join(root, '中文 用户', 'logs');
    const zipPath = path.join(root, '导出 目录', 'dsh-eac-logs.zip');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'main.00'), '中文日志\n', 'utf8');
    await rescue.createLogsArchive(logsDir, zipPath);
    assert.equal(fs.existsSync(zipPath), true);
    assert.ok(fs.statSync(zipPath).size > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Tauri bridge exposes only the official contract + shell controls (v6 B-plan)', () => {
  // v6 Task 3.1（ADR 0006 v5）：菜单面随 EAC 自定义接口删除（导出日志等
  // 更新链能力已剥出）；桥只剩官方 dshDesktop 契约 + 窗口控制 + boot。
  const bridge = fs.readFileSync(path.join(testDir, '..', '..', 'tauri-shell', 'sidecar', 'bridge.ts'), 'utf8');
  assert.match(bridge, /protocolVersion:\s*1/);
  assert.match(bridge, /windowControls:/);
  assert.match(bridge, /boot:\s*\{/);
  assert.doesNotMatch(bridge, /showMenuStatus/);
  assert.doesNotMatch(bridge, /menu:\s*\{/);
});
