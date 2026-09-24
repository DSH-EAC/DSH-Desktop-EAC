#!/usr/bin/env node
// 发布资产归集（`.github/workflows/release.yml` 的发布前最后一步，纯本地）。
//
// Why 需要它：`actions/download-artifact@v4` 会把每个 artifact 还原成它上传时的
// 目录结构（`tauri-shell/target/release/bundle/...`），而 Windows x64 与 arm64 的
// 便携包文件名相同（`Deepseek-Harness-EAC-<ver>-portable.zip`）、`SHA256SUMS.txt`
// 也同名。直接平铺上传会让后者静默覆盖前者——正是发布链路里最难发现的一类错误。
//
// 因此本脚本：平铺 → 重名时加 `-<os>-<arch>` 后缀 → 再校验一次没有重名；
// 同时输出 `release-manifest.json`（每个资产的来源 artifact、路径、大小、sha256）
// 和 `SHA256SUMS.txt`（对最终资产名取校验和，供下载者核对）。
//
// 三个模式（都不联网，便于本地复现）：
//   --in <dir> --out <dir>            归集资产
//   --list                            按 manifest 打印待上传路径（每行一个）
//   --verify <published.json>          用 `gh release view --json ...` 的落盘结果核对远端
//
// 用法：
//   node dsh-desktop/scripts/collect-release-assets.mjs --in artifacts --out dist
//   node dsh-desktop/scripts/collect-release-assets.mjs --list
//   node dsh-desktop/scripts/collect-release-assets.mjs --verify published-release.json

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RELEASE_ARTIFACTS } from './release-artifacts.mjs';

const DIST_DIR = 'dist';
const MANIFEST_NAME = 'release-manifest.json';

