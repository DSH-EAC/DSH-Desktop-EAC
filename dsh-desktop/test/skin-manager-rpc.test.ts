import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// v6 Task 6.2.4：导入管理 UI 的 coordinator RPC 适配层测试。
//
// 分三层，逐层加强：
//   1. 契约层（无 manager）：缺 manager / 缺状态根时必须给可定位 fault，且**不写**
//      用户真实数据目录，也不伪装成功；
//   2. 适配层（假 manager）：能力缺口要被探测出来而不是假装可用；显式动作语义
//      （导入不启用、选择只落草稿、只有 apply 会写快照）；未审计能力要显式声明不可用；
//   3. 集成层（真 manager）：使用本仓锁定 tgz 与第三方夹具，以打包态布局运行。
//      缺失或损坏制品直接失败，不依赖相邻仓库，不允许跳过。

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.join(here, '..');
const eacRoot = path.join(desktopRoot, '..');

const ADAPTER = path.join(desktopRoot, 'lib', 'desktop', 'skin-manager.js');
const HOST_PROFILE = path.join(eacRoot, 'tauri-shell', 'host-profile.json');
const OFFICIAL_ARCHIVE = path.join(eacRoot, 'tauri-shell', 'artifacts', 'system.default-2.0.0.dshpack.tar');
const THIRD_PARTY_ID = 'io.github.dsh-eac-community.fixture-session';

const require = createRequire(import.meta.url);

interface Adapter {
  init(deps: Record<string, unknown>): void;
  invoke(method: string, params?: unknown): Promise<Record<string, unknown>>;
  SKIN_MANAGER_METHODS: string[];
}

/** 每个用例一份全新实例：适配层缓存了 manager 加载结果，共享会串配置。 */
function freshAdapter(env: Record<string, string | undefined>, userDataDir: string): Adapter {
  const file = require.resolve(ADAPTER);
  delete require.cache[file];
  const mod = require(file) as Adapter;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  mod.init({
    log: () => { /* 测试里不落日志 */ },
    resourceRoot: () => '',
    isPackaged: () => false,
    userDataDir: () => userDataDir,
  });
  return mod;
}

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function clearSkinEnv(): void {
  for (const key of ['DSH_UI_SKIN_MANAGER_SRC', 'DSH_UI_SKIN_MANAGER_STATE', 'DSH_UI_SKIN_MANAGER_RESOLVED', 'DSH_UI_SKIN_MANAGER_PROFILE', 'DSH_UI_SKIN_MANAGER_DIR']) {
    delete process.env[key];
  }
}

function faultOf(result: Record<string, unknown>): { code: string; message: string; nextStep: string } {
  const fault = result['fault'] as { code?: string; message?: string; nextStep?: string } | undefined;
  assert.ok(fault, '失败结果必须带 fault');
  assert.equal(typeof fault.code, 'string');
  assert.ok(fault.code.length > 0, 'fault.code 必须可定位');
  assert.ok((fault.nextStep ?? '').length > 0, 'fault.nextStep 必须给出下一步');
  return { code: fault.code as string, message: fault.message ?? '', nextStep: fault.nextStep ?? '' };
}

// ── 1. 契约层 ────────────────────────────────────────────────────────────────
test('缺 manager 时给出可定位 fault，不伪装可用', async () => {
  const state = tempDir('skin-adapt-');
  const userData = path.join(state, 'user-data');
  const emptyResources = path.join(state, 'empty-resources');
  fs.mkdirSync(emptyResources, { recursive: true });
  const adapter = freshAdapter({
    DSH_UI_SKIN_MANAGER_SRC: undefined,
    DSH_UI_SKIN_MANAGER_DIR: emptyResources,
    DSH_UI_SKIN_MANAGER_STATE: path.join(state, 'state'),
    DSH_UI_SKIN_MANAGER_RESOLVED: path.join(state, 'resolved'),
    DSH_UI_SKIN_MANAGER_PROFILE: HOST_PROFILE,
  }, userData);

  const status = await adapter.invoke('skin.status');
  assert.equal(status['ok'], true, 'status 本身要成功返回，让 UI 能渲染「不可用 + 原因」');
  const manager = status['manager'] as Record<string, unknown>;
  assert.equal(manager['available'], false);
  const fault = manager['fault'] as Record<string, unknown>;
  assert.equal(fault['code'], 'MANAGER_NOT_INSTALLED');

  for (const method of ['skin.list', 'skin.apply', 'skin.inspect', 'skin.import']) {
    const result = await adapter.invoke(method, { archivePath: path.join(state, 'x.tar') });
    assert.equal(result['ok'], false, method + ' 在缺 manager 时不得成功');
    faultOf(result);
  }
});

