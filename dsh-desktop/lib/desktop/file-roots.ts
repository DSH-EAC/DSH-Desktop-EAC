'use strict';

// H2/H3 路径围栏：文件还原/打开只允许「会话 cwd」之下的项目文件。
// 任意绝对路径（如写入 Startup\*.bat）一律拒绝；缓存 5 分钟。
// （ADR 0002 L2 业务服务层；Wave 1 自 file-roots.js 类型化迁出，行为零变更。）

import path = require('node:path');
import fs = require('node:fs');
import os = require('node:os');
import zlib = require('node:zlib');
// session-watcher.js 尚未类型化（Wave 3 收编），先以窄签名消费。
const { scanZstdFrames } = require('../../session-watcher') as {
  scanZstdFrames(buf: Buffer): { frames: { start: number; end: number }[] };
};

export const DANGEROUS_EXT = /\.(bat|cmd|com|exe|ps1|vbs|lnk|js|jse|msi|scr|pif|reg)$/i;

// 会话日志世代文件名（0.1.3 起含 .vN 段，见 session-watcher 同名正则）。
const SESSION_LOG_RE = /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/;

const fileRootsCache: { at: number; roots: string[] } = { at: 0, roots: [] };
// 5.3.3：按文件 mtime 增量缓存每个会话的 cwd —— 缓存过期后只重读**新增/
// 变化**的 session.jsonl.zstd（readFileSync + zstd 解压是大头），扫描会话
// 数百个、单文件数 MB 时不再整树全量重解（IPC 热路径秒级卡顿源）。
const cwdByFile = new Map<string, { mtimeMs: number; cwd: string }>();

interface SessionHeader { cwd?: unknown }

function readSessionCwd(p: string, mtimeMs: number): string {
  const cached = cwdByFile.get(p);
  if (cached && cached.mtimeMs === mtimeMs) return cached.cwd;
  let cwd = '';
  try {
    const buf = fs.readFileSync(p);
    // 未压缩 .jsonl：首行即 header；压缩走 zstd 帧扫描（v2/v0 同构）。
    if (!p.endsWith('.zstd')) {
      const header = JSON.parse(buf.toString('utf8').split('\n', 1)[0]!) as SessionHeader;
      if (header && typeof header.cwd === 'string') cwd = header.cwd;
    } else {
      const { frames } = scanZstdFrames(buf);
      if (frames.length > 0) {
        const text = zlib.zstdDecompressSync(buf.subarray(frames[0]!.start, frames[0]!.end)).toString('utf8');
        const header = JSON.parse(text.split('\n', 1)[0]!) as SessionHeader;
        if (header && typeof header.cwd === 'string') cwd = header.cwd;
      }
    }
  } catch { /* 损坏日志按空 cwd 缓存，mtime 变化才重试 */ }
  cwdByFile.set(p, { mtimeMs, cwd });
  return cwd;
}

export function fileRoots(): string[] {
  if (Date.now() - fileRootsCache.at < 5 * 60 * 1000) return fileRootsCache.roots;
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const roots: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      // 0.1.3 Session format v2：世代文件 session.v<N>.jsonl(.zstd)；v0 会话
      // 仍是 session.jsonl.zstd。根扫描认所有世代（同会话多代 cwd 相同，
      // 收进 Set 无副作用）。
      if (!SESSION_LOG_RE.test(e.name)) continue;
      try {
        const cwd = readSessionCwd(p, fs.statSync(p).mtimeMs);
        if (cwd) roots.push(cwd);
      } catch { /* stat 失败跳过 */ }
    }
  };
  walk(path.join(dshHome, 'sessions'));
  fileRootsCache.roots = [...new Set(roots)];
  fileRootsCache.at = Date.now();
  return fileRootsCache.roots;
}

function realPathWithMissingLeaf(p: string): string {
  let cursor = path.resolve(p);
  const missing: string[] = [];
  for (;;) {
    try {
      return path.resolve(fs.realpathSync.native(cursor), ...missing);
    } catch {
      const parent = path.dirname(cursor);
      if (parent === cursor) return path.resolve(p);
      missing.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
}

export function isPathWithinRoots(
  candidate: string,
  roots: string[],
  platform: NodeJS.Platform = process.platform,
): boolean {
  const normalize = (value: string): string => {
    const resolved = realPathWithMissingLeaf(value);
    return platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved;
  };
  const resolved = normalize(candidate);
  return roots.some((root) => {
    const normalizedRoot = normalize(root);
    return resolved === normalizedRoot || resolved.startsWith(normalizedRoot + path.sep);
  });
}

export function isUnderFileRoots(p: string): boolean {
  return isPathWithinRoots(p, fileRoots());
}
