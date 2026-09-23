'use strict';

// v6 Task 6.2.4：导入管理 UI 的 coordinator RPC 适配层（ADR 0010）。
//
// 职责边界（本模块只做三件事）：
//   1. 定位 manager（钉住的制品 / 开发态显式覆盖）并把它的模块加载进来；
//   2. 把 UI 的**显式意图**（导入哪个压缩包、给哪个 slot 选哪个坐标、应用、回退）
//      翻译成 manager 的调用；
//   3. 把 manager 的失败原样带出来——稳定 code + 下一步，不吞成一句 toast。
//
// 明确不在这里做的事（都归 manager 决策，本层不得另写一套）：
//   * 兼容性 / 贡献面 / 资源清单的判定（validateSkinManifest / publishActiveSnapshot）
//   * 回退坐标的选择（HostProfile.fallbackSkin）
//   * 回滚目标的决定（BindingStore 的 previous-known-good）
//   * 世代号推进规则（BindingStore 提交世代 +1，越界由 manager 拒绝）
//
// 未审计能力（6.2.5 的恢复执行 / 强制确认）在本层**显式**返回 CAPABILITY_UNAUDITED，
// 不伪装可用：宁可让 UI 显示「本版本不提供」，也不能给出一个看起来成功的结果。
//
// 安全约束：
//   * 开发态覆盖（DSH_UI_SKIN_MANAGER_* 环境变量）在打包态一律忽略；
//   * 开发态不配状态根时**拒绝**而不是写用户真实数据目录；
//   * 从钉住制品解包走自带的严格 tar 读取器（限体积/条目/路径，拒绝符号链接）。

import path = require('node:path');
import fs = require('node:fs');
import crypto = require('node:crypto');
import zlib = require('node:zlib');
import { pathToFileURL } from 'node:url';

// tsc 的 `module: commonjs` 会把 `import()` 降级成 `require()`——那样加载不了 ESM，
// 也吃不了 file:// URL。manager 的包声明 type=module，必须走真正的动态 import，
// 所以用 new Function 绕开降级（`import(specifier)` 只在 ESM 语法位里才被保留）。
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;

// ── 结果封套 ─────────────────────────────────────────────────────────────────
// 失败走 `ok:false` 的正常结果而不是 JSON-RPC error：UI 需要拿到结构化的
// code/nextStep 来渲染可定位的故障，而不是一句 message。
export interface SkinFault {
  code: string;
  message: string;
  /** 给操作者的下一步（可执行动作，不是安慰话）。 */
  nextStep: string;
  detail?: Record<string, unknown>;
}

export type SkinResult = Record<string, unknown> & { ok: boolean; fault?: SkinFault | undefined };

// ── 依赖注入 ─────────────────────────────────────────────────────────────────
interface SkinManagerDeps {
  log(tag: string, msg: string): void;
  resourceRoot(): string;
  isPackaged(): boolean;
  userDataDir(): string;
}

let deps: SkinManagerDeps | undefined;

export function init(next: SkinManagerDeps): void {
  deps = next;
}

function log(tag: string, msg: string): void {
  if (deps) deps.log(tag, msg);
}

function isPackaged(): boolean {
  return deps ? deps.isPackaged() : false;
}

// ── 常量 ─────────────────────────────────────────────────────────────────────
const MANAGER_DIR = 'ui-skin-manager';
const MANAGER_ENTRY_CANDIDATES = ['src/index.ts', 'src/index.js', 'index.ts', 'index.js', 'dist/index.js'];
const SELECTION_FILE = 'selection.json';
const FAULT_LOG_FILE = 'last-fault.json';
const FAULT_RING = 50;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_EXTRACT_BYTES = 32 * 1024 * 1024;
const MAX_EXTRACT_ENTRIES = 4000;
const CAPABILITY_UNAUDITED = 'CAPABILITY_UNAUDITED';

// ── 路径解析 ─────────────────────────────────────────────────────────────────
/** 壳层资源根：打包态由 Rust spawn 注入；开发态回退到仓库根。 */
function shellResourceRoot(): string {
  const configured = deps ? deps.resourceRoot() : '';
  if (configured) return configured;
  return path.resolve(__dirname, '..', '..', '..');
}

function firstExisting(candidates: string[]): string {
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* 探测失败继续下一个候选 */ }
  }
  return '';
}

/** 开发态覆盖：打包态一律忽略（release 里没有任何环境变量能改这些根）。 */
function devOverride(name: string): string {
  if (isPackaged()) return '';
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function managerResourceDir(): string {
  const override = devOverride('DSH_UI_SKIN_MANAGER_DIR');
  if (override) return override;
  const root = shellResourceRoot();
  return firstExisting([
    path.join(root, MANAGER_DIR),
    path.join(root, 'tauri-shell', 'staged-resources', MANAGER_DIR),
  ]);
}

function hostProfilePath(): string {
  const override = devOverride('DSH_UI_SKIN_MANAGER_PROFILE');
  if (override) return override;
  const root = shellResourceRoot();
  return firstExisting([
    path.join(root, MANAGER_DIR, 'host-profile.json'),
    path.join(root, 'tauri-shell', 'staged-resources', MANAGER_DIR, 'host-profile.json'),
    path.join(root, 'tauri-shell', 'host-profile.json'),
  ]);
}

function pinnedArtifactPath(): string {
  const dir = managerResourceDir();
  if (!dir) return '';
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return '';
  }
  const tgz = entries.filter((name) => name.startsWith('dsh-eac-ui-skin-manager-') && name.endsWith('.tgz')).sort();
  const picked = tgz[tgz.length - 1];
  return picked ? path.join(dir, picked) : '';
}

/** manager 模块根：开发态覆盖 > 已解包的钉住制品 > 制品目录里现成的 package/。 */
function managerPackageCandidates(): string[] {
  const override = devOverride('DSH_UI_SKIN_MANAGER_SRC');
  if (override) return [override];
  const dir = managerResourceDir();
  if (!dir) return [];
  return [path.join(dir, 'package')];
}

// ── 状态根 ───────────────────────────────────────────────────────────────────
// 打包态：<userData>/ui-skin-manager。开发态必须显式指定，否则拒绝——开发机上的
// userData 就是用户真实安装的数据目录，静默写进去等于污染生产数据。
function stateRoot(): { ok: true; path: string } | { ok: false; fault: SkinFault } {
  const override = devOverride('DSH_UI_SKIN_MANAGER_STATE');
  if (override) return { ok: true, path: override };
  if (!isPackaged()) {
    return {
      ok: false,
      fault: {
        code: 'STATE_ROOT_UNCONFIGURED',
        message: '开发态未指定 manager 状态根；拒绝写用户真实数据目录',
        nextStep: '设置 DSH_UI_SKIN_MANAGER_STATE=<临时目录> 后再调用（打包态自动用 userData/ui-skin-manager）',
      },
    };
  }
  const base = deps ? deps.userDataDir() : '';
  if (!base) {
    return {
      ok: false,
      fault: {
        code: 'STATE_ROOT_UNAVAILABLE',
        message: '拿不到用户数据目录，无法确定 manager 状态根',
        nextStep: '检查壳层启动环境（userData 目录是否可解析）后重试',
      },
    };
  }
  return { ok: true, path: path.join(base, MANAGER_DIR) };
}

