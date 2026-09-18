// 原子写 JSON/文本（tmp + rename）：先写同目录临时文件再改名替换，避免
// 写一半损坏目标文件；Windows 上 rename 可能因瞬时占用失败，先删旧文件
// 重试一次。目录自动创建。既有调用点共享相同落盘语义：
// `JSON.stringify(v, null, 2) + '\n'`。

import fs = require('node:fs');
import path = require('node:path');
import { randomBytes } from 'node:crypto';

/** Read a JSON object without mutating the source; missing or invalid files return null. */
export function readJsonFile(file: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function writeFileAtomic(file: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // 清扫同目标的历史 .old-/.tmp- 孤儿（上次换入中途被杀/还原失败的残留）：
  // 不清则每次事故永久多留一份。只认本函数自产的后缀形态。
  try {
    const dir = path.dirname(file);
    const base = path.basename(file);
    for (const e of fs.readdirSync(dir)) {
      if (e.startsWith(base + '.old-') || e.startsWith(base + '.tmp-')) {
        try { fs.rmSync(path.join(dir, e), { force: true }); } catch { /* 占用则留待下次 */ }
      }
    }
  } catch { /* 目录读不出不影响主流程 */ }
  // tmp 名含随机后缀：Date.now() 同毫秒并发写同一目标会互相踩踏
  //（先完成者 rename 走后，第二者 rename ENOENT → 误报失败）。
  const tmp = file + '.tmp-' + Date.now() + '-' + randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, content);
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Windows 上 rename 目标被瞬时占用（杀软/索引器）可能 EPERM。旧实现
    // 「先删旧目标再 rename」在两步之间被杀 = 数据只剩 .tmp、目标消失。
    // 改为两步换入：先把旧目标改名到 .old-<rand>，换入新文件成功后再删；
    // 换入失败把 .old 还原回去。收窄的窗口仍在：file→old 成功后、tmp→file
    // 成功前被杀/掉电 = 目标暂缺（完整数据在 .old-<rand>，下次写入时的
    // 清扫只清不还原 —— 该窗口是「无旧数据」而非「坏数据」，fail-visible）。
    const old = file + '.old-' + randomBytes(4).toString('hex');
    let saved = false;
    try { fs.renameSync(file, old); saved = true; } catch { /* 目标本就不存在：直接换入 */ }
    try {
      fs.renameSync(tmp, file);
    } catch (e) {
      if (saved) { try { fs.renameSync(old, file); } catch { /* 尽力还原 */ } }
      try { fs.rmSync(tmp, { force: true }); } catch { /* 尽力清理 */ }
      throw e;
    }
    if (saved) { try { fs.rmSync(old, { force: true, maxRetries: 3 }); } catch { /* 残留由下次写入清扫 */ } }
  }
}

export function writeJsonAtomic(file: string, value: unknown): void {
  writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n');
}