import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const runtimePaths = require('../lib/desktop/runtime-paths.js') as {
  init(ctx: {
    log(tag: string, message: string): void;
    getUserDataDir(): string;
    isPackaged(): boolean;
    resourcesPath(): string;
    appRoot(): string;
    platform: NodeJS.Platform;
  }): void;
  quarantineBrokenOverlay(reason: unknown): { quarantined: boolean; path?: string; error?: string };
  dshBin(): string;
  dshVersionSource(): string;
  isUsingOverlay(): boolean;
};

function makeOverlay(userDataDir: string, version: string, binSource: string): string {
  const pkg = path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh');
  fs.mkdirSync(path.join(pkg, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version }));
  const bin = path.join(pkg, 'lib', 'bin.js');
  fs.writeFileSync(bin, binSource);
  return bin;
}

function init(userDataDir: string, logs: string[]): void {
  const appRoot = path.join(userDataDir, 'app-root');
  const runtimeDir = path.join(appRoot, 'vendor', 'node');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.copyFileSync(process.execPath, path.join(runtimeDir, process.platform === 'win32' ? 'node.exe' : 'node'));
  runtimePaths.init({
    log: (tag, message) => logs.push(`[${tag}] ${message}`),
    getUserDataDir: () => userDataDir,
    isPackaged: () => false,
    resourcesPath: () => '',
    appRoot: () => appRoot,
    platform: process.platform,
  });
}

test('overlay 无需健康缓存，直接乐观参与真实启动', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-health-ok-'));
  const logs: string[] = [];
  const bin = makeOverlay(userDataDir, '9.9.9', "console.log('9.9.9');\n");
  init(userDataDir, logs);

  assert.equal(runtimePaths.dshBin(), bin);
  assert.equal(fs.existsSync(path.join(userDataDir, 'agent', '.eac-agent-health.json')), false);
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

test('曾经可用的 overlay 损坏后仍可被隔离并回退内置版本', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-health-bad-'));
  const logs: string[] = [];
  const bin = makeOverlay(userDataDir, '9.9.9', "console.log('9.9.9');\n");
  init(userDataDir, logs);

  assert.equal(runtimePaths.dshBin(), bin, '第一次启动应直接选择 overlay');
  fs.writeFileSync(bin, "require('@deepseek-ai/definitely-missing');\n");
  const result = runtimePaths.quarantineBrokenOverlay(new Error('ERR_MODULE_NOT_FOUND'));
  assert.equal(result.quarantined, true);
  assert.equal(fs.existsSync(path.join(userDataDir, 'agent')), false);
  assert.ok(fs.readdirSync(userDataDir).some((name) => name.startsWith('agent-broken-')));
  assert.equal(runtimePaths.isUsingOverlay(), false);
  assert.equal(runtimePaths.dshVersionSource(), '内置');
  assert.ok(logs.some((line) => line.includes('真实启动失败')));
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

test('sidecar 在真实启动失败后停止残留进程、隔离 overlay 并重试内置版本', () => {
  const server = fs.readFileSync(path.join(testDir, '..', '..', 'tauri-shell', 'sidecar', 'server.ts'), 'utf8');
  const start = server.indexOf('async function guardedStartAndWait');
  const end = server.indexOf('// ---- 方法注册表', start);
  const guarded = server.slice(start, end);

  assert.ok(start >= 0 && end > start, '必须能定位 guardedStartAndWait 实现');
  assert.match(guarded, /const startedWithOverlay = .*isUsingOverlay/);
  assert.match(guarded, /catch \(overlayError\)[\s\S]*if \(!startedWithOverlay\) throw overlayError/);
  const stopAt = guarded.indexOf('bootMod.stopServer');
  const quarantineAt = guarded.indexOf('pathsMod.quarantineBrokenOverlay');
  const retryAt = guarded.indexOf('bootMod.startAndWait', quarantineAt);
  assert.ok(stopAt >= 0 && stopAt < quarantineAt && quarantineAt < retryAt, '失败后必须先停进程，再隔离，最后重试');
  assert.doesNotMatch(server, /ensureHealthyOverlay|\.eac-agent-health\.json/);
});
