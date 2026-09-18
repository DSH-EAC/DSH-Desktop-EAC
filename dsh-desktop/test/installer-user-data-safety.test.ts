import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const hooks = readFileSync(join(ROOT, 'tauri-shell', 'installer-hooks.nsh'), 'utf8');

test('installer never recursively deletes DSH_HOME or user model caches', () => {
  assert.doesNotMatch(hooks, /RMDir\s+\/r\s+"\$PROFILE\\\.dsh/i);
  assert.doesNotMatch(hooks, /models\\dsh-stt/i);
  assert.match(hooks, /不在安装\/升级阶段删除 ~\/\.dsh 下的任何用户数据/);
});
