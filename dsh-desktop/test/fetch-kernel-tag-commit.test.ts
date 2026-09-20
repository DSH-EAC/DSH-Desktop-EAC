// issue #393 的回归测试：fetch-kernel 解析 tag → commit 时**不得**触达匿名
// GitHub REST API（未认证配额 60 次/小时/出口 IP，CI 矩阵 4 个 job 共享
// runner 出口 IP，缓存冷时必然互相抢配额 → 随机某个 job 以 HTTP 403 失败）。
//
// 覆盖两条路径：
//   1. 钉版 tag → 直接取 KERNEL_TAG_COMMITS，零网络；
//   2. 未钉 tag（升级路径）→ `git ls-remote`（git 协议，不受 API 配额限制），
//      且同时支持附注 tag（`^{}` peel）与轻量 tag（`^{}` 为空、回落裸 ref）。
// 测试全部离线：第 2 条指向本地裸库，不需要网络。
//
// 注意：CI 的 "Prepare vendored kernel" 步骤跑的是**编译产物**
// `scripts/fetch-kernel.js`（tsc 就地产出、且该 .js 是已跟踪文件），因此在
// `.ts` 之外还必须守住产物本身 —— 只改 .ts 而漏提产物，线上照旧触达 API。

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

const {
  resolveTagCommit,
  KERNEL_TAG_COMMITS,
  DEFAULT_TAG,
} = require('../scripts/fetch-kernel.js') as {
  resolveTagCommit(tag: string, pins?: Record<string, string>, remote?: string): string;
  KERNEL_TAG_COMMITS: Record<string, string>;
  DEFAULT_TAG: string;
};

const SHA = /^[0-9a-f]{40}$/;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' },
  }).trim();
}

/** 造一个含轻量 tag 与附注 tag 的本地裸库，返回 { remote, light, annotated }。 */
function fixtureRemote(): { remote: string; light: string; annotated: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-tag-commit-'));
  const work = join(root, 'work');
  mkdirSync(work);
  git(work, 'init', '-q', '-b', 'main');
  writeFileSync(join(work, 'a.txt'), 'a\n');
  git(work, 'add', 'a.txt');
  git(work, 'commit', '-q', '-m', 'one');
  const light = git(work, 'rev-parse', 'HEAD');
  git(work, 'tag', 'dsh-v1.0.0-light');

  writeFileSync(join(work, 'a.txt'), 'b\n');
  git(work, 'commit', '-q', '-am', 'two');
  const annotated = git(work, 'rev-parse', 'HEAD');
  git(work, 'tag', '-a', 'dsh-v1.0.0-annotated', '-m', 'release');

  const remote = join(root, 'remote.git');
  git(root, 'clone', '-q', '--bare', work, remote);
  // 裸库必须显式同步 refs/tags（--bare clone 会带上，这里再确认一次）。
  git(remote, 'fsck', '--no-progress', '--connectivity-only');
  return { remote, light, annotated, root };
}

test('钉版 tag 走钉版表：给一个不可达 remote 也照样返回固定 SHA（零网络）', () => {
  const pinned = KERNEL_TAG_COMMITS[DEFAULT_TAG];
  assert.ok(pinned !== undefined, `${DEFAULT_TAG} 未登记在 KERNEL_TAG_COMMITS`);
  const resolved = resolveTagCommit(DEFAULT_TAG, KERNEL_TAG_COMMITS, 'https://invalid.invalid/x.git');
  assert.equal(resolved, pinned);
});