test('显式指定的 manager 来源无效时报错，不静默回退到钉住制品', async () => {
  const state = tempDir('skin-adapt-');
  const adapter = freshAdapter({
    DSH_UI_SKIN_MANAGER_SRC: path.join(state, 'no-manager-here'),
    DSH_UI_SKIN_MANAGER_STATE: path.join(state, 'state'),
    DSH_UI_SKIN_MANAGER_RESOLVED: path.join(state, 'resolved'),
    DSH_UI_SKIN_MANAGER_PROFILE: HOST_PROFILE,
  }, path.join(state, 'user-data'));

  const result = await adapter.invoke('skin.list');
  assert.equal(result['ok'], false);
  assert.equal(faultOf(result).code, 'MANAGER_SOURCE_INVALID');
});

test('开发态没有状态根时拒绝，而不是写用户真实数据目录', async () => {
  const state = tempDir('skin-adapt-');
  const userData = path.join(state, 'user-data');
  const adapter = freshAdapter({
    DSH_UI_SKIN_MANAGER_SRC: path.join(state, 'no-manager-here'),
    DSH_UI_SKIN_MANAGER_STATE: undefined,
    DSH_UI_SKIN_MANAGER_RESOLVED: path.join(state, 'resolved'),
    DSH_UI_SKIN_MANAGER_PROFILE: HOST_PROFILE,
  }, userData);

  const result = await adapter.invoke('skin.apply');
  assert.equal(result['ok'], false);
  assert.equal(faultOf(result).code, 'STATE_ROOT_UNCONFIGURED');
  assert.equal(fs.existsSync(userData), false, '不得在用户数据目录里创建任何东西');
});

test('未知方法给出可用方法清单', async () => {
  const adapter = freshAdapter({}, tempDir('skin-adapt-'));
  const result = await adapter.invoke('skin.nope');
  assert.equal(result['ok'], false);
  const fault = faultOf(result);
  assert.equal(fault.code, 'UNKNOWN_METHOD');
  assert.match(fault.nextStep, /skin\.status/);
  assert.ok(adapter.SKIN_MANAGER_METHODS.includes('skin.apply'));
});

// ── 2. 适配层（假 manager） ──────────────────────────────────────────────────
/**
 * 最小假 manager：只实现适配层真正会调的那些面。用来确定性地验证
 * 能力探测 / 显式动作语义 / fault 映射——这些不该依赖真 manager 的具体实现。
 */