/** 随包只读默认快照根：永远不被运行时改写，是「不可变默认回退」的载体。 */
function packagedResolvedRoot(): string {
  const root = shellResourceRoot();
  const packaged = path.join(root, MANAGER_DIR, 'resolved');
  try {
    if (fs.statSync(packaged).isDirectory()) return packaged;
  } catch { /* 打包目录不存在，回退开发布局 */ }
  return path.join(root, 'tauri-shell', 'artifacts', 'resolved');
}

/**
 * active 快照根（写入侧与宿主 Rust `ui_skin_manager_root()` 的读取链同源）：
 *
 *   - 开发态覆盖优先（打包态一律忽略，release 没有任何环境变量能改它）；
 *   - 打包态：`<userData>/ui-skin-manager/resolved` —— **可写用户数据目录**。
 *     Apply 发布的新世代只写这里；随包默认快照根保持只读，宿主在用户根没有
 *     snapshot.json 时回退消费它。这修掉了旧实现把 active 写进安装资源目录
 *     （生产可能只读、且一旦写入就毁掉不可变默认回退）的缺陷；
 *   - 开发态：保持仓库布局的 `tauri-shell/artifacts/resolved`（与 Rust 开发回退一致）。
 */
function resolvedRoot(): string {
  const override = devOverride('DSH_UI_SKIN_MANAGER_RESOLVED');
  if (override) return override;
  if (isPackaged()) {
    const base = deps ? deps.userDataDir() : '';
    // 拿不到用户数据目录时回退到只读默认根：status/diagnose 仍能渲染真实状态，
    // openEnv 会因 stateRoot() 报错而拒绝任何写操作——不会假装可写。
    if (base) return path.join(base, MANAGER_DIR, 'resolved');
  }
  return packagedResolvedRoot();
}

// ── 严格 tar 读取（只用于解包钉住的 npm-pack 制品） ──────────────────────────
// 不引入新依赖：sidecar 的装配闭包是显式清单，多一个包就多一处装配面。这里的
// 读取器只接受普通文件，拒绝符号链接/硬链接/绝对路径/.. 逃逸，并限体积与条目数。
interface TarEntry {
  name: string;
  body: Buffer;
}

function readTarGz(archive: Buffer, limits: {maxBytes: number; maxEntries: number}): TarEntry[] {
  const tar = zlib.gunzipSync(archive);
  const entries: TarEntry[] = [];
  let offset = 0;
  let pendingName: string | undefined;
  let pendingPax: Record<string, string> = {};
  let total = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    offset += 512;
    const readString = (start: number, length: number): string => {
      const raw = header.subarray(start, start + length);
      const end = raw.indexOf(0);
      return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8').trim();
    };
    const name = readString(0, 100);
    const sizeText = readString(124, 12).trim();
    const typeFlag = String.fromCharCode(header[156] ?? 0x30);
    const prefix = readString(345, 155);
    const size = sizeText ? parseInt(sizeText, 8) : 0;
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('tar: 非法的条目长度');
    const body = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;

    if (typeFlag === 'x' || typeFlag === 'X') {
      // pax 扩展头：`<len> <key>=<value>\n`，只取我们关心的两个键。
      const text = body.toString('utf8');
      pendingPax = {};
      for (const line of text.split('\n')) {
        const match = /^(\d+) ([^=]+)=([\s\S]*)$/.exec(line);
        if (match) pendingPax[match[2] ?? ''] = match[3] ?? '';
      }
      continue;
    }
    if (typeFlag === 'L') {
      pendingName = body.toString('utf8').replace(/\0+$/, '');
      continue;
    }
    if (typeFlag === 'g') continue; // 全局 pax 头：本制品不需要

    const fullName = (pendingPax['path'] ?? (prefix ? prefix + '/' + name : name) ?? pendingName ?? '');
    const entryName = pendingName ?? fullName;
    pendingName = undefined;
    pendingPax = {};

    if (typeFlag === '5') continue; // 目录
    if (typeFlag !== '0' && typeFlag !== '\0') {
      throw new Error('tar: 制品含非普通文件条目（拒绝符号链接/硬链接/设备）: ' + entryName);
    }
    if (!entryName) continue;
    total += size;
    if (total > limits.maxBytes) throw new Error('tar: 解包体积超过上限');
    if (entries.length >= limits.maxEntries) throw new Error('tar: 条目数超过上限');
    entries.push({ name: entryName, body: Buffer.from(body) });
  }
  return entries;
}

/** 路径围栏：相对路径 + 归一化后必须仍在目标根内。 */
function safeJoin(root: string, relative: string): string {
  if (path.isAbsolute(relative)) throw new Error('tar: 条目使用绝对路径: ' + relative);
  const normalized = path.normalize(relative);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error('tar: 条目逃出解包根: ' + relative);
  }
  const target = path.join(root, normalized);
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('tar: 条目逃出解包根: ' + relative);
  return target;
}

