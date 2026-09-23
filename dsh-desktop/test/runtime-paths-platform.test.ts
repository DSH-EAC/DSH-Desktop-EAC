import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const runtimePaths = require('../lib/desktop/runtime-paths.js') as {
  APP_ROOT: string;
  init(ctx: {
    log(tag: string, message: string): void;
    getUserDataDir(): string;
    isPackaged(): boolean;
    resourcesPath(): string;
    appRoot(): string;
    platform: NodeJS.Platform;
  }): void;
  nodeExe(): string;
};

test('runtime paths resolve the packaged Node executable for Linux', () => {
  const appRoot = path.join('', 'tmp', 'dsh-app-root');
  runtimePaths.init({
    log: () => {},
    getUserDataDir: () => '/tmp/user-data',
    isPackaged: () => true,
    resourcesPath: () => '/opt/dsh',
    appRoot: () => appRoot,
    platform: 'linux',
  });

  // appRoot 指向空目录 → Tauri 布局缺失，命中旧 Electron 布局回退候选。
  assert.equal(runtimePaths.nodeExe(), path.join('/opt/dsh', 'node', 'node'));
});

test('runtime paths preserve packaged and development node.exe on Windows', () => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-paths-win-'));
  const bundledNode = path.join(appRoot, 'vendor', 'node', 'node.exe');
  fs.mkdirSync(path.dirname(bundledNode), { recursive: true });
  fs.writeFileSync(bundledNode, '');

  try {
    runtimePaths.init({
      log: () => {},
      getUserDataDir: () => 'C:\\tmp\\user-data',
      isPackaged: () => true,
      resourcesPath: () => 'C:\\Program Files\\DSH',
      appRoot: () => appRoot,
      platform: 'win32',
    });
    assert.equal(runtimePaths.nodeExe(), bundledNode);

    runtimePaths.init({
      log: () => {},
      getUserDataDir: () => 'C:\\tmp\\user-data',
      isPackaged: () => false,
      resourcesPath: () => '',
      appRoot: () => appRoot,
      platform: 'win32',
    });
    assert.equal(runtimePaths.nodeExe(), bundledNode);
  } finally {
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
});
