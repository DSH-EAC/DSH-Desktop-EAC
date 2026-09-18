import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import fsMod from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// 项目约定：测试 import 编译产物 .js（tsc 就地产物）。
import { readJsonFile, writeFileAtomic } from '../lib/atomic-json.js'

// ---------------------------------------------------------------------------
// writeFileAtomic 两步换入回归：旧实现在 rename 瞬时失败（EPERM，Windows 杀软
// 占用）时「先删旧目标再 rename」，两步之间被杀 = 目标文件消失、数据只剩
// .tmp —— 启动关键文件（settings.yaml/.credentials.yaml/cordis.patch.yml）
// 截断即 boot 死循环。新实现先把旧目标改名 .old-<rand> 保底，换入失败还原。
// 注：lib/atomic-json.js 经 require('node:fs') 取的是 CJS 模块对象，与这里的
// default import 是同一对象，monkey-patch renameSync 才能生效。
// ---------------------------------------------------------------------------

test('writeFileAtomic：常规写入内容正确且不残留 tmp/old 文件', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-ok-'))
  try {
    const file = join(dir, 'data.json')
    writeFileAtomic(file, '{"a":1}')
    assert.equal(readFileSync(file, 'utf8'), '{"a":1}')
    const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp-') || f.includes('.old-'))
    assert.deepEqual(leftovers, [], '不应残留临时文件')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeFileAtomic：首次 rename 被占用时走两步换入，目标内容更新且旧文件清理', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-swap-'))
  const realRename = fsMod.renameSync
  try {
    const file = join(dir, 'cordis.patch.yml')
    writeFileSync(file, 'OLD-CONTENT\n', 'utf8')
    let firstRenameDone = false
    // 只拦截第一次「tmp → 目标」的 rename（模拟 Windows EPERM 瞬时占用），
    // 其余 rename（file→old、重试 tmp→file）放行。
    fsMod.renameSync = function stubbed(this: unknown, from: string, to: string) {
      if (!firstRenameDone && from.includes('.tmp-') && to === file) {
        firstRenameDone = true
        const err = new Error('EPERM: operation not permitted') as NodeJS.ErrnoException
        err.code = 'EPERM'
        throw err
      }
      return realRename.call(fsMod, from, to)
    } as typeof fsMod.renameSync
    writeFileAtomic(file, 'NEW-CONTENT\n')
    assert.equal(readFileSync(file, 'utf8'), 'NEW-CONTENT\n', '换入后目标必须是新内容')
    const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp-') || f.includes('.old-'))
    assert.deepEqual(leftovers, [], '换入成功后 .old 必须清理')
    assert.ok(firstRenameDone, '必须真的走到过失败分支')
  } finally {
    fsMod.renameSync = realRename
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeFileAtomic：换入彻底失败时旧数据不丢（还原 .old 并抛错）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-restore-'))
  const realRename = fsMod.renameSync
  try {
    const file = join(dir, 'settings.yaml')
    writeFileSync(file, 'PREVIOUS-GOOD\n', 'utf8')
    fsMod.renameSync = function alwaysFail(this: unknown, from: string, to: string) {
      // tmp → 目标 全部失败（换入彻底不可能）；file→old 与 old→file 的保底
      // rename 放行（若还原路径也被拦，任何实现都无法把数据放回目标路径，
      // 只能保证数据仍存在于 .old 而已）。
      if (from.includes('.tmp-')) {
        const err = new Error('EPERM') as NodeJS.ErrnoException
        err.code = 'EPERM'
        throw err
      }
      return realRename.call(fsMod, from, to)
    } as typeof fsMod.renameSync
    assert.throws(() => writeFileAtomic(file, 'BROKEN\n'))
    assert.equal(readFileSync(file, 'utf8'), 'PREVIOUS-GOOD\n', '旧目标必须被还原，绝不先删后写')
  } finally {
    fsMod.renameSync = realRename
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeFileAtomic：支持 Buffer 内容（restore 快照路径逐字节保真）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-buf-'))
  try {
    const file = join(dir, 'pnpm-lock.yaml')
    const buf = Buffer.from([0xef, 0xbb, 0xbf, 0x70, 0x6b, 0x67])
    writeFileAtomic(file, buf)
    assert.ok(Buffer.from(readFileSync(file)).equals(buf), 'Buffer 内容必须逐字节一致')
    assert.ok(existsSync(file))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readJsonFile：读取合法对象且不修改源文件', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-read-'))
  try {
    const file = join(dir, 'settings.json')
    const source = '{\n  "enabled": true,\n  "count": 2\n}\n'
    writeFileSync(file, source, 'utf8')
    assert.deepEqual(readJsonFile(file), { enabled: true, count: 2 })
    assert.equal(readFileSync(file, 'utf8'), source)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readJsonFile：文件缺失或 JSON 损坏时返回 null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-read-bad-'))
  try {
    assert.equal(readJsonFile(join(dir, 'missing.json')), null)
    const file = join(dir, 'broken.json')
    writeFileSync(file, '{ broken', 'utf8')
    assert.equal(readJsonFile(file), null)
    assert.equal(readFileSync(file, 'utf8'), '{ broken')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