function sha256Hex(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** 把钉住制品解包到状态根下的缓存（按制品摘要分目录，天然幂等）。 */
function extractPinnedArtifact(archivePath: string, stateDir: string): { ok: true; packageRoot: string; archiveSha256: string } | { ok: false; fault: SkinFault } {
  let archive: Buffer;
  try {
    archive = fs.readFileSync(archivePath);
  } catch (error) {
    return {
      ok: false,
      fault: {
        code: 'MANAGER_ARTIFACT_UNREADABLE',
        message: '钉住的 manager 制品读不出来: ' + String((error as Error).message || error),
        nextStep: '确认安装包完整（resources/ui-skin-manager 下应有 .tgz），或重装应用',
        detail: { archivePath },
      },
    };
  }
  const digest = sha256Hex(archive);
  const cacheRoot = path.join(stateDir, 'manager', digest);
  const packageRoot = path.join(cacheRoot, 'package');
  try {
    if (fs.existsSync(path.join(packageRoot, 'package.json'))) return { ok: true, packageRoot, archiveSha256: digest };
  } catch { /* 落到重新解包 */ }

  let entries: TarEntry[];
  try {
    entries = readTarGz(archive, { maxBytes: MAX_EXTRACT_BYTES, maxEntries: MAX_EXTRACT_ENTRIES });
  } catch (error) {
    return {
      ok: false,
      fault: {
        code: 'MANAGER_ARTIFACT_INVALID',
        message: '钉住的 manager 制品解不开: ' + String((error as Error).message || error),
        nextStep: '制品可能损坏或被替换；核对 resources/ui-skin-manager 下 .tgz 的 sha256 后重装',
        detail: { archivePath, archiveSha256: digest },
      },
    };
  }
  try {
    fs.mkdirSync(cacheRoot, { recursive: true });
    for (const entry of entries) {
      const target = safeJoin(cacheRoot, entry.name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entry.body);
    }
  } catch (error) {
    return {
      ok: false,
      fault: {
        code: 'MANAGER_ARTIFACT_EXTRACT_FAILED',
        message: '解包钉住的 manager 制品失败: ' + String((error as Error).message || error),
        nextStep: '检查状态根目录的写权限与剩余空间后重试',
        detail: { archivePath, cacheRoot },
      },
    };
  }
  if (!fs.existsSync(path.join(packageRoot, 'package.json'))) {
    return {
      ok: false,
      fault: {
        code: 'MANAGER_ARTIFACT_LAYOUT_UNEXPECTED',
        message: '解包结果里没有 package/package.json，制品布局与预期不符',
        nextStep: '核对钉住制品是否为 npm pack 形态（顶层 package/），必要时重新产出制品',
        detail: { archivePath, packageRoot },
      },
    };
  }
  return { ok: true, packageRoot, archiveSha256: digest };
}

// ── manager 加载 + 能力探测 ──────────────────────────────────────────────────
type ManagerModule = Record<string, unknown>;

interface LoadedManager {
  module: ManagerModule;
  packageRoot: string;
  version: string;
  source: 'override' | 'pinned-artifact' | 'staged-package';
  archiveSha256?: string;
}

interface Capabilities {
  catalog: boolean;
  install: boolean;
  snapshot: boolean;
  bindings: boolean;
  /** 6.2.5 未审计：始终 false，且 UI 必须显示为「本版本不提供」。 */
  journal: false;
  recovery: false;
  forceEnable: false;
}

let loaded: LoadedManager | undefined;
let loadFailure: SkinFault | undefined;

function managerEntry(packageRoot: string): string {
  for (const candidate of MANAGER_ENTRY_CANDIDATES) {
    const full = path.join(packageRoot, candidate);
    try {
      if (fs.statSync(full).isFile()) return full;
    } catch { /* 继续下一个候选 */ }
  }
  return '';
}

function packageVersion(packageRoot: string): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function ensureManager(): Promise<{ ok: true; manager: LoadedManager } | { ok: false; fault: SkinFault }> {
  if (loaded) return { ok: true, manager: loaded };
  if (loadFailure) return { ok: false, fault: loadFailure };

  const roots = stateRoot();
  if (!roots.ok) {
    loadFailure = roots.fault;
    return { ok: false, fault: roots.fault };
  }

  let packageRoot = '';
  let source: LoadedManager['source'] = 'staged-package';
  let archiveSha256: string | undefined;

  const candidates = managerPackageCandidates();
  const ready = firstExisting(candidates.map((candidate) => path.join(candidate, 'package.json')));
  if (ready) {
    packageRoot = path.dirname(ready);
    source = devOverride('DSH_UI_SKIN_MANAGER_SRC') ? 'override' : 'staged-package';
  } else if (devOverride('DSH_UI_SKIN_MANAGER_SRC')) {
    // 显式指定的来源无效时必须报出来：静默回退到钉住制品会让验证者以为自己在测
    // 另一个 manager（6.2.4 的教训：验证结论必须对得上被加载的那份代码）。
    loadFailure = {
      code: 'MANAGER_SOURCE_INVALID',
      message: 'DSH_UI_SKIN_MANAGER_SRC 指向的目录里没有 package.json: ' + devOverride('DSH_UI_SKIN_MANAGER_SRC'),
      nextStep: '把该变量指向 manager 仓库根（含 package.json 与 src/index.ts），或清掉它改用钉住制品',
      detail: {source: devOverride('DSH_UI_SKIN_MANAGER_SRC')},
    };
    return {ok: false, fault: loadFailure};
  } else {
    const artifact = pinnedArtifactPath();
    if (!artifact) {
      loadFailure = {
        code: 'MANAGER_NOT_INSTALLED',
        message: '安装里没有 manager 制品（resources/ui-skin-manager 下没有 .tgz，也没有解包好的 package/）',
        nextStep: '确认这是带 UI 皮肤管理器的构建；开发态可用 DSH_UI_SKIN_MANAGER_SRC 指向 manager 仓库后重试',
        detail: { searched: candidates },
      };
      return { ok: false, fault: loadFailure };
    }
    const extracted = extractPinnedArtifact(artifact, roots.path);
    if (!extracted.ok) {
      loadFailure = extracted.fault;
      return { ok: false, fault: extracted.fault };
    }
    packageRoot = extracted.packageRoot;
    archiveSha256 = extracted.archiveSha256;
    source = 'pinned-artifact';
  }

  const entry = managerEntry(packageRoot);
  if (!entry) {
    loadFailure = {
      code: 'MANAGER_ENTRY_MISSING',
      message: 'manager 包里找不到可加载的入口（' + MANAGER_ENTRY_CANDIDATES.join(' / ') + '）',
      nextStep: '核对制品内容是否完整；必要时重新产出并重钉 manager 制品',
      detail: { packageRoot },
    };
    return { ok: false, fault: loadFailure };
  }

  try {
    // Node ≥ 22.6 原生 type-stripping：manager 源码是 .ts，钉住制品里就是 .ts，
    // 这里按 ESM 动态加载（包的 package.json 声明 type=module）。
    const module = (await nativeImport(pathToFileURL(entry).href)) as ManagerModule;
    const next: LoadedManager = { module, packageRoot, version: packageVersion(packageRoot), source };
    if (archiveSha256) next.archiveSha256 = archiveSha256;
    loaded = next;
    log('skin', 'manager 已加载: ' + packageRoot + ' v' + next.version + ' (' + source + ')');
    return { ok: true, manager: next };
  } catch (error) {
    loadFailure = {
      code: 'MANAGER_LOAD_FAILED',
      message: 'manager 模块加载失败: ' + String((error as Error).message || error),
      nextStep: '核对 manager 与宿主的内核/接口版本是否匹配（docs/ui-skin-cross-repo-interface-versions.md）',
      detail: { packageRoot, entry },
    };
    return { ok: false, fault: loadFailure };
  }
}

function probeCapabilities(module: ManagerModule): Capabilities {
  const installer = module['PackageInstaller'] as { prototype?: Record<string, unknown> } | undefined;
  const proto = installer && installer.prototype ? installer.prototype : {};
  const catalog = module['PackageCatalog'] as { open?: unknown } | undefined;
  return {
    catalog: typeof catalog?.open === 'function',
    install: typeof proto['importArchive'] === 'function' && typeof proto['inspect'] === 'function',
    snapshot: typeof module['publishActiveSnapshot'] === 'function' && typeof module['readActiveSnapshot'] === 'function',
    bindings: typeof module['BindingStore'] === 'function',
    journal: false,
    recovery: false,
    forceEnable: false,
  };
}

function capabilityFault(missing: string[]): SkinFault {
  return {
    code: 'MANAGER_CAPABILITY_MISSING',
    message: '当前钉住的 manager 构建不提供所需操作：' + missing.join(', '),
    nextStep: '把 manager 制品重钉到提供 coordinator 接口的版本（见 docs/ui-skin-cross-repo-interface-versions.md），不要在本层另写一套策略',
    detail: { missing },
  };
}

// ── 故障记录 ─────────────────────────────────────────────────────────────────
const faultRing: Array<{code: string; message: string; nextStep: string; at: string}> = [];

function rememberFault(fault: SkinFault): void {
  const at = new Date().toISOString();
  faultRing.push({code: fault.code, message: fault.message, nextStep: fault.nextStep, at});
  while (faultRing.length > FAULT_RING) faultRing.shift();
  const roots = stateRoot();
  if (!roots.ok) return;
  try {
    fs.mkdirSync(roots.path, {recursive: true});
    fs.writeFileSync(path.join(roots.path, FAULT_LOG_FILE), JSON.stringify({...fault, at}, null, 2));
  } catch { /* 记录失败不影响主流程 */ }
}

/** 稳定 code → 下一步。未知 code 也给出可执行动作，而不是空话。 */
function nextStepFor(code: string): string {
  const table: Record<string, string> = {
    SNAPSHOT_PACKAGE_MISSING: '先在「导入」里装上该坐标的包，或把该 slot 的选择改回默认坐标',
    SNAPSHOT_PACKAGE_DIGEST_MISMATCH: '默认回退坐标与钉住制品不一致：重装应用或重钉制品，不要改 profile',
    SNAPSHOT_PROFILE_INVALID: 'host-profile.json 与 manager 的契约不符：核对随包 profile 与 manager 版本',
    SNAPSHOT_SLOT_UNKNOWN: 'profile 里没有这个 slot：刷新一次状态后再选，不要手改 slot 名',
    SNAPSHOT_SLOT_INCOMPLETE: '同一个 slot 被选了两次：清掉重复选择后重试',
    SNAPSHOT_GENERATION_STALE: '世代号过期（别处已经提交过）：刷新状态后重新应用',
    SNAPSHOT_PATH_UNSAFE: '路径不安全（必须是绝对路径）：检查状态根/消费根配置',
    SNAPSHOT_ASSET_LIMIT: '贡献的资源超过体积上限：换更小的包，或让作者拆分资源',
    INSTALL_ARCHIVE_INVALID: '压缩包不是有效的皮肤包：换一个用官方打包脚本产出的 .dshpack/.tar',
    INSTALL_DIGEST_MISMATCH: '压缩包与预期摘要不符：核对来源后重新获取，不要跳过校验',
    INSTALL_COMPATIBILITY: '该包不支持本宿主的 profile/内核版本：联系作者或换包',
    INSTALL_PATH_UNSAFE: '包内路径逃出安装根：拒绝安装，向作者报告',
    INSTALL_WRITE_FAILED: '写安装目录失败：检查磁盘空间与目录权限后重试',
    PERSISTENCE_CORRUPT: '状态文件损坏（已保留备份）：在诊断里确认后重建状态根',
    STATE_ROOT_UNCONFIGURED: '开发态设置 DSH_UI_SKIN_MANAGER_STATE=<临时目录>',
    STATE_ROOT_UNAVAILABLE: '检查壳层启动环境（userData 是否可解析）',
  };
  return table[code] ?? ('按 code ' + code + ' 在 manager 诊断里查根因；先刷新状态再重试，不要绕过校验');
}

function faultOf(error: unknown, fallbackCode: string): SkinFault {
  const candidate = error as {code?: unknown; message?: unknown} | undefined;
  const code = typeof candidate?.code === 'string' && candidate.code ? candidate.code : fallbackCode;
  const message = String((candidate?.message as string) || (error as Error)?.message || error || '未知失败');
  const fault: SkinFault = {code, message, nextStep: nextStepFor(code)};
  rememberFault(fault);
  return fault;
}

// ── 选择草稿（UI 的显式意图，纯数据；一切判定留给 manager） ─────────────────
interface DraftSelection {
  slots: Record<string, {packageId: string; packageVersion: string}>;
  updatedAt: string;
}

function selectionPath(): string | undefined {
  const roots = stateRoot();
  return roots.ok ? path.join(roots.path, SELECTION_FILE) : undefined;
}

function readDraft(): DraftSelection {
  const file = selectionPath();
  if (!file) return {slots: {}, updatedAt: new Date().toISOString()};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {slots?: unknown};
    const slots: DraftSelection['slots'] = {};
    const raw = (parsed && typeof parsed.slots === 'object' && parsed.slots !== null) ? parsed.slots as Record<string, unknown> : {};
    for (const [slot, value] of Object.entries(raw)) {
      const item = value as {packageId?: unknown; packageVersion?: unknown} | undefined;
      if (item && typeof item.packageId === 'string' && typeof item.packageVersion === 'string') {
        slots[slot] = {packageId: item.packageId, packageVersion: item.packageVersion};
      }
    }
    return {slots, updatedAt: new Date().toISOString()};
  } catch {
    return {slots: {}, updatedAt: new Date().toISOString()};
  }
}