test('钉版表恒被优先使用：即使远端 tag 指向别的 commit', () => {
  const { remote, light, root } = fixtureRemote();
  try {
    const resolved = resolveTagCommit('dsh-v1.0.0-light', { 'dsh-v1.0.0-light': light }, remote);
    assert.equal(resolved, light);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('未钉 tag 回落 git ls-remote：轻量 tag（^{} 为空）取裸 ref', () => {
  const { remote, light, root } = fixtureRemote();
  try {
    assert.equal(resolveTagCommit('dsh-v1.0.0-light', {}, remote), light);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('未钉 tag 回落 git ls-remote：附注 tag 取 peel 后的 commit', () => {
  const { remote, annotated, root } = fixtureRemote();
  try {
    assert.equal(resolveTagCommit('dsh-v1.0.0-annotated', {}, remote), annotated);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('不存在的 tag 给出明确报错，且报错里带出已尝试的仓库地址', () => {
  const { remote, root } = fixtureRemote();
  try {
    assert.throws(
      () => resolveTagCommit('dsh-v9.9.9-nope', {}, remote),
      /git ls-remote 未能解析 dsh-v9\.9\.9-nope 指向的 commit/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('钉版表里的值必须是 40 位小写十六进制（防手抖写短 hash / 大写）', () => {
  for (const [tag, sha] of Object.entries(KERNEL_TAG_COMMITS)) {
    assert.match(sha, SHA, `KERNEL_TAG_COMMITS['${tag}'] = ${sha} 不是 40 位小写十六进制`);
  }
  assert.throws(
    () => resolveTagCommit('dsh-v1.0.0-bad', { 'dsh-v1.0.0-bad': 'ABCDEF' }, 'https://invalid.invalid/x.git'),
    /不是 40 位小写十六进制/,
  );
});

test('源码里不再存在对 api.github.com 的调用（issue #393 的根因）', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'fetch-kernel.ts'), 'utf8');
  assert.equal(
    src.includes('api.github.com'),
    false,
    'fetch-kernel.ts 又出现了 api.github.com —— 匿名配额会让 CI 矩阵并发时随机 403',
  );
});

test('capture() 的失败信息带出退出码与 stderr（issue #393 的可诊断性缺口）', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'fetch-kernel.ts'), 'utf8');
  assert.match(src, /退出码 \$\{String\(result\.status/);
  assert.match(src, /result\.stderr/);
});

// ---- 编译产物守卫：CI 实际执行 `node scripts/fetch-kernel.js` ----
// `scripts/fetch-kernel.js` 是 tsc 就地编译产物，但**同时是已跟踪文件**，且
// CI 的 kernel 步骤跑在 `npm run build` 之前。只改 .ts 而漏提产物 → 线上
// 依旧走匿名 REST API，issue #393 原样复现。以下三条把它钉死。

test('编译产物 fetch-kernel.js 同样不再触达 api.github.com', () => {
  const artifact = readFileSync(join(ROOT, 'scripts', 'fetch-kernel.js'), 'utf8');
  assert.equal(
    artifact.includes('api.github.com'),
    false,
    'scripts/fetch-kernel.js 仍调用 api.github.com —— CI 在 npm run build 之前就执行它，必须同步提交产物',
  );
});

test('编译产物 fetch-kernel.js 导出了钉版解析入口（产物未与 .ts 脱节）', () => {
  const artifact = readFileSync(join(ROOT, 'scripts', 'fetch-kernel.js'), 'utf8');
  assert.match(artifact, /function resolveTagCommit\(/,
    'scripts/fetch-kernel.js 未包含 resolveTagCommit —— 产物落后于 .ts，请运行 npm run build 并提交产物');
  assert.match(artifact, /const KERNEL_TAG_COMMITS = \{/,
    'scripts/fetch-kernel.js 未包含 KERNEL_TAG_COMMITS 钉版表 —— 产物落后于 .ts');
  assert.match(artifact, /require\.main === module/,
    'scripts/fetch-kernel.js 缺少 main() 守卫 —— 产物落后于 .ts');
});

test('产物与源码的 DEFAULT_TAG / 钉版 commit 必须一致（防单边改动）', () => {
  const ts = readFileSync(join(ROOT, 'scripts', 'fetch-kernel.ts'), 'utf8');
  const js = readFileSync(join(ROOT, 'scripts', 'fetch-kernel.js'), 'utf8');
  const tagOf = (src: string) => /const DEFAULT_TAG = '([^']+)'/.exec(src)?.[1];
  assert.equal(tagOf(js), tagOf(ts), 'fetch-kernel.js 与 .ts 的 DEFAULT_TAG 不一致');
  const pinOf = (src: string) =>
    new RegExp(`'${DEFAULT_TAG}':\\s*'([0-9a-f]{40})'`).exec(src)?.[1];
  const tsSha = pinOf(ts);
  assert.equal(pinOf(js), tsSha, 'fetch-kernel.js 与 .ts 的钉版 commit 不一致');
  assert.equal(tsSha, KERNEL_TAG_COMMITS[DEFAULT_TAG],
    '运行时读到的钉版表与源码文本不一致（产物未重建？）');
});