function writeFakeManager(dir: string, options: {withImport?: boolean; importErrorCode?: string; publishErrorCode?: string} = {}): string {
  const packageRoot = path.join(dir, 'package');
  fs.mkdirSync(path.join(packageRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'fake-skin-manager', version: '9.9.9', type: 'module' }));
  const withImport = options.withImport !== false;
  const source = `
import fs from "node:fs";
import path from "node:path";

export class PackageCatalog {
  static async open(indexPath) {
    const catalog = new PackageCatalog();
    catalog.indexPath = indexPath;
    try { catalog.items = JSON.parse(fs.readFileSync(indexPath, "utf8")).packages ?? []; } catch { catalog.items = []; }
    return catalog;
  }
  list() { return this.items.map((item) => ({ ...item })); }
  get(id, version) { return this.items.find((item) => item.manifest.metadata.id === id && item.manifest.metadata.version === version); }
  install(entry) { this.items.push(entry); return entry; }
  async persist() {
    fs.mkdirSync(path.dirname(this.indexPath), { recursive: true });
    fs.writeFileSync(this.indexPath, JSON.stringify({ schema: "dsh-eac-package-catalog@1", packages: this.items }, null, 2));
  }
}

export class PackageInstaller {
  constructor(options) { this.root = options.root; this.catalog = options.catalog; }
  inspect() { return { manifest: { metadata: { id: "fake.pkg", version: "1.0.0", name: "Fake" }, contributions: [{ slot: "session" }] }, archiveSha256: "a".repeat(64), container: "canonical", manifestPath: "skin.json" }; }
  ${withImport ? `async importArchive() {
    ${options.importErrorCode ? `const error = new Error("fake install failure"); error.code = ${JSON.stringify(options.importErrorCode)}; throw error;` : ''}
    const installed = { manifest: { metadata: { id: "fake.pkg", version: "1.0.0", name: "Fake" }, contributions: [{ slot: "session" }] }, versionPath: this.root, digest: "sha256:" + "a".repeat(64), source: "local", archiveSha256: "a".repeat(64), container: "canonical", installedAt: new Date().toISOString(), official: false };
    this.catalog.install(installed);
    await this.catalog.persist();
    return { installed, official: false, targetPath: this.root, container: "canonical", archiveSha256: "a".repeat(64), idempotent: false };
  }` : ''}
}

export class BindingStore {
  constructor(directory) { this.directory = directory; }
  async committed() { return {}; }
  async previous() { return {}; }
}

export async function publishActiveSnapshot(request) {
  ${options.publishErrorCode ? `const error = new Error("fake publish failure"); error.code = ${JSON.stringify(options.publishErrorCode)}; throw error;` : ''}
  const snapshot = { schema: "dsh-eac-active-binding-snapshot@1", profile: { id: request.profile.id, version: request.profile.version }, generation: request.generation, createdAt: new Date().toISOString(), bindings: request.selection.map((item) => ({ slot: item.slot, package: { id: item.packageId, version: item.packageVersion, digest: "sha256:" + "a".repeat(64) }, contribution: "skin.json#/contributions/0", generation: request.generation, state: "active" })), assets: [], slotAssets: {}, fault: null };
  fs.mkdirSync(request.resolvedRoot, { recursive: true });
  fs.writeFileSync(path.join(request.resolvedRoot, "snapshot.json"), JSON.stringify(snapshot, null, 2));
  return { snapshot, snapshotPath: path.join(request.resolvedRoot, "snapshot.json"), generationRoot: path.join(request.resolvedRoot, "gen-" + request.generation), bindings: { generation: request.generation, bindings: {} }, written: [] };
}

export async function readActiveSnapshot(resolvedRoot) {
  try { return JSON.parse(fs.readFileSync(path.join(resolvedRoot, "snapshot.json"), "utf8")); } catch { return undefined; }
}
`;
  fs.writeFileSync(path.join(packageRoot, 'src', 'index.ts'), source);
  return packageRoot;
}

test('能力缺口被探测出来：缺 importArchive 的 manager 不得被当成可用', async () => {
  const state = tempDir('skin-adapt-');
  const packageRoot = writeFakeManager(path.join(state, 'fake'), { withImport: false });
  const adapter = freshAdapter({
    DSH_UI_SKIN_MANAGER_SRC: packageRoot,
    DSH_UI_SKIN_MANAGER_STATE: path.join(state, 'state'),
    DSH_UI_SKIN_MANAGER_RESOLVED: path.join(state, 'resolved'),
    DSH_UI_SKIN_MANAGER_PROFILE: HOST_PROFILE,
  }, path.join(state, 'user-data'));

  const status = await adapter.invoke('skin.status');
  assert.equal(status['ok'], true);
  const capabilities = status['capabilities'] as Record<string, unknown>;
  assert.equal(capabilities['install'], false, '缺 importArchive 必须被探测为 install=false');
  assert.equal(capabilities['catalog'], true);

  // 能力门禁在 openEnv 里先于读盘发生：缺能力时连「文件在不在」都不该问，
  // 因为无论如何都做不了这件事——先报「本版本不提供」比先报路径更诚实。
  const imported = await adapter.invoke('skin.import', { archivePath: path.join(state, 'whatever.tar') });
  assert.equal(imported['ok'], false, '缺能力的 manager 不得报告导入成功');
  const fault = faultOf(imported);
  assert.equal(fault.code, 'MANAGER_CAPABILITY_MISSING');
  assert.match(fault.message, /importArchive/);
  assert.match(fault.nextStep, /重钉/, '下一步要指向重钉制品，而不是让操作者换文件');
});