function writeDraft(draft: DraftSelection): void {
  const file = selectionPath();
  if (!file) return;
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(draft, null, 2));
  fs.renameSync(tmp, file);
}

function selectionOf(draft: DraftSelection): Array<{slot: string; packageId: string; packageVersion: string}> {
  return Object.entries(draft.slots).map(([slot, value]) => ({slot, packageId: value.packageId, packageVersion: value.packageVersion}));
}

// ── manager 装配（每次调用重新读盘：不缓存状态，避免 UI 看到陈旧视图） ──────
interface ManagerEnv {
  module: ManagerModule;
  capabilities: Capabilities;
  packageRoot: string;
  version: string;
  source: LoadedManager['source'];
  stateDir: string;
  resolvedDir: string;
  catalog: {list(): unknown[]; get(id: string, version: string): unknown};
  profile: unknown;
  bindings: {committed(): Promise<{value?: {generation: number; bindings: Record<string, unknown>}}>; previous(): Promise<{value?: {generation: number; bindings: Record<string, unknown>}}>};
}

async function openEnv(): Promise<{ok: true; env: ManagerEnv} | {ok: false; fault: SkinFault}> {
  const result = await ensureManager();
  if (!result.ok) return {ok: false, fault: result.fault};
  const roots = stateRoot();
  if (!roots.ok) return {ok: false, fault: roots.fault};

  const module = result.manager.module;
  const capabilities = probeCapabilities(module);
  const missing: string[] = [];
  if (!capabilities.catalog) missing.push('PackageCatalog.open');
  if (!capabilities.install) missing.push('PackageInstaller#importArchive');
  if (!capabilities.snapshot) missing.push('publishActiveSnapshot/readActiveSnapshot');
  if (!capabilities.bindings) missing.push('BindingStore');
  if (missing.length > 0) {
    const fault = capabilityFault(missing);
    rememberFault(fault);
    return {ok: false, fault};
  }

  const stateDir = roots.path;
  const resolvedDir = resolvedRoot();
  const profileFile = hostProfilePath();
  if (!profileFile) {
    const fault: SkinFault = {
      code: 'HOST_PROFILE_MISSING',
      message: '找不到随包的 host-profile.json（快照发布必须用它，不能自造）',
      nextStep: '核对安装包里的 ui-skin-manager/host-profile.json 是否存在；开发态可用 DSH_UI_SKIN_MANAGER_PROFILE 指定',
    };
    rememberFault(fault);
    return {ok: false, fault};
  }
  let profile: unknown;
  try {
    profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
  } catch (error) {
    const fault: SkinFault = {
      code: 'HOST_PROFILE_UNREADABLE',
      message: 'host-profile.json 读不出/解析失败: ' + String((error as Error).message || error),
      nextStep: '核对随包 profile 文件完整性后重装',
      detail: {profileFile},
    };
    rememberFault(fault);
    return {ok: false, fault};
  }

  try {
    fs.mkdirSync(stateDir, {recursive: true});
    fs.mkdirSync(path.join(stateDir, 'packages'), {recursive: true});
    fs.mkdirSync(path.join(stateDir, 'bindings'), {recursive: true});
  } catch (error) {
    const fault: SkinFault = {
      code: 'STATE_ROOT_UNWRITABLE',
      message: 'manager 状态根不可写: ' + String((error as Error).message || error),
      nextStep: '检查该目录权限/磁盘空间后重试',
      detail: {stateDir},
    };
    rememberFault(fault);
    return {ok: false, fault};
  }

  // active 快照根也必须可写（打包态它在 <userData>/ui-skin-manager/resolved，
  // 与只读的安装资源目录分离；拿不到可写根时宁可拒绝也不写只读默认根）。
  try {
    fs.mkdirSync(resolvedDir, {recursive: true});
  } catch (error) {
    const fault: SkinFault = {
      code: 'RESOLVED_ROOT_UNWRITABLE',
      message: 'active 快照根不可写: ' + String((error as Error).message || error),
      nextStep: '检查用户数据目录权限/磁盘空间后重试；随包默认快照根是只读的，不会被改写',
      detail: {resolvedDir},
    };
    rememberFault(fault);
    return {ok: false, fault};
  }

  const catalogFactory = module['PackageCatalog'] as {open(indexPath: string): Promise<unknown>};
  const BindingStoreCtor = module['BindingStore'] as new (directory: string) => ManagerEnv['bindings'];
  const catalog = (await catalogFactory.open(path.join(stateDir, 'catalog.json'))) as ManagerEnv['catalog'];
  const bindings = new BindingStoreCtor(path.join(stateDir, 'bindings'));

  return {
    ok: true,
    env: {
      module,
      capabilities,
      packageRoot: result.manager.packageRoot,
      version: result.manager.version,
      source: result.manager.source,
      stateDir,
      resolvedDir,
      catalog,
      profile,
      bindings,
    },
  };
}

