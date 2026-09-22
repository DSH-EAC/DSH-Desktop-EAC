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
const SNAPSHOT = ['tauri-shell', 'artifacts', 'resolved', 'snapshot.json'];
const PROVENANCE = ['tauri-shell', 'artifacts', 'resolved', 'manifest.json'];
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
  snapshot: string;
  provenance: string;
  generation: number;
  manager: { artifact: string; sha256: string };
  default: { package: string; version: string; sourceCommit: string; artifact: string; sha256: string };
}

interface SlotBinding {
  slot: string;
  package: { id: string; version: string; digest: string };
  contribution: string;
  generation: number;
  state: string;
}

// Task 6.2.3：快照不再是"单一 system.default 坐标"，而是 manager 产出的**逐槽**
// active binding 快照（`dsh-eac-active-binding-snapshot@1`）+ resolved 资源树。
// 这里校验的不变量与 6.2.1 相同（默认制品身份不得漂移、不得被第三方冒充），
// 只是改为对着逐槽结构断言。
interface Snapshot {
  schema: string;
  profile: { id: string; version: string };
  generation: number;
  createdAt: string;
  bindings: SlotBinding[];
  assets: { key: string; path: string; sha256: string }[];
  slotAssets: Record<string, string[]>;
  fault: string | null;
}

interface Provenance {
  schema: string;
  producer: string;
  artifact: { name: string; sha256: string; package: string; version: string; sourceCommit: string };
  profile: { id: string; version: string };
  generation: number;
  snapshotSha256: string;
  resolvedAssets: number;
  resolvedBytes: number;
}

const profile = readJson<HostProfile>(...HOST_PROFILE);
const lock = readJson<Lock>(...LOCK);
const snapshot = readJson<Snapshot>(...SNAPSHOT);
const provenance = readJson<Provenance>(...PROVENANCE);

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

test('resolved 逐槽快照与 lock 一致（默认启动链路的消费坐标）', () => {
  assert.equal(snapshot.schema, 'dsh-eac-active-binding-snapshot@1', '快照协议版本必须是 @1');
  assert.equal(snapshot.profile.id, profile.id, '快照 profile 与 HostProfile 不一致');
  assert.equal(snapshot.profile.version, profile.version, '快照 profile 版本与 HostProfile 不一致');
  assert.equal(snapshot.fault, null, '默认快照不得携带 fault');
  assert.equal(snapshot.generation, lock.generation, '快照 generation 与 lock.generation 漂移');
  assert.equal(snapshot.createdAt, snapshot.createdAt.trim());
  assert.ok(snapshot.createdAt.length > 0, '快照必须带创建时间');
  // 六个 slot 全部绑定，且每个绑定都是 active。
  const slots = profile.slots.map(({ id }) => id);
  assert.deepEqual(
    [...snapshot.bindings.map(({ slot }) => slot)].sort(),
    [...slots].sort(),
    '快照必须完整覆盖 HostProfile 的 slot 集合',
  );
  for (const binding of snapshot.bindings) {
    assert.equal(binding.state, 'active', `${binding.slot} 的绑定状态必须是 active`);
    assert.equal(binding.generation, snapshot.generation, `${binding.slot} 的 binding generation 必须同代`);
  }
});