test('导入失败带 manager 的稳定 code 与下一步', async () => {
  const state = tempDir('skin-adapt-');
  const packageRoot = writeFakeManager(path.join(state, 'fake'), { importErrorCode: 'INSTALL_DIGEST_MISMATCH' });
  const adapter = freshAdapter({
    DSH_UI_SKIN_MANAGER_SRC: packageRoot,
    DSH_UI_SKIN_MANAGER_STATE: path.join(state, 'state'),
    DSH_UI_SKIN_MANAGER_RESOLVED: path.join(state, 'resolved'),
    DSH_UI_SKIN_MANAGER_PROFILE: HOST_PROFILE,
  }, path.join(state, 'user-data'));
  const archive = path.join(state, 'package.tar');
  fs.writeFileSync(archive, 'bytes');

  const imported = await adapter.invoke('skin.import', { archivePath: archive });
  const importedFault = faultOf(imported);
  assert.equal(imported['ok'], false, JSON.stringify(importedFault));
  assert.equal(importedFault.code, 'INSTALL_DIGEST_MISMATCH');
  assert.match(importedFault.nextStep, /摘要/, '下一步必须是人能执行的动作');
});

test('显式动作语义：导入不启用、选择只落草稿、只有 apply 写快照', async () => {
  const state = tempDir('skin-adapt-');
  const packageRoot = writeFakeManager(path.join(state, 'fake'));
  const resolved = path.join(state, 'resolved');
  const adapter = freshAdapter({
    DSH_UI_SKIN_MANAGER_SRC: packageRoot,
    DSH_UI_SKIN_MANAGER_STATE: path.join(state, 'state'),
    DSH_UI_SKIN_MANAGER_RESOLVED: resolved,
    DSH_UI_SKIN_MANAGER_PROFILE: HOST_PROFILE,
  }, path.join(state, 'user-data'));
  const archive = path.join(state, 'package.tar');
  fs.writeFileSync(archive, 'bytes');

  const imported = await adapter.invoke('skin.import', { archivePath: archive });
  assert.equal(imported['ok'], true, '导入失败: ' + JSON.stringify(imported['fault'] ?? {}));
  assert.equal(imported['enabled'], false, '导入不得顺手启用');
  assert.equal(imported['official'], false);
  assert.equal(fs.existsSync(path.join(resolved, 'snapshot.json')), false, '导入不得写快照');

  const selected = await adapter.invoke('skin.select', { slot: 'session', packageId: 'fake.pkg', packageVersion: '1.0.0' });
  assert.equal(selected['ok'], true);
  assert.equal(selected['applied'], false, '选择只是草稿，不得应用');
  assert.equal(fs.existsSync(path.join(resolved, 'snapshot.json')), false, '选择不得写快照');

  const status = await adapter.invoke('skin.status');
  const slots = status['slots'] as Array<Record<string, unknown>>;
  const session = slots.find((slot) => slot['id'] === 'session');
  assert.deepEqual(session?.['selected'], { packageId: 'fake.pkg', packageVersion: '1.0.0' });

  const applied = await adapter.invoke('skin.apply');
  assert.equal(applied['ok'], true, 'apply 失败: ' + JSON.stringify(applied['fault'] ?? {}));
  assert.equal(applied['reloadRequired'], true, '新世代要重载窗口才生效，不得谎称已热替换');
  const snapshot = applied['snapshot'] as Record<string, unknown>;
  assert.equal(snapshot['generation'], 1);
  assert.equal(fs.existsSync(path.join(resolved, 'snapshot.json')), true);
});

test('选择拒绝未知 slot 与未安装坐标（不猜默认坐标）', async () => {
  const state = tempDir('skin-adapt-');
  const packageRoot = writeFakeManager(path.join(state, 'fake'));
  const adapter = freshAdapter({
    DSH_UI_SKIN_MANAGER_SRC: packageRoot,
    DSH_UI_SKIN_MANAGER_STATE: path.join(state, 'state'),
    DSH_UI_SKIN_MANAGER_RESOLVED: path.join(state, 'resolved'),
    DSH_UI_SKIN_MANAGER_PROFILE: HOST_PROFILE,
  }, path.join(state, 'user-data'));

  const unknownSlot = await adapter.invoke('skin.select', { slot: 'nope', packageId: 'fake.pkg', packageVersion: '1.0.0' });
  const unknownFault = faultOf(unknownSlot);
  assert.equal(unknownSlot['ok'], false, JSON.stringify(unknownFault));
  assert.equal(unknownFault.code, 'SLOT_UNKNOWN');

  const notInstalled = await adapter.invoke('skin.select', { slot: 'session', packageId: 'fake.pkg', packageVersion: '1.0.0' });
  const notInstalledFault = faultOf(notInstalled);
  assert.equal(notInstalled['ok'], false, JSON.stringify(notInstalledFault));
  assert.equal(notInstalledFault.code, 'PACKAGE_NOT_INSTALLED');
});

