import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = readFileSync(join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8');

function triggerBlock(event: 'pull_request' | 'push'): string {
  const match = workflow.match(new RegExp(`^  ${event}:\\n([\\s\\S]*?)(?=^  \\w|^concurrency:)`, 'm'));
  assert.ok(match, `CI 缺少 ${event} 触发器`);
  return match[1];
}

test('单元与构建 CI 在 PR 到 dev/main 及 push 到 dev/main 时触发', () => {
  for (const event of ['pull_request', 'push'] as const) {
    const block = triggerBlock(event);
    assert.match(block, /branches:\n\s+- dev\n\s+- main\n/);
  }
  assert.match(workflow, /^  source-and-unit:/m);
  assert.match(workflow, /^  staged-runtime:/m);
});

test('staged runtime 在原生 x64 与 arm64 runner 上构建并验证架构', () => {
  const job = workflow.match(/^  staged-runtime:\n([\s\S]*)$/m)?.[1] ?? '';
  assert.match(job, /runs-on: \$\{\{ matrix\.runner \}\}/);
  assert.match(job, /runner: ubuntu-22\.04\n\s+arch: x64/);
  assert.match(job, /runner: ubuntu-22\.04-arm\n\s+arch: arm64/);
  assert.match(job, /process\.arch/);
  assert.match(job, /matrix\.arch/);
  assert.match(job, /key:.*matrix\.arch/);
});