// ── 读回 ─────────────────────────────────────────────────────────────────────
interface SnapshotView {
  generation: number;
  profile: {id: string; version: string};
  createdAt: string;
  slots: Array<{slot: string; packageId: string; packageVersion: string; digest: string; contribution: string; assets: number}>;
  snapshotPath: string;
}

function snapshotView(env: ManagerEnv, snapshot: Record<string, unknown> | undefined): SnapshotView | undefined {
  if (!snapshot) return undefined;
  const bindings = Array.isArray(snapshot['bindings']) ? snapshot['bindings'] as Array<Record<string, unknown>> : [];
  const slotAssets = (snapshot['slotAssets'] && typeof snapshot['slotAssets'] === 'object') ? snapshot['slotAssets'] as Record<string, unknown> : {};
  const profile = (snapshot['profile'] && typeof snapshot['profile'] === 'object') ? snapshot['profile'] as Record<string, unknown> : {};
  return {
    generation: Number(snapshot['generation'] ?? 0),
    profile: {id: String(profile['id'] ?? ''), version: String(profile['version'] ?? '')},
    createdAt: String(snapshot['createdAt'] ?? ''),
    slots: bindings.map((item) => {
      const pkg = (item['package'] && typeof item['package'] === 'object') ? item['package'] as Record<string, unknown> : {};
      const slot = String(item['slot'] ?? '');
      const assets = Array.isArray(slotAssets[slot]) ? (slotAssets[slot] as unknown[]).length : 0;
      return {
        slot,
        packageId: String(pkg['id'] ?? ''),
        packageVersion: String(pkg['version'] ?? ''),
        digest: String(pkg['digest'] ?? ''),
        contribution: String(item['contribution'] ?? ''),
        assets,
      };
    }),
    snapshotPath: path.join(env.resolvedDir, 'snapshot.json'),
  };
}

async function readSnapshot(env: ManagerEnv): Promise<Record<string, unknown> | undefined> {
  const read = env.module['readActiveSnapshot'] as (root: string) => Promise<Record<string, unknown> | undefined>;
  return read(env.resolvedDir);
}

function installedView(env: ManagerEnv): Array<Record<string, unknown>> {
  const items = env.catalog.list() as Array<Record<string, unknown>>;
  return items.map((item) => {
    const manifest = (item['manifest'] && typeof item['manifest'] === 'object') ? item['manifest'] as Record<string, unknown> : {};
    const metadata = (manifest['metadata'] && typeof manifest['metadata'] === 'object') ? manifest['metadata'] as Record<string, unknown> : {};
    const contributions = Array.isArray(manifest['contributions']) ? manifest['contributions'] as Array<Record<string, unknown>> : [];
    return {
      packageId: String(metadata['id'] ?? ''),
      packageVersion: String(metadata['version'] ?? ''),
      name: String(metadata['name'] ?? ''),
      digest: String(item['digest'] ?? ''),
      source: String(item['source'] ?? 'local'),
      official: item['official'] === true,
      // 来源标注：official 由 catalog 记录决定（导入本身永远拿不到 official）。
      origin: item['official'] === true ? 'official' : 'third-party',
      slots: contributions.map((contribution) => String(contribution['slot'] ?? '')).filter((slot) => slot.length > 0),
      installedAt: typeof item['installedAt'] === 'string' ? item['installedAt'] : '',
    };
  });
}