test('默认制品身份由 lock 供给，快照不得用第三方摘要冒充默认包', () => {
  // 与壳层 default_binding_matches_lock 同一不变量：凡 id 等于 lock 默认包名的
  // 绑定，version/digest 必须逐字段等于 lock 的默认制品坐标。
  const defaultBindings = snapshot.bindings.filter(({ package: pkg }) => pkg.id === lock.default.package);
  assert.ok(defaultBindings.length > 0, '默认包必须至少在一个 slot 上生效');
  for (const binding of defaultBindings) {
    assert.equal(binding.package.version, lock.default.version, `${binding.slot} 默认包版本与 lock 漂移`);
    assert.equal(
      binding.package.digest,
      `sha256:${lock.default.sha256}`,
      `${binding.slot} 默认包摘要与 lock.default.sha256 漂移`,
    );
    assert.equal(binding.package.id, 'system.default', '默认快照坐标不得被第三方包名替换');
  }
  // 默认回退路径仍是 lock 钉住的制品：resolved 树里的清单副本必须与制品同代同源。
  const resolvedManifest = readJson<{ metadata: { id: string; version: string } }>(
    'tauri-shell', 'artifacts', 'resolved', 'skin.json',
  );
  assert.equal(resolvedManifest.metadata.id, lock.default.package);
  assert.equal(resolvedManifest.metadata.version, lock.default.version);
});

test('resolved 树自带产出记录，逐字段可复算', () => {
  assert.equal(provenance.schema, 'dsh-eac-resolved-provenance@1');
  assert.match(provenance.producer, /ui-skin-manager/);
  assert.equal(provenance.artifact.name, lock.default.artifact);
  assert.equal(provenance.artifact.sha256, lock.default.sha256, '产出记录里的制品摘要必须等于 lock');
  assert.equal(provenance.artifact.sha256, artifactSha256(), '产出记录里的制品摘要必须等于制品实际字节');
  assert.equal(provenance.artifact.sourceCommit, lock.default.sourceCommit);
  assert.equal(provenance.profile.id, profile.id);
  assert.equal(provenance.profile.version, profile.version);
  assert.equal(provenance.generation, snapshot.generation, '产出记录 generation 与快照漂移');
  assert.equal(
    provenance.snapshotSha256,
    createHash('sha256').update(readFileSync(join(repoRoot, ...SNAPSHOT))).digest('hex'),
    '产出记录的 snapshotSha256 必须等于磁盘上的快照字节',
  );
  assert.equal(provenance.resolvedAssets, snapshot.assets.length);
  assert.ok(provenance.resolvedAssets > 0);
});

