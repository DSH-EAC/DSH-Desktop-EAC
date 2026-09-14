// 内置 bundle 插件播种（seedBundledPlugins）契约测试。
//
// 背景：raw-html 等 bundle 插件必须出现在 profile package.json 的
// dsh.profile.bundles 里才能加载（bundle 机制驱动 host + client 注入，
// overlay 行会被 removeBundledRowDuplicates 去重，走 patch 行无效）。
// DESKTOP_PROFILE_BUNDLES 只播种全新 profile；存量 profile 由
// seedBundledPlugins 在 syncCompanionPlugins 启动时幂等补齐。
// 本测试锁死：缺失追加、已有不动、幂等、失败不炸、保持用户顺序。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { seedBundledPlugins } from '../lib/desktop/companion-sync.js';

function makeProfile(dir: string, bundles: unknown[]): void {
  writeFileSync(join(dir, 'package.json'),
    JSON.stringify({ name: 'dsh-profile-test', private: true, dependencies: {}, dsh: { profile: { bundles } } }, null, 2) + '\n');
}

test('seedBundledPlugins appends missing bundled builtins and writes back', () => {
  // v6 Task 3.1（ADR 0006 v3 · 严格模式）：BUNDLED_BUILTIN_PLUGINS 已清空
  //（内置 bundle 插件随 assets/plugins 剥出）—— 播种行为守门：空清单下
  // 不追加、changed=false。Task 3.3 接回插件时恢复追加断言。
  const dir = mkdtempSync(join(tmpdir(), 'seed-bundled-'));
  try {
    makeProfile(dir, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']);
    const r1 = seedBundledPlugins(dir);
    assert.equal(r1.changed, false);
    const after = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    assert.deepEqual(after.dsh.profile.bundles, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']);
    // 幂等：第二次无变化、不重写
    const r2 = seedBundledPlugins(dir);
    assert.equal(r2.changed, false);
    assert.deepEqual(r2.bundles, after.dsh.profile.bundles);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('seedBundledPlugins preserves existing bundles and user order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seed-bundled-'));
  try {
    // 用户已手动安装 raw-html（bundle 在列表中间）→ 不动
    makeProfile(dir, ['@deepseek-ai/dsh-base', 'dsh-raw-html', 'user-plugin']);
    const r = seedBundledPlugins(dir);
    assert.equal(r.changed, false);
    assert.deepEqual(
      JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dsh.profile.bundles,
      ['@deepseek-ai/dsh-base', 'dsh-raw-html', 'user-plugin']
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('seedBundledPlugins survives missing/corrupt profile manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seed-bundled-'));
  try {
    // 无 package.json：不抛异常
    const r1 = seedBundledPlugins(dir);
    assert.equal(r1.changed, false);
    assert.deepEqual(r1.bundles, []);
    // 畸形 JSON：不抛异常
    writeFileSync(join(dir, 'package.json'), '{ not json');
    const r2 = seedBundledPlugins(dir);
    assert.equal(r2.changed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('seedBundledPlugins keeps format consistent (indent 2 + trailing newline)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seed-bundled-'));
  try {
    makeProfile(dir, ['@deepseek-ai/dsh-base']);
    seedBundledPlugins(dir);
    const raw = readFileSync(join(dir, 'package.json'), 'utf8');
    assert.ok(raw.endsWith('\n'), 'trailing newline expected');
    assert.ok(raw.includes('\n  "dsh"'), 'two-space indent expected');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