function profileSlots(env: ManagerEnv): Array<{id: string; fallback: {id: string; version: string; digest: string}}> {
  const profile = env.profile as {slots?: unknown; fallbackSkin?: unknown};
  const slots = Array.isArray(profile.slots) ? profile.slots as Array<Record<string, unknown>> : [];
  const fallback = (profile.fallbackSkin && typeof profile.fallbackSkin === 'object') ? profile.fallbackSkin as Record<string, unknown> : {};
  return slots.map((slot) => ({
    id: String(slot['id'] ?? ''),
    fallback: {
      id: String(fallback['id'] ?? ''),
      version: String(fallback['version'] ?? ''),
      digest: String(fallback['digest'] ?? ''),
    },
  }));
}

// ── 读文件（导入/检查用） ────────────────────────────────────────────────────
function readArchive(archivePath: unknown): {ok: true; bytes: Buffer} | {ok: false; fault: SkinFault} {
  if (typeof archivePath !== 'string' || archivePath.trim().length === 0) {
    return {
      ok: false,
      fault: {
        code: 'ARCHIVE_PATH_REQUIRED',
        message: '没有给出要导入的压缩包路径',
        nextStep: '在导入入口填写本地 .dshpack/.tar 的绝对路径（本版本不联网下载）',
      },
    };
  }
  const target = path.resolve(archivePath.trim());
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch (error) {
    return {
      ok: false,
      fault: {
        code: 'ARCHIVE_NOT_FOUND',
        message: '找不到压缩包: ' + target,
        nextStep: '核对路径（要绝对路径）后重试；本版本不会自动下载',
        detail: {archivePath: target, cause: String((error as Error).message || error)},
      },
    };
  }
  if (!stat.isFile()) {
    return {
      ok: false,
      fault: {code: 'ARCHIVE_NOT_A_FILE', message: '该路径不是文件: ' + target, nextStep: '选择单个皮肤包文件后重试', detail: {archivePath: target}},
    };
  }
  if (stat.size > MAX_ARCHIVE_BYTES) {
    return {
      ok: false,
      fault: {
        code: 'ARCHIVE_TOO_LARGE',
        message: '压缩包超过 ' + Math.floor(MAX_ARCHIVE_BYTES / 1024 / 1024) + ' MiB 上限',
        nextStep: '换更小的包；确实需要更大上限时先改适配层的显式限制，不要绕过',
        detail: {archivePath: target, bytes: stat.size},
      },
    };
  }
  try {
    return {ok: true, bytes: fs.readFileSync(target)};
  } catch (error) {
    return {
      ok: false,
      fault: {
        code: 'ARCHIVE_UNREADABLE',
        message: '读压缩包失败: ' + String((error as Error).message || error),
        nextStep: '检查文件权限/是否被占用后重试',
        detail: {archivePath: target},
      },
    };
  }
}

// ── 操作实现 ─────────────────────────────────────────────────────────────────

async function opStatus(): Promise<SkinResult> {
  const result = await ensureManager();
  const roots = stateRoot();
  if (!result.ok) {
    return {
      ok: true,
      manager: {available: false, fault: result.fault},
      state: {stateRoot: roots.ok ? roots.path : null, resolvedRoot: resolvedRoot()},
      capabilities: null,
      snapshot: null,
      slots: [],
      installed: [],
    };
  }
  const envResult = await openEnv();
  if (!envResult.ok) {
    return {
      ok: true,
      manager: {available: true, packageRoot: result.manager.packageRoot, version: result.manager.version, source: result.manager.source},
      state: {stateRoot: roots.ok ? roots.path : null, resolvedRoot: resolvedRoot()},
      capabilities: probeCapabilities(result.manager.module),
      snapshot: null,
      slots: [],
      installed: [],
      fault: envResult.fault,
    };
  }
  const env = envResult.env;
  const snapshot = await readSnapshot(env);
  const draft = readDraft();
  return {
    ok: true,
    manager: {available: true, packageRoot: env.packageRoot, version: env.version, source: env.source},
    state: {stateRoot: env.stateDir, resolvedRoot: env.resolvedDir},
    capabilities: env.capabilities,
    snapshot: snapshotView(env, snapshot) ?? null,
    slots: profileSlots(env).map((slot) => ({
      ...slot,
      selected: draft.slots[slot.id] ?? null,
    })),
    installed: installedView(env),
  };
}

async function opList(): Promise<SkinResult> {
  const envResult = await openEnv();
  if (!envResult.ok) return {ok: false, fault: envResult.fault};
  return {ok: true, installed: installedView(envResult.env)};
}

async function opInspect(params: Record<string, unknown>): Promise<SkinResult> {
  const envResult = await openEnv();
  if (!envResult.ok) return {ok: false, fault: envResult.fault};
  const env = envResult.env;
  const archive = readArchive(params['archivePath']);
  if (!archive.ok) return {ok: false, fault: archive.fault};
  try {
    const installer = new (env.module['PackageInstaller'] as new (options: {root: string; catalog: unknown}) => {inspect(bytes: Buffer, options: Record<string, unknown>): Record<string, unknown>})({
      root: path.join(env.stateDir, 'packages'),
      catalog: env.catalog,
    });
    const inspected = installer.inspect(archive.bytes, {profile: env.profile});
    const manifest = (inspected['manifest'] && typeof inspected['manifest'] === 'object') ? inspected['manifest'] as Record<string, unknown> : {};
    const metadata = (manifest['metadata'] && typeof manifest['metadata'] === 'object') ? manifest['metadata'] as Record<string, unknown> : {};
    const contributions = Array.isArray(manifest['contributions']) ? manifest['contributions'] as Array<Record<string, unknown>> : [];
    return {
      ok: true,
      // 只读：这里绝不写目录、不进 catalog（导入必须是显式动作）。
      writes: false,
      archiveSha256: String(inspected['archiveSha256'] ?? ''),
      container: String(inspected['container'] ?? ''),
      manifestPath: String(inspected['manifestPath'] ?? ''),
      package: {
        packageId: String(metadata['id'] ?? ''),
        packageVersion: String(metadata['version'] ?? ''),
        name: String(metadata['name'] ?? ''),
      },
      slots: contributions.map((contribution) => String(contribution['slot'] ?? '')).filter((slot) => slot.length > 0),
      alreadyInstalled: Boolean(env.catalog.get(String(metadata['id'] ?? ''), String(metadata['version'] ?? ''))),
    };
  } catch (error) {
    return {ok: false, fault: faultOf(error, 'INSTALL_ARCHIVE_INVALID')};
  }
}