test('resolved 资源逐条落在本代目录内且摘要与磁盘一致', () => {
  // 宿主只服务 snapshot 清单里的资源；这里把"清单即白名单"在装配期钉死：
  // 每条资源路径必须是 gen-<snapshot.generation>/<key>，字节摘要必须与记录相同。
  const generationPrefix = `gen-${snapshot.generation}/`;
  assert.ok(snapshot.assets.length > 0, '默认快照必须解析出资源');
  for (const asset of snapshot.assets) {
    assert.equal(asset.path, `${generationPrefix}${asset.key}`, `${asset.key} 的路径必须属于本代目录`);
    const bytes = readFileSync(join(repoRoot, 'tauri-shell', 'artifacts', 'resolved', ...asset.path.split('/')));
    // 摘要写法是跨仓接口的一部分（binding 与资源清单同用 `sha256:<hex>`）。
    assert.match(asset.sha256, /^sha256:[a-f0-9]{64}$/, `${asset.key} 的摘要必须带 sha256: 前缀`);
    assert.equal(
      `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      asset.sha256,
      `${asset.key} 与磁盘字节不一致`,
    );
  }
  // 每个 slot 至少有一条可服务资源，且引用的 key 都在清单里。
  const keys = new Set(snapshot.assets.map(({ key }) => key));
  for (const [slot, assets] of Object.entries(snapshot.slotAssets)) {
    assert.ok(assets.length > 0, `slot ${slot} 没有可服务资源`);
    for (const key of assets) assert.ok(keys.has(key), `slot ${slot} 引用了未解析的 ${key}`);
  }
  // 无人可服务的资源不得留在清单里（白名单等于快照本身）。
  const referenced = new Set(Object.values(snapshot.slotAssets).flat());
  for (const key of keys) assert.ok(referenced.has(key), `${key} 已解析但没有 slot 可以服务它`);
});

test('默认回退坐标是单一事实源，不与其他摘要混为一谈', () => {
  // host-profile 里只允许出现一个 sha256 摘要：默认回退坐标。任何第三方
  // active 摘要（或第二份手写副本）出现在这里都会让两件事混为一谈。
  const digests = read(...HOST_PROFILE).match(/sha256:[a-f0-9]{64}/g) ?? [];
  assert.deepEqual(digests, [profile.fallbackSkin.digest], 'host-profile 只能声明默认回退摘要一处');
  assert.equal(profile.fallbackSkin.id, 'system.default');
  // 6.2.3：消费根不再把包名写进路径——它是**快照根**，包身份由 snapshot.json 决定。
  assert.equal(lock.resolvedRoot, 'resolved', '消费根必须是快照根 resolved，不得钉死某个包目录');
  assert.equal(lock.snapshot, 'snapshot.json');
  assert.ok(lock.generation >= 1, '默认代次必须是正数 generation');
});

test('每个 slot 的 fallbackSkin 引用同一默认包 id（不引第三方）', () => {
  assert.ok(profile.slots.length > 0);
  for (const slot of profile.slots) {
    assert.equal(slot.fallbackSkin, profile.fallbackSkin.id, `slot ${slot.id} 的回退引用与默认包 id 不一致`);
  }
});

test('壳层快照门禁按 lock 比对默认包身份，而不是只做正则断言', () => {
  const main = read('tauri-shell', 'src', 'main.rs');
  assert.match(main, /\/default\/sha256/, '壳层必须从 lock 取默认制品摘要');
  // 6.2.3：单一 `snapshot.digest` 字段已随逐槽快照取消，身份比对改为逐 binding
  // 与 lock 等值（default_binding_matches_lock），并在快照校验里被真正调用。
  assert.match(main, /fn default_binding_matches_lock/, '缺少默认包身份锁函数');
  assert.match(
    main,
    /binding\.package\.digest == format!\("sha256:\{digest\}"\)/,
    '壳层必须把默认包 binding 的 digest 与 lock 摘要做等值比对',
  );
  assert.match(main, /default_binding_matches_lock\(binding\)/,
    '默认包身份锁必须在快照门禁里被真正调用');
});

test('消费根是快照根，不再把某个包名钉进宿主路径', () => {
  const main = read('tauri-shell', 'src', 'main.rs');
  // 6.2.3 的核心：宿主不得假设 active 包叫 system.default。资源根只能拼到
  // `ui-skin-manager/resolved`（快照根），包名/版本/摘要全部来自 snapshot.json。
  assert.match(main, /join\("ui-skin-manager"\)\.join\("resolved"\)/,
    '消费根必须拼到 ui-skin-manager/resolved 快照根');
  assert.doesNotMatch(main, /resolved"\)\s*\.join\("system\.default"\)/,
    '宿主路径不得再钉死 system.default');
  assert.doesNotMatch(main, /artifacts"\)\s*\.join\("resolved"\)\s*\.join\("system\.default"\)/,
    '宿主路径不得再钉死 system.default');
  // 逐槽资源白名单 + 摘要绑定仍在。
  assert.match(main, /fn ui_skin_manager_asset/, '缺少快照资源通道');
  assert.match(main, /sha256_hex/, '资源通道必须按字节校验摘要');
});

test('壳层把 HostProfile 回退坐标也钉到同一 lock（不只在打包期检查）', () => {
  const main = read('tauri-shell', 'src', 'main.rs');
  assert.match(main, /HOST_PROFILE: &str = include_str!/, 'HostProfile 必须编进二进制参与校验');
  assert.match(main, /fallbackSkin/, '壳层必须读取 HostProfile 的 fallbackSkin 坐标');
  assert.match(main, /fn ui_skin_fallback_coordinate_matches_lock/, '缺少回退坐标一致性校验函数');
  assert.match(main, /ui_skin_fallback_coordinate_matches_lock\(\)/,
    '一致性校验必须在快照门禁里被真正调用');
});
