'use strict';

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/i;

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`[stage] ${label} 无法读取或解析: ${file} (${error.message})`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireFile(file, label) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(`[stage] 缺少${label}: ${file}`);
  }
}

/** Resolve the immutable application commit without any network access. */
export function resolveBuildCommit(root, env = process.env) {
  const supplied = env.GITHUB_SHA || env.GIT_COMMIT || env.DSH_BUILD_COMMIT;
  if (supplied && COMMIT_PATTERN.test(supplied)) return supplied.toLowerCase();
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (COMMIT_PATTERN.test(commit)) return commit.toLowerCase();
  } catch {}
  throw new Error('[stage] 无法解析构建 commit：需要 GITHUB_SHA 或本地 Git HEAD');
}

/**
 * Run the repository's offline validator and collect the exact lock bytes used
 * by staging.  This deliberately invokes the CLI rather than duplicating its
 * manifest/tree/registry checks in the packaging script.
 */
export function validatePluginLock(root, { buildCommit } = {}) {
  const projectRoot = path.resolve(root);
  const validator = path.join(projectRoot, 'dsh-desktop', 'scripts', 'plugin-sync.mjs');
  requireFile(validator, '插件 lock validator');
  try {
    execFileSync(process.execPath, [validator, 'validate', '--locked'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch (error) {
    throw new Error(`[stage] 插件 lock 离线校验失败：${error.message}`);
  }

  const lockPath = path.join(projectRoot, '.sync', 'plugins.lock.json');
  const packagePath = path.join(projectRoot, 'dsh-desktop', 'package.json');
  requireFile(lockPath, '插件 lock');
  requireFile(packagePath, '应用 package.json');
  const bytes = readFileSync(lockPath);
  const packageJson = readJson(packagePath, '应用 package.json');
  if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
    throw new Error('[stage] 应用 package.json 缺少有效 version');
  }
  const resolvedCommit = buildCommit || resolveBuildCommit(projectRoot);
  if (!COMMIT_PATTERN.test(resolvedCommit)) {
    throw new Error(`[stage] 构建 commit 格式无效: ${resolvedCommit}`);
  }
  return {
    source: lockPath,
    bytes,
    sha256: sha256(bytes),
    applicationVersion: packageJson.version,
    buildCommit: resolvedCommit.toLowerCase(),
  };
}

/** Copy the validated lock without reserializing it, preserving its digest. */
export function copyPluginLock(metadata, stagedDesktop) {
  if (!metadata || !Buffer.isBuffer(metadata.bytes) || !/^[a-f0-9]{64}$/.test(metadata.sha256)) {
    throw new Error('[stage] 无法复制无效的插件 lock 元数据');
  }
  mkdirSync(stagedDesktop, { recursive: true });
  const destination = path.join(stagedDesktop, 'plugin-lock.json');
  copyFileSync(metadata.source, destination);
  const copied = readFileSync(destination);
  if (sha256(copied) !== metadata.sha256 || !copied.equals(metadata.bytes)) {
    throw new Error('[stage] staged plugin-lock.json 与已校验 lock 不一致');
  }
  return destination;
}

export function pluginLockManifest(metadata) {
  return {
    path: 'dsh-desktop/plugin-lock.json',
    sha256: metadata.sha256,
    applicationVersion: metadata.applicationVersion,
    buildCommit: metadata.buildCommit,
  };
}