async function opImport(params: Record<string, unknown>): Promise<SkinResult> {
  const envResult = await openEnv();
  if (!envResult.ok) return {ok: false, fault: envResult.fault};
  const env = envResult.env;
  const archive = readArchive(params['archivePath']);
  if (!archive.ok) return {ok: false, fault: archive.fault};
  const expected = typeof params['expectedArchiveSha256'] === 'string' ? params['expectedArchiveSha256'] : undefined;
  try {
    const installer = new (env.module['PackageInstaller'] as new (options: {root: string; catalog: unknown}) => {
      importArchive(bytes: Buffer, options: Record<string, unknown>): Promise<Record<string, unknown>>;
    })({root: path.join(env.stateDir, 'packages'), catalog: env.catalog});
    const options: Record<string, unknown> = {profile: env.profile};
    if (expected) options['expectedArchiveSha256'] = expected;
    const imported = await installer.importArchive(archive.bytes, options);
    const installed = (imported['installed'] && typeof imported['installed'] === 'object') ? imported['installed'] as Record<string, unknown> : {};
    const manifest = (installed['manifest'] && typeof installed['manifest'] === 'object') ? installed['manifest'] as Record<string, unknown> : {};
    const metadata = (manifest['metadata'] && typeof manifest['metadata'] === 'object') ? manifest['metadata'] as Record<string, unknown> : {};
    // 显式动作的语义：导入只落盘 + 进 catalog，绝不自动选择、绝不自动启用。
    return {
      ok: true,
      enabled: false,
      package: {
        packageId: String(metadata['id'] ?? ''),
        packageVersion: String(metadata['version'] ?? ''),
        name: String(metadata['name'] ?? ''),
      },
      archiveSha256: String(imported['archiveSha256'] ?? ''),
      targetPath: String(imported['targetPath'] ?? ''),
      idempotent: imported['idempotent'] === true,
      official: false,
      installed: installedView(env),
    };
  } catch (error) {
    return {ok: false, fault: faultOf(error, 'INSTALL_FAILED')};
  }
}

async function opSelect(params: Record<string, unknown>): Promise<SkinResult> {
  const envResult = await openEnv();
  if (!envResult.ok) return {ok: false, fault: envResult.fault};
  const env = envResult.env;
  const slot = typeof params['slot'] === 'string' ? params['slot'] : '';
  const packageId = typeof params['packageId'] === 'string' ? params['packageId'] : '';
  const packageVersion = typeof params['packageVersion'] === 'string' ? params['packageVersion'] : '';
  if (!slot || !packageId || !packageVersion) {
    return {
      ok: false,
      fault: {
        code: 'SELECTION_INCOMPLETE',
        message: '逐 slot 选择需要 slot + packageId + packageVersion 三样',
        nextStep: '从已装列表里选一个坐标（本层不猜默认坐标，回退坐标由 profile 决定）',
      },
    };
  }
  if (!profileSlots(env).some((item) => item.id === slot)) {
    return {
      ok: false,
      fault: {
        code: 'SLOT_UNKNOWN',
        message: 'profile 里没有 slot: ' + slot,
        nextStep: '刷新状态后从 profile 给出的 slot 里选，不要手写 slot 名',
        detail: {known: profileSlots(env).map((item) => item.id)},
      },
    };
  }
  const entry = env.catalog.get(packageId, packageVersion) as Record<string, unknown> | undefined;
  if (!entry) {
    return {
      ok: false,
      fault: {
        code: 'PACKAGE_NOT_INSTALLED',
        message: packageId + '@' + packageVersion + ' 还没装上',
        nextStep: '先在「导入」里装上这个坐标，再回来选',
        detail: {slot, packageId, packageVersion},
      },
    };
  }
  // 兼容性/贡献面是否覆盖该 slot，由 apply 时的 publishActiveSnapshot 判定；
  // 本层不预判，避免和 manager 的策略出现两套答案。
  const draft = readDraft();
  draft.slots[slot] = {packageId, packageVersion};
  writeDraft(draft);
  return {ok: true, applied: false, slots: profileSlots(env).map((item) => ({...item, selected: draft.slots[item.id] ?? null}))};
}

async function opDeselect(params: Record<string, unknown>): Promise<SkinResult> {
  const envResult = await openEnv();
  if (!envResult.ok) return {ok: false, fault: envResult.fault};
  const slot = typeof params['slot'] === 'string' ? params['slot'] : '';
  const draft = readDraft();
  if (slot) delete draft.slots[slot];
  else draft.slots = {};
  writeDraft(draft);
  return {
    ok: true,
    applied: false,
    slots: profileSlots(envResult.env).map((item) => ({...item, selected: draft.slots[item.id] ?? null})),
  };
}

interface PublishOutcome {
  ok: boolean;
  result?: Record<string, unknown>;
  fault?: SkinFault;
}

