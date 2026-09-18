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

// CodeQL `actions/missing-workflow-permissions`（CWE-275）：没有显式
// permissions 时 GITHUB_TOKEN 会继承仓库/组织默认权限（2023-02 之前创建的
// 仓库默认可写），违反最小权限。该查询接受 workflow 级或 job 级 permissions，
// 本 workflow 用 workflow 级一处覆盖三个 job。
test('CI 显式限制 GITHUB_TOKEN 权限（CodeQL actions/missing-workflow-permissions）', () => {
  const perms = workflow.match(/^permissions:\n((?:[ \t]+.*\n|\n)*)/m);
  assert.ok(perms, 'CI 缺少顶层 permissions 块，CodeQL 会再次报 actions/missing-workflow-permissions');
  // workflow 级 permissions 对所有未自带该键的 job 生效（CodeQL 的
  // jobHasPermissions 接受 job 级或所属 workflow 级，二者有其一即不告警）。
  assert.match(perms[1], /^ {2}contents: read$/m, 'permissions 必须至少含 contents: read');
});
