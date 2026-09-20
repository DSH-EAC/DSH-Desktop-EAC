#!/usr/bin/env node
// 清单漂移门禁（取代 CI 里裸的 `git diff --exit-code`）。
//
// Why 需要它：`.github/workflows/ci.yml` 的构建步骤 `node scripts/fetch-kernel.js`
// 的职责之一就是按当前内核钉版重建 tarball，并把 `package-lock.json` 中
// `file:vendor/kernel/**` 条目的 integrity 同步为实际产物的 sha512
//（CI 日志：`fetch-kernel: 同步 lockfile integrity 242 个（0.1.5-rc.2）`）。
// 这是设计内行为，不是篡改；且 tarball 字节依赖构建环境——实测同一个
// 内核源码用 pnpm 11.7.0 与 12.4.2 打包得到不同的 sha512，无需改任何源码。
// 因此内核缓存未命中时，这 242 行必然与提交值不同，裸 diff 必然失败。
//
// 本门禁保留原有价值：受管清单（package.json + package-lock.json）之外的
// 任何改动、以及 lockfile 中内核 integrity 之外的任何改动，一律失败。
//
// 放宽 integrity 比较不降低供应链强度：这 242 个 tarball 的真实校验发生在
// `npm ci`（EINTEGRITY）——由 scripts/npm-ci-with-kernel.mjs 用同步后的
// integrity 执行，哈希不匹配时安装直接失败。

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** CI 门禁覆盖的受管清单（与原 `git diff --exit-code -- <这两个文件>` 同范围）。 */
export const MANAGED_MANIFESTS = ['dsh-desktop/package.json', 'dsh-desktop/package-lock.json'];

/** 必须逐字节不变的受管清单。fetch-kernel 只临时改写它们再原样还原。 */
const UNTOUCHED_MANIFESTS = ['dsh-desktop/package.json'];

const LOCKFILE = 'dsh-desktop/package-lock.json';
const KERNEL_MARKER = 'file:vendor/kernel/';
const INTEGRITY_LINE = /^\s*"integrity":\s*"sha512-/;

function gitDiff(repoRoot, args) {
  return execFileSync('git', ['diff', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** 把 `git diff` 输出按 hunk 切分，只保留每个 hunk 的正文行。 */
function splitHunks(diffText) {
  const hunks = [];
  let current = null;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('@@')) {
      current = [];
      hunks.push(current);
      continue;
    }
    if (current && (line.startsWith(' ') || line.startsWith('+'))) current.push(line);
    else if (current && line.startsWith('-')) current.push(line);
  }
  return hunks;
}

const isChange = (line) => line.startsWith('+') || line.startsWith('-');

/**
 * 校验 lockfile 的差异是否限于「内核 tarball 的 integrity 同步」。
 * @returns {string[]} 违规描述；空数组表示通过。
 */
export function lockfileViolations(repoRoot) {
  const diffText = gitDiff(repoRoot, ['--', LOCKFILE]);
  if (diffText.trim() === '') return [];

  const violations = [];
  for (const hunk of splitHunks(diffText)) {
    if (!hunk.some((line) => line.includes(KERNEL_MARKER))) {
      const changed = hunk.filter(isChange).map((line) => line.slice(0, 120));
      violations.push(`lockfile 出现与内核 tarball 无关的改动：\n      ${changed.join('\n      ')}`);
      continue;
    }
    const unexpected = hunk
      .filter(isChange)
      .filter((line) => !INTEGRITY_LINE.test(line.slice(1)))
      .map((line) => line.slice(0, 120));
    if (unexpected.length > 0) {
      violations.push(`内核条目内出现 integrity 之外的改动：\n      ${unexpected.join('\n      ')}`);
    }
  }
  return violations;
}

/**
 * 运行门禁。范围与原命令一致：只看受管清单这两个文件。
 * @returns {{ok: boolean, violations: string[], kernelIntegrityLines: number}}
 */
export function checkManifestDrift(repoRoot) {
  const changed = gitDiff(repoRoot, ['--name-only', '--', ...MANAGED_MANIFESTS])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const violations = [];
  for (const file of changed) {
    if (UNTOUCHED_MANIFESTS.includes(file)) {
      violations.push(`${file}: 不应被构建过程改动（只允许 lockfile 同步内核 integrity）`);
    }
  }

  let kernelIntegrityLines = 0;
  if (changed.includes(LOCKFILE)) {
    kernelIntegrityLines = gitDiff(repoRoot, ['--', LOCKFILE])
      .split('\n')
      .filter((line) => line.startsWith('-') && INTEGRITY_LINE.test(line.slice(1))).length;
    violations.push(...lockfileViolations(repoRoot));
  }

  return { ok: violations.length === 0, violations, kernelIntegrityLines };
}

const isEntryPoint = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  const repoRoot = process.argv[2] ?? process.cwd();
  try {
    const { ok, violations, kernelIntegrityLines } = checkManifestDrift(repoRoot);
    if (ok) {
      console.log(
        `check-manifest-drift: 通过（无清单漂移；内核 tarball integrity 同步 ${kernelIntegrityLines} 行，已由 npm ci 校验）`,
      );
    } else {
      console.error('check-manifest-drift: 检测到清单漂移');
      for (const violation of violations) console.error(`  - ${violation}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('check-manifest-drift:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