/** 应用/回退共用的发布步骤：世代推进与提交都交给 manager。 */
async function publish(env: ManagerEnv, selection: Array<{slot: string; packageId: string; packageVersion: string}>): Promise<PublishOutcome> {
  const committed = await env.bindings.committed();
  const currentGeneration = committed.value ? committed.value.generation : 0;
  const nextGeneration = currentGeneration + 1;
  const publishFn = env.module['publishActiveSnapshot'] as (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
  try {
    const result = await publishFn({
      resolvedRoot: env.resolvedDir,
      profile: env.profile,
      catalog: env.catalog,
      selection,
      generation: nextGeneration,
      bindings: env.bindings,
    });
    return {ok: true, result};
  } catch (error) {
    return {ok: false, fault: faultOf(error, 'SNAPSHOT_PUBLISH_FAILED')};
  }
}

async function opApply(): Promise<SkinResult> {
  const envResult = await openEnv();
  if (!envResult.ok) return {ok: false, fault: envResult.fault};
  const env = envResult.env;
  const draft = readDraft();
  const outcome = await publish(env, selectionOf(draft));
  if (!outcome.ok) return {ok: false, fault: outcome.fault};

  // 读回校验：UI 展示的状态必须来自 manager 自己写出的快照，而不是我们的入参。
  const readBack = await readSnapshot(env);
  const view = snapshotView(env, readBack);
  const expected = Number(outcome.result?.['snapshot'] && (outcome.result['snapshot'] as Record<string, unknown>)['generation']);
  if (!view || !Number.isFinite(expected) || view.generation !== expected) {
    const fault: SkinFault = {
      code: 'SNAPSHOT_READBACK_MISMATCH',
      message: '发布后读回的世代与 manager 返回的不一致（写读不同源）',
      nextStep: '在诊断里核对 snapshot.json 与状态根；不要凭 UI 缓存继续操作',
      detail: {expected, readBack: view ? view.generation : null},
    };
    rememberFault(fault);
    return {ok: false, fault};
  }
  return {
    ok: true,
    generation: view.generation,
    snapshot: view,
    written: Array.isArray(outcome.result?.['written']) ? outcome.result['written'] : [],
    // 宿主在页面引导脚本里读快照，所以新世代要重载窗口才生效；
    // 本层不谎称「已热替换」——6.2.3 的事务桥未接回本 UI。
    reloadRequired: true,
    correlationId: outcome.result?.['correlationId'] ?? null,
  };
}

async function opRevert(params: Record<string, unknown>): Promise<SkinResult> {
  const envResult = await openEnv();
  if (!envResult.ok) return {ok: false, fault: envResult.fault};
  const env = envResult.env;
  const slot = typeof params['slot'] === 'string' ? params['slot'] : '';

  if (slot) {
    // 单 slot 回退 = 取消该 slot 的选择：回退到哪个坐标由 profile 的 fallbackSkin 决定。
    const draft = readDraft();
    if (!(slot in draft.slots)) {
      return {
        ok: false,
        fault: {
          code: 'REVERT_NOTHING_TO_DO',
          message: 'slot ' + slot + ' 当前没有选择，已经是回退坐标',
          nextStep: '刷新状态确认当前快照，再决定是否要改别的 slot',
          detail: {slot},
        },
      };
    }
    delete draft.slots[slot];
    writeDraft(draft);
    const outcome = await publish(env, selectionOf(draft));
    if (!outcome.ok) return {ok: false, fault: outcome.fault};
    const view = snapshotView(env, await readSnapshot(env));
    return {ok: true, reverted: slot, generation: view ? view.generation : null, snapshot: view ?? null, reloadRequired: true};
  }

  // 整代回退：目标世代取自 manager 的 previous-known-good，不在这里自己算。
  const previous = await env.bindings.previous();
  if (!previous.value || Object.keys(previous.value.bindings).length === 0) {
    return {
      ok: false,
      fault: {
        code: 'REVERT_NO_PREVIOUS_GENERATION',
        message: 'manager 里没有可回退的上一代记录',
        nextStep: '先应用一次选择产生历史，或按 slot 回退到 profile 默认坐标',
      },
    };
  }
  const selection = Object.entries(previous.value.bindings).map(([slotId, binding]) => {
    const item = binding as {package?: {id?: unknown; version?: unknown}};
    return {
      slot: slotId,
      packageId: String(item.package?.id ?? ''),
      packageVersion: String(item.package?.version ?? ''),
    };
  }).filter((item) => item.packageId.length > 0 && item.packageVersion.length > 0);
  if (selection.length === 0) {
    return {
      ok: false,
      fault: {
        code: 'REVERT_NO_PREVIOUS_GENERATION',
        message: '上一代记录里没有可用的坐标',
        nextStep: '按 slot 回退到 profile 默认坐标，或重新导入后再应用',
      },
    };
  }
  const outcome = await publish(env, selection);
  if (!outcome.ok) return {ok: false, fault: outcome.fault};
  writeDraft({slots: Object.fromEntries(selection.map((item) => [item.slot, {packageId: item.packageId, packageVersion: item.packageVersion}])), updatedAt: new Date().toISOString()});
  const view = snapshotView(env, await readSnapshot(env));
  return {ok: true, revertedToGeneration: previous.value.generation, generation: view ? view.generation : null, snapshot: view ?? null, reloadRequired: true};
}

async function opDiagnose(): Promise<SkinResult> {
  const result = await ensureManager();
  const roots = stateRoot();
  const base: SkinResult = {
    ok: true,
    state: {stateRoot: roots.ok ? roots.path : null, resolvedRoot: resolvedRoot()},
    faults: [...faultRing].reverse(),
  };
  if (!result.ok) return {...base, manager: {available: false, fault: result.fault}, capabilities: null};
  const envResult = await openEnv();
  if (!envResult.ok) {
    return {...base, manager: {available: true, packageRoot: result.manager.packageRoot, version: result.manager.version, source: result.manager.source}, capabilities: probeCapabilities(result.manager.module), fault: envResult.fault};
  }
  const env = envResult.env;
  const committed = await env.bindings.committed();
  const previous = await env.bindings.previous();
  const view = snapshotView(env, await readSnapshot(env));
  const bindingSummary = (value: {generation: number; bindings: Record<string, unknown>} | undefined): unknown => {
    if (!value) return null;
    return {
      generation: value.generation,
      slots: Object.entries(value.bindings).map(([slot, binding]) => {
        const item = binding as {package?: {id?: unknown; version?: unknown}; state?: unknown};
        return {slot, packageId: String(item.package?.id ?? ''), packageVersion: String(item.package?.version ?? ''), state: String(item.state ?? '')};
      }),
    };
  };
  return {
    ...base,
    manager: {available: true, packageRoot: env.packageRoot, version: env.version, source: env.source},
    capabilities: env.capabilities,
    snapshot: view ?? null,
    bindings: {committed: bindingSummary(committed.value), previous: bindingSummary(previous.value)},
    // 未审计能力显式声明不可用（不是「暂无数据」）。
    unavailable: [
      {capability: 'recovery.execute', reason: CAPABILITY_UNAUDITED, note: '6.2.5 的恢复执行尚未审计通过，本版本不提供；故障先按 fault.nextStep 处理'},
      {capability: 'forceEnable', reason: CAPABILITY_UNAUDITED, note: '强制确认（durable force-enable）尚未审计通过，本版本不提供'},
      {capability: 'journal.durable', reason: CAPABILITY_UNAUDITED, note: '持久事务日志随 6.2.5 接回，本版本的发布不带日志记录'},
    ],
  };
}

// ── RPC 入口 ─────────────────────────────────────────────────────────────────
const OPERATIONS: Record<string, (params: Record<string, unknown>) => Promise<SkinResult>> = {
  'skin.status': () => opStatus(),
  'skin.list': () => opList(),
  'skin.inspect': (params) => opInspect(params),
  'skin.import': (params) => opImport(params),
  'skin.select': (params) => opSelect(params),
  'skin.deselect': (params) => opDeselect(params),
  'skin.apply': () => opApply(),
  'skin.revert': (params) => opRevert(params),
  'skin.diagnose': () => opDiagnose(),
};

export const SKIN_MANAGER_METHODS = Object.keys(OPERATIONS);

export async function invoke(method: string, params: unknown): Promise<SkinResult> {
  const operation = OPERATIONS[method];
  if (!operation) {
    return {
      ok: false,
      fault: {
        code: 'UNKNOWN_METHOD',
        message: '未知的 skin 方法: ' + method,
        nextStep: '可用方法: ' + SKIN_MANAGER_METHODS.join(', '),
      },
    };
  }
  const args = (params && typeof params === 'object') ? params as Record<string, unknown> : {};
  try {
    return await operation(args);
  } catch (error) {
    // 兜底：适配层自身的意外异常也要变成可定位 fault，不能让 UI 只看到一句 message。
    return {ok: false, fault: faultOf(error, 'SKIN_ADAPTER_FAILED')};
  }
}
