import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// v6 Task 3.1（ADR 0006）：client-update 与 shortcuts 模块随更新体系/增值
// 面剥出装配（v6.1 Task 8 接回）。原「platform handoff 只注入 client-update」
// 契约的最简本体守门：server.ts 不得再挂载这两个模块（防接回前漏装配）。
for (const relative of ['../tauri-shell/sidecar/server.ts']) {
  test(`${relative} v6 minimal core does not mount client-update / shortcuts`, () => {
    const source = readFileSync(join(root, relative), 'utf8');
    assert.doesNotMatch(source, /mount\('client-update'\)/);
    assert.doesNotMatch(source, /mount\('shortcuts'\)/);
    assert.doesNotMatch(source, /clientUpdateMod\.init/);
    assert.doesNotMatch(source, /shortcutsMod\.init/);
  });
}
