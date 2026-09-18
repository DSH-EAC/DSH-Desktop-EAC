// 内核版本钉一致性：内核版本散布在多个必须同步的位置（历史上各自手改，
// 升级时容易漏改一处导致 fetch-kernel 拉错 tag / 冒烟断言错版本）。本测试
// 把三处钉子锁在一起 —— 升内核时 package.json 是唯一事实源，改完这里其他
// 位置不同步就会红：
//   1. package.json  dependencies 的 file:vendor/kernel/<ver>/ 前缀
//   2. scripts/fetch-kernel.ts  DEFAULT_TAG = 'dsh-v<ver>'
//   3. docs/archive/upgrade-test-441.js（Electron 退役后归档，钉子语义保留）
//      「安装树内核 = <ver>」硬断言

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};

const kernelPrefixes = Object.values(pkg.dependencies)
  .filter((v) => v.startsWith('file:vendor/kernel/'))
  .map((v) => v.slice('file:vendor/kernel/'.length).split('/')[0]);
assert.ok(kernelPrefixes.length > 0, 'package.json 应有 file:vendor/kernel/<ver>/ 依赖');
const kernelVersion = kernelPrefixes[0];

test('package.json 所有内核依赖钉同一版本', () => {
  assert.ok(kernelPrefixes.every((v) => v === kernelVersion),
    'package.json 出现多个内核版本钉: ' + [...new Set(kernelPrefixes)].join(', '));
});

test('fetch-kernel DEFAULT_TAG 与 package.json 内核钉一致', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'fetch-kernel.ts'), 'utf8');
  const m = src.match(/const DEFAULT_TAG = 'dsh-v([^']+)'/);
  assert.ok(m, 'fetch-kernel.ts 未找到 DEFAULT_TAG');
  assert.equal(m![1], kernelVersion,
    `fetch-kernel DEFAULT_TAG=${m![1]} != package.json 内核钉=${kernelVersion}`);
});

test('upgrade-test-441 内核断言与 package.json 内核钉一致', () => {
  // 5.3.3 批次 F：该脚本已归档到仓库根 docs/archive/（Electron 退役后不可再
  // 跑），钉子语义保留 —— 升内核仍须同步归档件里的硬断言，防止按旧文档
  // 回溯时被误导。
  const src = readFileSync(join(ROOT, '..', 'docs', 'archive', 'upgrade-test-441.js'), 'utf8');
  assert.ok(src.includes(`kern === '${kernelVersion}'`),
    `归档的 upgrade-test-441.js 内核硬断言未钉住 ${kernelVersion}（升内核后记得同步）`);
});
