#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ARCHES = { x64: 'x86_64', arm64: 'aarch64' };
const DEFAULT_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
const REQUIRED_PATHS = [
  'sidecar/server.js',
  'sidecar/bridge.js',
  'dsh-desktop/package.json',
  'dsh-desktop/vendor/node/node',
  'ui-skin-manager/resolved/system.default/snapshot.json',
];

function runRpm(args, rpmFile) {
  try {
    return execFileSync('rpm', args.concat(rpmFile), { encoding: 'utf8' });
  } catch (error) {
    const detail = error && typeof error === 'object' && 'stderr' in error ? error.stderr : '';
    throw new Error(`rpm ${args.join(' ')} 失败: ${String(detail || error).trim()}`);
  }
}

function metadata(rpmFile) {
  const fields = runRpm([
    '-qip',
    '--qf',
    'name=%{NAME}\nversion=%{VERSION}\nrelease=%{RELEASE}\narch=%{ARCH}\n',
  ], rpmFile);
  return Object.fromEntries(fields.trim().split(/\r?\n/).map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function normalizePackagePath(file) {
  return file.replace(/^\/+/, '').replace(/\\/g, '/');
}

export function auditRpmPackage(rpmFile, { arch = process.arch, version = DEFAULT_VERSION } = {}) {
  const file = path.resolve(rpmFile);
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`RPM 文件不存在: ${file}`);
  const expectedArch = ARCHES[arch];
  if (!expectedArch) throw new Error(`不支持的 RPM 目标架构: ${arch}`);

  const info = metadata(file);
  if (info.arch !== expectedArch) throw new Error(`RPM 架构错误: 期望 ${expectedArch}，实际 ${info.arch}`);
  if (info.version !== version) throw new Error(`RPM 版本错误: 期望 ${version}，实际 ${info.version}`);

  const files = runRpm(['-qlp'], file).split(/\r?\n/).filter(Boolean).map(normalizePackagePath);
  return validateRpmPackage(info, files, { arch, version });
}

export function validateRpmPackage(info, files, { arch = process.arch, version = DEFAULT_VERSION } = {}) {
  const expectedArch = ARCHES[arch];
  if (!expectedArch) throw new Error(`不支持的 RPM 目标架构: ${arch}`);
  if (!info.name || !/^[A-Za-z0-9][A-Za-z0-9+._-]*$/.test(info.name)) {
    throw new Error(`RPM 包名无效: ${info.name || '(empty)'}`);
  }
  if (info.arch !== expectedArch) throw new Error(`RPM 架构错误: 期望 ${expectedArch}，实际 ${info.arch}`);
  if (info.version !== version) throw new Error(`RPM 版本错误: 期望 ${version}，实际 ${info.version}`);

  const normalizedFiles = files.map(normalizePackagePath);
  const missing = REQUIRED_PATHS.filter((required) => !normalizedFiles.some((entry) => entry.endsWith(`/${required}`) || entry === required));
  if (missing.length) throw new Error(`RPM 缺少必需运行文件: ${missing.join(', ')}`);

  const forbidden = normalizedFiles.filter((entry) => /(?:^|\/)(?:musl(?:[_-]|\/)|linuxmusl|[^/]+\.exe$|[^/]+\.dll$)/i.test(entry));
  if (forbidden.length) throw new Error(`RPM 包含不可达平台载荷: ${forbidden.join(', ')}`);
  return { name: info.name, version: info.version, release: info.release, arch: info.arch, files: normalizedFiles.length };
}

function main() {
  const rpmFile = process.argv[2];
  const archArg = process.argv.find((arg) => arg.startsWith('--arch='));
  if (!rpmFile) throw new Error('用法: node audit-rpm-package.mjs <package.rpm> [--arch=x64|arm64]');
  const result = auditRpmPackage(rpmFile, { arch: archArg ? archArg.slice('--arch='.length) : process.arch });
  console.log(`[audit-rpm] OK name=${result.name} version=${result.version}-${result.release} arch=${result.arch} files=${result.files}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error('[audit-rpm] FAILED:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