/** artifact 内部以仓库根为基准的相对路径；只保留真正的发布物。 */
const KEEP_EXTENSIONS = ['.exe', '.zip', '.deb', '.appimage', '.txt'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** 后缀消歧：在扩展名前插入 `-<os>-<arch>`。 */
export function disambiguate(fileName, os, arch) {
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  return `${stem}-${os}-${arch}${ext}`;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * 归集资产。返回 {assets, checksumFile, manifestFile}。
 * assets: [{target, origin, os, arch, sourcePath, bytes, sha256}]
 */
export function collectReleaseAssets({ inDir, outDir, artifacts = RELEASE_ARTIFACTS }) {
  const missingDirs = artifacts
    .map(({ artifact }) => path.join(inDir, artifact))
    .filter((dir) => !existsSync(dir));
  if (missingDirs.length > 0) {
    throw new Error(`缺少 artifact 目录：\n  - ${missingDirs.join('\n  - ')}`);
  }

  // 第一轮：按 (os, arch) 收集候选，先不做名字决策。
  const candidates = [];
  for (const { artifact, os, arch } of artifacts) {
    const root = path.join(inDir, artifact);
    for (const file of walk(root)) {
      if (!KEEP_EXTENSIONS.includes(path.extname(file).toLowerCase())) continue;
      candidates.push({ os, arch, artifact, sourcePath: file, base: path.basename(file) });
    }
  }
  if (candidates.length === 0) throw new Error(`${inDir} 下没有找到任何发布资产`);

  // 只接受预期的文件总数：四个 artifact 各应产出固定数量的发布物。
  // 数量对不上说明上游打包步骤变了，宁可失败也不要发布一份来路不明的集合。
  const baseCounts = new Map();
  for (const item of candidates) baseCounts.set(item.base, (baseCounts.get(item.base) ?? 0) + 1);

  const assets = [];
  const taken = new Set();
  for (const item of candidates) {
    const target = baseCounts.get(item.base) === 1 ? item.base : disambiguate(item.base, item.os, item.arch);
    if (taken.has(target)) throw new Error(`资产重名未被消解：${target}`);
    taken.add(target);
    assets.push({ ...item, target });
  }
  assets.sort((a, b) => a.target.localeCompare(b.target));

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const rows = [];
  for (const asset of assets) {
    const dest = path.join(outDir, asset.target);
    writeFileSync(dest, readFileSync(asset.sourcePath));
    rows.push({
      target: asset.target,
      origin: asset.artifact,
      os: asset.os,
      arch: asset.arch,
      sourcePath: path.relative(inDir, asset.sourcePath).split(path.sep).join('/'),
      bytes: statSync(dest).size,
      sha256: sha256(dest),
    });
  }

  const checksumFile = path.join(outDir, 'SHA256SUMS.txt');
  writeFileSync(checksumFile, `${rows.map((row) => `${row.sha256}  ${row.target}`).join('\n')}\n`);
  rows.push({
    target: 'SHA256SUMS.txt',
    origin: '(generated)',
    os: '',
    arch: '',
    sourcePath: '',
    bytes: statSync(checksumFile).size,
    sha256: sha256(checksumFile),
  });

  // release-manifest.json 无法把自己的哈希写进自己，因此不进入 assets；
  // 它由 `manifestName` 单独登记，`--list` / `--verify` 会把它算进上传集合。
  writeFileSync(
    path.join(outDir, MANIFEST_NAME),
    `${JSON.stringify(
      { generatedAt: new Date().toISOString(), manifestName: MANIFEST_NAME, assets: rows },
      null,
      2,
    )}\n`,
  );

  return { assets: rows, checksumFile, manifestFile: path.join(outDir, MANIFEST_NAME) };
}

function readManifest(dir = DIST_DIR) {
  const file = path.join(dir, MANIFEST_NAME);
  if (!existsSync(file)) throw new Error(`找不到 ${file}（先执行归集步骤）`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** 待上传集合 = 已哈希资产 + manifest 自身（manifest 无法登记自己的哈希）。 */
function uploadTargets(manifest) {
  return [...manifest.assets.map((row) => row.target), manifest.manifestName ?? MANIFEST_NAME];
}

/** --list：输出待上传路径，每行一个（交给 `mapfile` 读入，避免分词）。 */
export function listUploadPaths(dir = DIST_DIR) {
  return uploadTargets(readManifest(dir)).map((target) => `${dir}/${target}`);
}

/**
 * --verify：核对远端 Release 的资产集合与 manifest 是否一致。
 * @returns {string[]} 违规描述；空数组表示通过。
 */
export function verifyPublishedAssets(publishedPath, dir = DIST_DIR) {
  const published = JSON.parse(readFileSync(publishedPath, 'utf8'));
  const manifest = readManifest(dir);
  const want = uploadTargets(manifest).sort();
  const have = (published.assets ?? []).map((row) => row.name).sort();
  const violations = [];
  const missing = want.filter((name) => !have.includes(name));
  const unexpected = have.filter((name) => !want.includes(name));
  if (missing.length > 0) violations.push(`远端缺少资产：${missing.join(', ')}`);
  if (unexpected.length > 0) violations.push(`远端出现 manifest 之外的资产：${unexpected.join(', ')}`);
  // 大小也核一遍：上传被截断时名字仍在，只有字节数能暴露。
  for (const row of manifest.assets) {
    const remote = (published.assets ?? []).find((item) => item.name === row.target);
    if (remote && typeof remote.size === 'number' && remote.size !== row.bytes) {
      violations.push(`${row.target}: 远端 ${remote.size} 字节 ≠ 本地 ${row.bytes} 字节`);
    }
  }
  return violations;
}

function parseArgs(argv) {
  const args = { in: '', out: DIST_DIR, list: false, verify: '' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--in') args.in = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--list') args.list = true;
    else if (argv[i] === '--verify') args.verify = argv[++i];
  }
  return args;
}

const isEntryPoint = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.list) {
      for (const file of listUploadPaths(args.out)) console.log(file);
    } else if (args.verify) {
      const violations = verifyPublishedAssets(args.verify, args.out);
      if (violations.length > 0) {
        console.error('collect-release-assets: 远端资产核对失败');
        for (const violation of violations) console.error(`  - ${violation}`);
        process.exitCode = 1;
      } else {
        console.log('collect-release-assets: 远端资产核对通过');
      }
    } else if (args.in) {
      const { assets, checksumFile, manifestFile } = collectReleaseAssets({ inDir: args.in, outDir: args.out });
      console.log(`collect-release-assets: 归集 ${assets.length} 个资产 -> ${args.out}`);
      for (const row of assets) {
        console.log(`  ${row.target}  ${(row.bytes / 1048576).toFixed(1)} MiB  <- ${row.origin}`);
      }
      console.log(`  ${path.basename(checksumFile)} / ${path.basename(manifestFile)}`);
    } else {
      throw new Error(
        '用法：collect-release-assets.mjs --in <artifacts-dir> --out <dist-dir> [--list | --verify <published.json>]',
      );
    }
  } catch (error) {
    console.error('collect-release-assets:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