test('6.2.5 面按真实接口探测：缺接口的 manager 不得被当成可用', async () => {
  const state = tempDir('skin-adapt-');
  const packageRoot = writeFakeManager(path.join(state, 'fake'));
  const adapter = freshAdapter({
    DSH_UI_SKIN_MANAGER_SRC: packageRoot,
    DSH_UI_SKIN_MANAGER_STATE: path.join(state, 'state'),
    DSH_UI_SKIN_MANAGER_RESOLVED: path.join(state, 'resolved'),
    DSH_UI_SKIN_MANAGER_PROFILE: HOST_PROFILE,
  }, path.join(state, 'user-data'));

  const diagnose = await adapter.invoke('skin.diagnose');
  assert.equal(diagnose['ok'], true, JSON.stringify(diagnose['fault'] ?? {}));
  const capabilities = diagnose['capabilities'] as Record<string, unknown>;
  // 假 manager 没有实现 6.2.5 接口：探测必须是 false，而不是假装已接回。
  assert.equal(capabilities['recovery'], false, '缺 recoverSlotTransactions：必须报不可用');
  assert.equal(capabilities['forceEnable'], false, '缺 DurableForceEnableController：必须报不可用');
  assert.equal(capabilities['journal'], false, '缺 TransactionJournal：必须报不可用');
  const unavailable = diagnose['unavailable'] as Array<Record<string, unknown>>;
  assert.ok(unavailable.some((item) => item['capability'] === 'recovery.execute'));
  assert.ok(unavailable.some((item) => item['capability'] === 'forceEnable'));
  for (const item of unavailable) {
    assert.equal(item['reason'], 'CAPABILITY_UNAUDITED');
    assert.ok(String(item['note'] ?? '').length > 0);
  }
  // 缺接口时恢复执行必须拒绝，不得伪装成功。
  const recovered = await adapter.invoke('skin.recover');
  assert.equal(recovered['ok'], false);
  assert.equal(faultOf(recovered).code, 'MANAGER_CAPABILITY_MISSING');
  const forced = await adapter.invoke('skin.force-enable', { action: 'keep', slot: 'session' });
  assert.equal(forced['ok'], false);
  assert.equal(faultOf(forced).code, 'MANAGER_CAPABILITY_MISSING');
});

// ── 2b. 打包态布局（isPackaged=true）：resolved 根必须在可写用户数据目录 ─────
//
// 6.2.4 返工的核心回归：旧实现把 active 快照写进安装资源目录——生产上（Program
// Files）可能只读，且一旦写入就覆盖「不可变默认回退」。这三条用例把读取链钉死：
//   1. 打包态 resolvedRoot 必须落在 <userData>/ui-skin-manager/resolved，
//      环境变量（DSH_UI_SKIN_MANAGER_RESOLVED 等）在打包态一律被忽略；
//   2. 安装资源目录只读时，Apply 的新世代仍然发布成功、且不触碰安装目录；
//   3. 宿主 Rust 侧（main.rs `ui_skin_manager_root`）按同一约定读：用户根有
//      snapshot.json 才消费它，否则回退随包只读默认根（由 Rust 测试
//      `user_resolved_root_wins_over_packaged_default_only_when_it_has_a_snapshot` 钉住）。
function freshPackagedAdapter(env: Record<string, string | undefined>, userDataDir: string, resourceRoot: string): Adapter {
  const file = require.resolve(ADAPTER);
  delete require.cache[file];
  const mod = require(file) as Adapter;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  mod.init({
    log: () => { /* 测试里不落日志 */ },
    resourceRoot: () => resourceRoot,
    isPackaged: () => true,
    userDataDir: () => userDataDir,
  });
  return mod;
}

