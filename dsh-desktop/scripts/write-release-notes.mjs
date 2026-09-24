#!/usr/bin/env node
// Release notes 生成（`release.yml` 第 3 步，纯本地）。
//
// Why 不用 `gh --generate-notes`：自动笔记把「哪些提交进了这个 tag」讲清楚，
// 但对本仓库最要紧的信息——**这些安装包是哪一次 CI run 构建的**——闭口不谈。
// 发布物与验证提交的对应关系是使用者唯一能自行核对的东西，所以由脚本按
// `release-manifest.json` 与解析出的来源信息确定性生成。
//
// 只写已知事实：来源 run 的 conclusion=success 由解析步骤核验；本流程不做
// 安装/启动验证，这属于发行验收，不在本工作流职责内，因此如实写明。
//
// 用法（env 提供来源信息，args 提供文件路径）：
//   TAG=v6.0.0 SOURCE_RUN_URL=... SOURCE_SHA=... SOURCE_BRANCH=... PRERELEASE=true \
//     node dsh-desktop/scripts/write-release-notes.mjs --manifest dist/release-manifest.json \
//       --out dist/RELEASE-NOTES.md

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function shortSha(sha) {
  return String(sha || '').slice(0, 12);
}

function humanSize(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`;
}

/**
 * 生成 notes 正文。
 * @param {object} manifest collect-release-assets 产出的 manifest
 * @param {Record<string,string|undefined>} env
 */
export function renderReleaseNotes(manifest, env) {
  const runUrl = env.SOURCE_RUN_URL || '(未提供)';
  const sha = env.SOURCE_SHA || '(未提供)';
  const branch = env.SOURCE_BRANCH || '(未提供)';
  const repo = env.GITHUB_REPOSITORY || '';
  const lines = [
    `## 发布物来源`,
    '',
    `本 Release 的安装包由 CI 直接产出并上传，未在本机重新打包。`,
    '',
    '| 项 | 值 |',
    '| --- | --- |',
    `| 来源 CI run | ${runUrl} |`,
    `| 来源提交 | \`${sha}\`（${shortSha(sha)}） |`,
    `| 来源分支 | \`${branch}\` |`,
    `| 来源工作流结论 | success（发布前已由解析步骤核验） |`,
    `| pre-release | ${env.PRERELEASE === 'true' ? '是' : '否'} |`,
    '',
    '## 资产',
    '',
    '| 资产 | 大小 | 平台 | SHA-256（前 16 位） |',
    '| --- | --- | --- | --- |',
  ];
  for (const row of manifest.assets) {
    const platform = row.os && row.arch ? `${row.os}/${row.arch}` : '—';
    lines.push(`| \`${row.target}\` | ${humanSize(row.bytes)} | ${platform} | \`${row.sha256.slice(0, 16)}\` |`);
  }
  lines.push(
    '',
    '完整校验和见 `SHA256SUMS.txt`；每个资产的来源与构建路径见 `release-manifest.json`。',
    '',
    '## 边界说明',
    '',
    '- 本工作流只做「取 CI 产物 → 发布」，不在发布链路上执行安装、启动或冒烟验证；',
    '  发行验收（实机安装）是独立环节，不因此处绿灯而被视为已完成。',
    '- 安装包构建于各自原生架构的 runner 上（见来源 run 的 Installer 矩阵）。',
  );
  if (repo) lines.push(`- 仓库：\`${repo}\``);
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const args = { manifest: '', out: '' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--manifest') args.manifest = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

const isEntryPoint = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.manifest || !args.out) {
      throw new Error('用法：write-release-notes.mjs --manifest <manifest.json> --out <notes.md>');
    }
    const notes = renderReleaseNotes(JSON.parse(readFileSync(args.manifest, 'utf8')), process.env);
    writeFileSync(args.out, notes);
    console.log(`write-release-notes: 已写入 ${args.out}（${notes.split('\n').length} 行）`);
  } catch (error) {
    console.error('write-release-notes:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
