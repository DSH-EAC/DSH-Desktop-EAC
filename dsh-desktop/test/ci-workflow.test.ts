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

function jobBlock(jobName: string): string {
  const start = workflow.indexOf(`  ${jobName}:\n`);
  assert.notEqual(start, -1, `CI 缺少 ${jobName} job`);
  return workflow.slice(start).split(/\n  [a-z][\w-]*:\n/)[0];
}

test('单元与构建 CI 在 PR 到 dev/main 及 push 到 dev/main 时触发', () => {
  for (const event of ['pull_request', 'push'] as const) {
    const block = triggerBlock(event);
    assert.match(block, /branches:\n\s+- dev\n\s+- main\n/);
  }
  assert.match(workflow, /^  source-and-unit:/m);
  assert.match(workflow, /^  staged-runtime:/m);
});

test('构建、Rust 与 staged runtime 在四个平台架构上运行并隔离产物', () => {
  for (const jobName of ['source-and-unit', 'rust-shell', 'staged-runtime']) {
    const job = jobBlock(jobName);
    assert.match(job, /runs-on: \$\{\{ matrix\.runner \}\}/);
    assert.match(job, /runner: ubuntu-22\.04\n\s+os: linux\n\s+arch: x64/);
    assert.match(job, /runner: ubuntu-22\.04-arm\n\s+os: linux\n\s+arch: arm64/);
    assert.match(job, /runner: windows-latest\n\s+os: windows\n\s+arch: x64/);
    assert.match(job, /runner: windows-11-arm\n\s+os: windows\n\s+arch: arm64/);
    assert.match(job, /process\.arch/);
    assert.match(job, /matrix\.arch/);
  }
  assert.match(workflow, /generated-bridge-\$\{\{ matrix\.os \}\}-\$\{\{ matrix\.arch \}\}/);
  assert.match(workflow, /key: \$\{\{ runner\.os \}\}-\$\{\{ matrix\.arch \}\}-kernel/);
  assert.match(workflow, /Prepare Tauri resource directory for Rust tests/);
  const rustJob = jobBlock('rust-shell');
  assert.match(rustJob, /(?:cpSync\(root\+'\/artifacts',staged\+'\/ui-skin-manager'|cpSync\('tauri-shell\/artifacts','tauri-shell\/staged-resources\/ui-skin-manager')/);
  assert.match(rustJob, /skin-manager-artifact\.lock\.json/);
  assert.match(rustJob, /Fetch Windows Cargo dependencies[\s\S]*?cargo fetch --locked/);
  assert.match(rustJob, /Prepare Windows WebView2Loader resource[\s\S]*?prepare-webview2-loader\.mjs --arch=\$\{\{ matrix\.arch \}\}/);
  const stagedJob = jobBlock('staged-runtime');
  assert.match(stagedJob, /Set up stable Rust for Windows resources[\s\S]*?Fetch Windows Cargo dependencies[\s\S]*?cargo fetch --locked[\s\S]*?Assemble staged runtime/);
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