/** 装配一份打包态资源布局：manager 钉住制品 + host-profile + 只读默认 resolved 根。 */
function writePackagedResourceLayout(root: string): void {
  const managerDir = path.join(root, 'ui-skin-manager');
  fs.mkdirSync(managerDir, { recursive: true });
  // 校验与生产 staging 相同的锁定制品字节。
  const lock = JSON.parse(fs.readFileSync(path.join(eacRoot, 'tauri-shell', 'skin-manager-artifact.lock.json'), 'utf8'));
  for (const item of [lock.manager, lock.default]) {
    const bytes = fs.readFileSync(path.join(eacRoot, 'tauri-shell', 'artifacts', item.artifact));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
  }
  fs.copyFileSync(
    path.join(eacRoot, 'tauri-shell', 'artifacts', 'dsh-eac-ui-skin-manager-0.1.0-preview.1.tgz'),
    path.join(managerDir, 'dsh-eac-ui-skin-manager-0.1.0-preview.1.tgz'),
  );
  fs.copyFileSync(HOST_PROFILE, path.join(managerDir, 'host-profile.json'));
  // 随包默认快照根：只读兜底，测试中它的 mtime/内容必须全程不变。
  const resolved = path.join(managerDir, 'resolved');
  fs.mkdirSync(resolved, { recursive: true });
  fs.writeFileSync(path.join(resolved, 'snapshot.json'), JSON.stringify({ schema: 'dsh-eac-active-binding-snapshot@1', generation: 1 }));
}

test('打包态：active 快照根落在用户数据目录，开发态环境变量被忽略', async () => {
  const state = tempDir('skin-pack-');
  const userData = path.join(state, 'user-data');
  const resources = path.join(state, 'resources');
  writePackagedResourceLayout(resources);
  // 打包态下这些变量必须一律失效（release 没有任何环境变量能改根）。
  const adapter = freshPackagedAdapter({
    DSH_UI_SKIN_MANAGER_RESOLVED: path.join(state, 'evil-resolved'),
    DSH_UI_SKIN_MANAGER_STATE: path.join(state, 'evil-state'),
    DSH_UI_SKIN_MANAGER_SRC: path.join(state, 'evil-src'),
  }, userData, resources);

  const status = await adapter.invoke('skin.status');
  assert.equal(status['ok'], true, JSON.stringify(status['fault'] ?? {}));
  const stateInfo = status['state'] as Record<string, unknown>;
  assert.equal(stateInfo['stateRoot'], path.join(userData, 'ui-skin-manager'), '状态根必须在 userData 下');
  assert.equal(
    stateInfo['resolvedRoot'],
    path.join(userData, 'ui-skin-manager', 'resolved'),
    '打包态 active 快照根必须是 <userData>/ui-skin-manager/resolved，不是安装资源目录',
  );
  const manager = status['manager'] as Record<string, unknown>;
  assert.equal(manager['available'], true, '打包态必须经钉住制品加载 manager: ' + JSON.stringify(status));
  assert.equal(manager['source'], 'pinned-artifact', '打包态来源必须是钉住制品，而不是被忽略的环境变量');
  assert.equal(fs.existsSync(path.join(state, 'evil-resolved')), false, '被打包态忽略的变量不得落盘');
  assert.equal(fs.existsSync(path.join(state, 'evil-state')), false);
  assert.equal(fs.existsSync(path.join(state, 'evil-src')), false);
});

