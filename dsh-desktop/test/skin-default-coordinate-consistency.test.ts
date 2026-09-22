// 默认皮肤回退坐标一致性门禁（Task 6.2.1）。
//
// 背景：`host-profile.json` 的 `fallbackSkin` 是**手写副本**。10c6461
//（canonical 制品切换）把它落库时抄的是切换前旧制品的摘要 `0b3eca84…`，
// 而同一次切换已把 lock / 制品 / resolved snapshot 全部改成 `eb8142e4…`。
// 原 `stage-7-canonical-source.test.ts` 只做 `/^sha256:[a-f0-9]{64}$/` 正则断言，
// 不比对 lock，所以 CI 一直绿，缺陷存活到 Task 6.2。
//
// 本门禁把四处坐标钉到同一事实源 `lock.default.sha256`（ADR 0003：
// 「`fallbackSkin` = `system.default` 坐标与所需摘要，由 build lock 提供」），
// 任一处漂移即红：
//   1. tauri-shell/host-profile.json                        fallbackSkin.{id,version,digest}
//   2. tauri-shell/skin-manager-artifact.lock.json          default.{package,version,sha256}
//   3. tauri-shell/artifacts/system.default-2.0.0.dshpack.tar   实际字节 sha256
//   4. tauri-shell/artifacts/resolved/system.default/snapshot.json  package/version/digest
//
// 同时防止「第三方 active 摘要」与「默认回退摘要」被混为一谈：默认回退坐标
// 恒为 `system.default`，快照 digest 只能取自 lock，不能取自任何第三方绑定。

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]): string => readFileSync(join(repoRoot, ...parts), 'utf8');
const readJson = <T>(...parts: string[]): T => JSON.parse(read(...parts)) as T;

const HOST_PROFILE = ['tauri-shell', 'host-profile.json'];
const LOCK = ['tauri-shell', 'skin-manager-artifact.lock.json'];
const SNAPSHOT = ['tauri-shell', 'artifacts', 'resolved', 'system.default', 'snapshot.json'];
const ARTIFACT = ['tauri-shell', 'artifacts', 'system.default-2.0.0.dshpack.tar'];

const SHA256_HEX = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

interface HostProfile {
  id: string;
  version: string;
  slots: { id: string; fallbackSkin: string }[];
  fallbackSkin: { id: string; version: string; digest: string };
}

interface Lock {
  resolvedRoot: string;
  generation: number;
  manager: { artifact: string; sha256: string };
  default: { package: string; version: string; sourceCommit: string; artifact: string; sha256: string };
}

interface Snapshot {
  package: string;
  version: string;
  digest: string;
  generation: number;
  assets: Record<string, string>;
  slotAssets: Record<string, string[]>;
  fault: string | null;
}

const profile = readJson<HostProfile>(...HOST_PROFILE);
const lock = readJson<Lock>(...LOCK);
const snapshot = readJson<Snapshot>(...SNAPSHOT);

const artifactSha256 = (): string =>
  createHash('sha256').update(readFileSync(join(repoRoot, ...ARTIFACT))).digest('hex');

test('默认制品字节摘要与 lock 声明一致（默认制品本身未漂移）', () => {
  assert.match(lock.default.sha256, SHA256_HEX, 'lock.default.sha256 必须是 64 位小写十六进制');
  assert.equal(lock.default.artifact, 'system.default-2.0.0.dshpack.tar');
  assert.equal(artifactSha256(), lock.default.sha256, '制品字节与 lock 声明不一致');
  assert.match(lock.default.sourceCommit, COMMIT, 'lock.default.sourceCommit 必须是 40 位提交号');
});

test('host-profile 的默认回退坐标与 lock 逐字段一致（0b3eca84…/eb8142e4… 回归门禁）', () => {
  assert.equal(
    profile.fallbackSkin.digest,
    `sha256:${lock.default.sha256}`,
    'host-profile.fallbackSkin.digest 与 lock.default.sha256 漂移：默认回退坐标必须由 build lock 供给，不得手写副本',
  );
  assert.equal(profile.fallbackSkin.id, lock.default.package, '回退包 id 与 lock.default.package 不一致');
  assert.equal(profile.fallbackSkin.version, lock.default.version, '回退包版本与 lock.default.version 不一致');
  assert.match(profile.fallbackSkin.digest, DIGEST);
});

test('resolved 默认快照坐标与 lock 一致（默认启动链路的消费坐标）', () => {
  assert.equal(snapshot.digest, `sha256:${lock.default.sha256}`, 'snapshot.digest 与 lock.default.sha256 漂移');
  assert.equal(snapshot.package, lock.default.package, 'snapshot.package 与 lock.default.package 不一致');
  assert.equal(snapshot.version, lock.default.version, 'snapshot.version 与 lock.default.version 不一致');
  assert.equal(snapshot.fault, null, '默认快照不得携带 fault');
});

test('默认回退坐标是单一事实源，不与其他摘要混为一谈', () => {
  // host-profile 里只允许出现一个 sha256 摘要：默认回退坐标。任何第三方
  // active 摘要（或第二份手写副本）出现在这里都会让两件事混为一谈。
  const digests = read(...HOST_PROFILE).match(/sha256:[a-f0-9]{64}/g) ?? [];
  assert.deepEqual(digests, [profile.fallbackSkin.digest], 'host-profile 只能声明默认回退摘要一处');
  assert.equal(profile.fallbackSkin.id, 'system.default');
  assert.equal(snapshot.package, 'system.default', '默认快照坐标不得被第三方包名替换');
  assert.equal(lock.resolvedRoot, 'resolved/system.default', '默认回退根必须是 resolved/system.default');
  assert.ok(lock.generation >= 1, '默认代次必须是正数 generation');
});

test('每个 slot 的 fallbackSkin 引用同一默认包 id（不引第三方）', () => {
  assert.ok(profile.slots.length > 0);
  for (const slot of profile.slots) {
    assert.equal(slot.fallbackSkin, profile.fallbackSkin.id, `slot ${slot.id} 的回退引用与默认包 id 不一致`);
  }
});

test('壳层快照门禁按 lock 比对摘要，而不是只做正则断言', () => {
  const main = read('tauri-shell', 'src', 'main.rs');
  assert.match(main, /\/default\/sha256/, '壳层必须从 lock 取默认制品摘要');
  assert.match(main, /snapshot\.digest == format!\("sha256:\{(?:locked_default_digest)?\}"(?:, locked_default_digest)?\)/,
    '壳层必须把 snapshot.digest 与 lock 摘要做等值比对');
});

test('壳层把 HostProfile 回退坐标也钉到同一 lock（不只在打包期检查）', () => {
  const main = read('tauri-shell', 'src', 'main.rs');
  assert.match(main, /HOST_PROFILE: &str = include_str!/, 'HostProfile 必须编进二进制参与校验');
  assert.match(main, /fallbackSkin/, '壳层必须读取 HostProfile 的 fallbackSkin 坐标');
  assert.match(main, /fn ui_skin_fallback_coordinate_matches_lock/, '缺少回退坐标一致性校验函数');
  assert.match(main, /ui_skin_fallback_coordinate_matches_lock\(\)/,
    '一致性校验必须在快照门禁里被真正调用');
});
