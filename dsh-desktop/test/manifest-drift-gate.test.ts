// 清单漂移门禁的判别力测试。
//
// 背景：CI 的 "Check manifest drift" 步骤原先跑裸 `git diff --exit-code`，
// 而构建步骤 `node scripts/fetch-kernel.js` 会按设计把 package-lock.json 中
// 242 个 file:vendor/kernel/** 条目的 integrity 同步为本次构建产物的 sha512
//（CI 日志：`fetch-kernel: 同步 lockfile integrity 242 个（0.1.5-rc.2）`）。
// 冷缓存下这 242 行必然与提交值不同，于是门禁在正确的构建上必然失败。
//
// 本测试锁住新门禁的两个方向：
//   1. 内核 integrity 漂移（设计内）→ 通过；
//   2. 任何其他漂移（真实篡改）→ 失败。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkManifestDrift, MANAGED_MANIFESTS } from '../scripts/check-manifest-drift.mjs';

/** 造一个最小 git 仓库，含受管清单文件。 */
function createRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-drift-'));
  const run = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  run(['init', '-q']);
  run(['config', 'user.email', 'test@example.com']);
  run(['config', 'user.name', 'test']);
  mkdirSync(join(root, 'dsh-desktop'), { recursive: true });
  writeFileSync(join(root, 'dsh-desktop', 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }, null, 2) + '\n');
  writeFileSync(join(root, 'dsh-desktop', 'package-lock.json'), JSON.stringify({
    name: 'x',
    lockfileVersion: 3,
    packages: {
      '': { name: 'x', version: '1.0.0' },
      'node_modules/@deepseek-ai/dsh': {
        version: '0.1.5-rc.2',
        resolved: 'file:vendor/kernel/0.1.5-rc.2/deepseek-ai-dsh-0.1.5-rc.2.tgz',
        integrity: 'sha512-ORIGINAL1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
      },
      'node_modules/leftpad': {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/leftpad/-/leftpad-1.0.0.tgz',
        integrity: 'sha512-ORIGINAL2BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB==',
      },
    },
  }, null, 2) + '\n');
  run(['add', '-A']);
  run(['commit', '-qm', 'init']);
  return root;
}

function rewrite(path: string, mutate: (lock: any) => void): void {
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  mutate(lock);
  writeFileSync(path, JSON.stringify(lock, null, 2) + '\n');
}

/** 直接调用 git diff 拿真实 diff 文本，确认测试改动确实产生了差异。 */
function rawDiffHasChanges(root: string): boolean {
  return execFileSync('git', ['diff', '--', 'dsh-desktop/package-lock.json'], { cwd: root, encoding: 'utf8' }).trim() !== '';
}

test('未改动时门禁通过', () => {
  const root = createRepo();
  try {
    const result = checkManifestDrift(root);
    assert.equal(result.ok, true);
    assert.deepEqual(result.violations, []);
    assert.equal(result.kernelIntegrityLines, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('只有内核 tarball 的 integrity 变化时门禁通过（设计内同步）', () => {
  const root = createRepo();
  try {
    rewrite(join(root, 'dsh-desktop', 'package-lock.json'), (lock) => {
      lock.packages['node_modules/@deepseek-ai/dsh'].integrity =
        'sha512-REBUILT1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC==';
    });
    assert.equal(rawDiffHasChanges(root), true, '前置条件：裸 diff 应看到改动');

    const result = checkManifestDrift(root);
    assert.equal(result.ok, true, `设计内同步不应判失败：${result.violations.join('; ')}`);
    assert.equal(result.kernelIntegrityLines, 1, '一处内核 integrity 被改写');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('非内核依赖的 integrity 变化仍然判失败', () => {
  const root = createRepo();
  try {
    rewrite(join(root, 'dsh-desktop', 'package-lock.json'), (lock) => {
      lock.packages['node_modules/leftpad'].integrity =
        'sha512-TAMPEREDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD==';
    });
    const result = checkManifestDrift(root);
    assert.equal(result.ok, false);
    assert.match(result.violations.join('\n'), /与内核 tarball 无关/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('内核条目里改 integrity 以外的字段仍然判失败', () => {
  const root = createRepo();
  try {
    rewrite(join(root, 'dsh-desktop', 'package-lock.json'), (lock) => {
      const entry = lock.packages['node_modules/@deepseek-ai/dsh'];
      entry.integrity = 'sha512-REBUILT1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC==';
      entry.version = '9.9.9';
    });
    const result = checkManifestDrift(root);
    assert.equal(result.ok, false);
    assert.match(result.violations.join('\n'), /integrity 之外的改动/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('受管清单之外的构建产物改动不影响门禁（与原命令同范围）', () => {
  const root = createRepo();
  try {
    const stray = join(root, 'tauri-shell');
    mkdirSync(stray, { recursive: true });
    writeFileSync(join(stray, 'generated.js'), 'module.exports = {};\n');
    execFileSync('git', ['add', '-N', 'tauri-shell/generated.js'], { cwd: root });
    const result = checkManifestDrift(root);
    assert.equal(result.ok, true, `范围外文件不应触发漂移：${result.violations.join('; ')}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('package.json 的改动仍然判失败（受管但不可由构建改写）', () => {
  const root = createRepo();
  try {
    writeFileSync(join(root, 'dsh-desktop', 'package.json'), JSON.stringify({ name: 'x', version: '2.0.0' }, null, 2) + '\n');
    const result = checkManifestDrift(root);
    assert.equal(result.ok, false);
    assert.match(result.violations.join('\n'), /dsh-desktop\/package\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('受管清单常量与 CI 引用的两个文件一致', () => {
  assert.deepEqual(MANAGED_MANIFESTS, ['dsh-desktop/package.json', 'dsh-desktop/package-lock.json']);
});