test('打包态：安装资源目录只读时 Apply 仍成功，且安装目录零改动', async (t) => {
  const state = tempDir('skin-pack-');
  const userData = path.join(state, 'user-data');
  const resources = path.join(state, 'resources');
  writePackagedResourceLayout(resources);
  const packagedResolved = path.join(resources, 'ui-skin-manager', 'resolved');
  const packagedSnapshot = path.join(packagedResolved, 'snapshot.json');
  const beforeBytes = fs.readFileSync(packagedSnapshot);
  const beforeMtime = fs.statSync(packagedSnapshot).mtimeMs;

  // 安装目录只读（Windows 上 chmod 对目录 ACL 影响有限，但 NTFS 尊重只读位到
  // 文件创建/写入层级；无论如何本测试的关键断言是「内容零改动」）。
  // Keep the directory readable/searchable on POSIX; the assertion is that the
  // application does not write it, not that the test removes its own read access.
  fs.chmodSync(packagedResolved, 0o555);
  fs.chmodSync(path.join(resources, 'ui-skin-manager'), 0o555);

  const adapter = freshPackagedAdapter({
    DSH_UI_SKIN_MANAGER_RESOLVED: undefined,
    DSH_UI_SKIN_MANAGER_STATE: undefined,
  }, userData, resources);

  const status = await adapter.invoke('skin.status');
  assert.equal(status['ok'], true);
  assert.equal((status['capabilities'] as Record<string, unknown>)?.['install'], true, JSON.stringify(status));

  // 默认回退坐标必须在 catalog 里（未选中的 slot 由 profile fallbackSkin 解析）。
  const official = await adapter.invoke('skin.import', { archivePath: OFFICIAL_ARCHIVE });
  assert.equal(official['ok'], true, '导入默认制品失败: ' + JSON.stringify(official['fault'] ?? {}));

  const applied = await adapter.invoke('skin.apply');
  assert.equal(applied['ok'], true, '只读安装目录下 Apply 必须仍然成功: ' + JSON.stringify(applied['fault'] ?? {}));
  assert.equal(applied['reloadRequired'], true);

  // 新世代落在用户数据目录，宿主读取链（Rust）会从同一相对布局找到它。
  const userSnapshot = path.join(userData, 'ui-skin-manager', 'resolved', 'snapshot.json');
  assert.equal(fs.existsSync(userSnapshot), true, 'active 快照必须发布到可写用户数据目录');
  const published = JSON.parse(fs.readFileSync(userSnapshot, 'utf8'));
  assert.ok(Number(published['generation']) >= 1);
  assert.equal(published['bindings'].length, 6, '六个 slot 全覆盖（未选中的走 profile 默认回退）');

  // 读回一致性：UI 展示的状态必须来自 manager 写出的快照。
  const readback = await adapter.invoke('skin.status');
  const snapshot = readback['snapshot'] as Record<string, unknown>;
  assert.equal(snapshot['generation'], published['generation'], '读回世代必须与发布世代一致');

  // 不可变默认回退：随包快照内容与 mtime 全程不变（运行时从不写安装资源目录）。
  assert.deepEqual(fs.readFileSync(packagedSnapshot), beforeBytes, '随包默认快照不得被运行时改写');
  assert.equal(fs.statSync(packagedSnapshot).mtimeMs, beforeMtime, '随包默认快照 mtime 不得变化');
  assert.equal(
    fs.readdirSync(packagedResolved).filter((name) => name !== 'snapshot.json').length,
    0,
    '安装资源目录里不得出现任何新世代目录',
  );

  fs.chmodSync(packagedResolved, 0o755);
  fs.chmodSync(path.join(resources, 'ui-skin-manager'), 0o755);
});

// ── 3. 集成层：本仓固定制品，干净 CI 不依赖相邻源码仓库 ───────────────
test('真 manager（pinned tgz）：导入 → 逐 slot 选择 → Apply → 读回 → Revert', async () => {
  const thirdParty = path.join(here, 'fixtures', 'skin-manager', THIRD_PARTY_ID + '-1.0.0.dshpack.tar');
  assert.equal(createHash('sha256').update(fs.readFileSync(thirdParty)).digest('hex'),
    'c86daf979731f5de819af72dd1819d129e8c41259f86f5bf04df8adb91d431bc');
  const state = tempDir('skin-it-');
  const userData = path.join(state, 'user-data');
  const resources = path.join(state, 'resources');
  writePackagedResourceLayout(resources);
  const resolved = path.join(userData, 'ui-skin-manager', 'resolved');
  const adapter = freshPackagedAdapter({}, userData, resources);
  console.log('packaged skin integration roots: ' + JSON.stringify({ userData, resources, resolved }));

  const status = await adapter.invoke('skin.status');
  assert.equal(status['ok'], true, '真 manager 下 status 必须成功: ' + JSON.stringify(status['fault'] ?? {}));
  const capabilities = status['capabilities'] as Record<string, unknown>;
  assert.equal(capabilities['install'], true, '钉住制品必须提供 importArchive');
  assert.equal(capabilities['snapshot'], true, '钉住制品必须提供 publishActiveSnapshot');
  const manager = status['manager'] as Record<string, unknown>;
  assert.equal(manager['source'], 'pinned-artifact');

  // 默认回退坐标必须先在 catalog 里，publish 才能解析未选中的 slot。
  const official = await adapter.invoke('skin.import', { archivePath: OFFICIAL_ARCHIVE });
  assert.equal(official['ok'], true, '导入默认制品失败: ' + JSON.stringify(official['fault'] ?? {}));
  assert.equal(official['enabled'], false);

  const third = await adapter.invoke('skin.import', { archivePath: thirdParty });
  assert.equal(third['ok'], true, '导入第三方包失败: ' + JSON.stringify(third['fault'] ?? {}));
  const thirdPartyPackage = third['package'] as Record<string, unknown>;
  assert.equal(thirdPartyPackage['packageId'], THIRD_PARTY_ID);

  const listed = await adapter.invoke('skin.list');
  const installed = listed['installed'] as Array<Record<string, unknown>>;
  const thirdEntry = installed.find((item) => item['packageId'] === THIRD_PARTY_ID);
  assert.ok(thirdEntry, '已装列表里应有第三方包');
  assert.equal(thirdEntry['origin'], 'third-party', '第三方来源必须标出来');

  const selected = await adapter.invoke('skin.select', { slot: 'session', packageId: THIRD_PARTY_ID, packageVersion: '1.0.0' });
  assert.equal(selected['ok'], true, '选择失败: ' + JSON.stringify(selected['fault'] ?? {}));

  const applied = await adapter.invoke('skin.apply');
  assert.equal(applied['ok'], true, 'apply 失败: ' + JSON.stringify(applied['fault'] ?? {}));
  const appliedSnapshot = applied['snapshot'] as Record<string, unknown>;
  const appliedSlots = appliedSnapshot['slots'] as Array<Record<string, unknown>>;
  const sessionBinding = appliedSlots.find((slot) => slot['slot'] === 'session');
  assert.equal(sessionBinding?.['packageId'], THIRD_PARTY_ID, 'session 应绑到第三方包');
  // 未选中的 slot 走 profile 的 fallbackSkin —— 由 manager 决定，不是适配层挑的。
  const sidebar = appliedSlots.find((slot) => slot['slot'] === 'top-sidebar');
  assert.equal(sidebar?.['packageId'], 'system.default');
  assert.equal(fs.existsSync(path.join(resolved, 'snapshot.json')), true, 'apply 必须落快照');
  assert.ok(Number(appliedSnapshot['generation']) >= 1);

  const reopened = freshPackagedAdapter({}, userData, resources);
  const readback = await reopened.invoke('skin.status');
  assert.deepEqual(readback['snapshot'], appliedSnapshot, '重新加载适配层必须读回同一快照');
  const disk = JSON.parse(fs.readFileSync(path.join(resolved, 'snapshot.json'), 'utf8'));
  assert.equal(disk.generation, appliedSnapshot['generation']);

  // 单 slot 回退：回到 profile 的默认回退坐标。
  const reverted = await adapter.invoke('skin.revert', { slot: 'session' });
  assert.equal(reverted['ok'], true, '单 slot 回退失败: ' + JSON.stringify(reverted['fault'] ?? {}));
  const revertedSnapshot = reverted['snapshot'] as Record<string, unknown>;
  const revertedSlots = revertedSnapshot['slots'] as Array<Record<string, unknown>>;
  assert.equal(revertedSlots.find((slot) => slot['slot'] === 'session')?.['packageId'], 'system.default');
  assert.ok(Number(revertedSnapshot['generation']) > Number(appliedSnapshot['generation']), '回退是新的一代');

  // 再选一次并整代回退：目标世代取自 manager 的 previous-known-good。
  assert.equal((await adapter.invoke('skin.select', { slot: 'session', packageId: THIRD_PARTY_ID, packageVersion: '1.0.0' }))['ok'], true);
  assert.equal((await adapter.invoke('skin.apply'))['ok'], true);
  const wholeRevert = await adapter.invoke('skin.revert');
  assert.equal(wholeRevert['ok'], true, '整代回退失败: ' + JSON.stringify(wholeRevert['fault'] ?? {}));

  const diagnose = await adapter.invoke('skin.diagnose');
  assert.equal(diagnose['ok'], true);
  assert.ok((diagnose['faults'] as unknown[]).length >= 0);
  const finalStatus = await adapter.invoke('skin.status');
  assert.equal((finalStatus['manager'] as Record<string, unknown>)['available'], true);

  clearSkinEnv();
});

test('真 manager 下：摘要不符时拒绝导入并给出下一步', async () => {
  const state = tempDir('skin-it-');
  const resources = path.join(state, 'resources');
  writePackagedResourceLayout(resources);
  const adapter = freshPackagedAdapter({}, path.join(state, 'user-data'), resources);

  const result = await adapter.invoke('skin.import', {
    archivePath: OFFICIAL_ARCHIVE,
    expectedArchiveSha256: 'f'.repeat(64),
  });
  assert.equal(result['ok'], false, '摘要不符必须拒绝');
  const fault = faultOf(result);
  assert.match(fault.code, /DIGEST|SHA256|HASH/, '应为摘要类失败，实际 ' + fault.code);
});
