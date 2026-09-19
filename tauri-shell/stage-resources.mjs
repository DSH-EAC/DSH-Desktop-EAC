'use strict';
// Tauri 打包资源装配（P4）：把运行所需的一切装进 staged-resources/，
// 供 tauri.conf.json 的 resources 映射进安装包。
//
// 布局（= main.rs resource_root() 的约定）：
//   staged-resources/sidecar/server.js|bridge.js|capability-stubs.js
//   staged-resources/dsh-desktop/<Electron 时代的精确文件清单 + 生产 node_modules
//                              + assets + vendor/node + vendor/npm>
//
// 用法：node stage-resources.mjs [--target=win32|linux|darwin] [--skip-npm]

import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, readFileSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canReuseStagedNodeModules, writeStagedPlatformStamp } from './stage-platform-cache.mjs';
import { copyKernelCacheForTarget, sanitizeClientBuildPaths } from './stage-linux-sanitize.mjs';
import { withAbsolutizedKernelManifests } from './stage-kernel-manifest.mjs';
import {
  assertSupportedStageArch,
  pruneDarwinPayloads,
  pruneLinuxPayloads,
  pruneNonDarwinPrebuilds,
  pruneNonLinuxPrebuilds,
} from './stage-platform-prune.mjs';
import { genDistributionDescriptor } from './gen-distribution-descriptor.mjs';
import { prepareWebView2Loader } from './prepare-webview2-loader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dd = path.join(root, 'dsh-desktop');
const staged = path.join(root, 'tauri-shell', 'staged-resources');
const skipNpm = process.argv.includes('--skip-npm');
const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
const targetPlatform = targetArg ? targetArg.slice('--target='.length) : process.platform;
if (targetPlatform !== 'win32' && targetPlatform !== 'linux' && targetPlatform !== 'darwin') {
  throw new Error(`[stage] 不支持目标平台: ${targetPlatform}`);
}
assertSupportedStageArch(process.arch);
// 交叉打包显式不支持（解析处校验）：native/*.node 与各包 prebuilds 均按本机
// platform/arch 装配，target 与本机不一致会产出缺原生包的坏树 —— 解析处 fail-fast。
if (targetPlatform !== process.platform) {
  throw new Error(
    `[stage] 交叉打包不支持：--target=${targetPlatform} ≠ 本机 ${process.platform}/${process.arch}`
    + '（原生模块按本机架构装配，target 必须与本机一致）',
  );
}

// 人工同步：只装配 sidecar 的直接/传递依赖，以及 stage 构建期脚本。
//
// v6 Task 3.1（ADR 0006）：最简本体装配面。剥离集（插件系统/更新体系/
// 增值功能）的代码保留在仓库原位等接回，但不再进入装配清单：
//   - 插件系统：plugin-updater / plugin-guard / plugin-manager-state /
//     builtin-collision / patch-row-heal / profile-module-heal /
//     rescue-agent 之外的插件治理面、preset-sync / compact-preset-migrate /
//     router-persona-preset-migrate（迁移面随插件选择向导剥出）
//   - 更新体系：updater / client-updater / shortcut-maintenance（v6.1
//     Task 8/9/10 接回）
//   - companion-sync / plugin-ops / market / install-profile / shortcuts /
//     junction-patrol / static-preview / feature-pack 等 lib/desktop 模块
//   - vnext 隔离体系整体剥出（ADR 0003 体系随插件系统走）
// v6 Task 3.3：插件治理闭包接回。ROOT_FILES 增补 companion-sync 的根模块
// 依赖（plugin-guard / plugin-updater / plugin-manager-state / builtin-collision /
// patch-row-heal / profile-module-heal / preset-sync / compact-preset-migrate /
// router-persona-preset-migrate）——它们由 companion-sync 顶层 require 消费。
// 更新流（client-updater / client-update）仍属 v6.1 Task 8/9，不在此清单。
const ROOT_FILES = [
  'session-watcher.js',
  'bundle-integrity.js', 'stable-port.js', 'stream-write-guard.js',
  // updater.js 保留其 overlay 内核管理面（boot 失败隔离切内置内核的链路，
  // runtime-paths/profile 消费）；更新流函数无人调用，v6.1 Task 8 拆分。
  'updater.js',
  // Task 3.3 插件治理闭包
  'plugin-guard.js', 'plugin-updater.js', 'plugin-manager-state.js',
  'builtin-collision.js', 'patch-row-heal.js', 'profile-module-heal.js',
  'preset-sync.js', 'compact-preset-migrate.js', 'router-persona-preset-migrate.js',
];
const LIB_DESKTOP = [
  'proc.js', 'platform.js', 'runtime-paths.js', 'profile.js',
  'runtime-patches.js', 'boot-server.js',
  // Task 3.3 插件治理三件套 + 其 lib/desktop 依赖
  'guard-box.js', 'companion-sync.js', 'plugin-ops.js',
  'install-profile.js', 'plugin-sync-registry.js',
  // Task 3.3 阶段 3：files.revert 的白名单根
  'file-roots.js',
];
const SCRIPTS = [
  'patch-session-manage.js', 'patch-deps.js',
  // plugin-ops 消费：核心插件集合判定 + patch 行读写
  'onboarding.js', 'plugin-manager-patch.js',
];

const LIB_VNEXT = [
  'atomic-json.js',
  // companion-sync / guard-box 消费
  'plugin-copy.js',
];
const NATIVE_MODULES = [];
function requireFile(file, label) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(`[stage] 缺少${label || '文件'}: ${path.relative(root, file)}`);
  }
}

function copyRequired(src, dest, label) {
  requireFile(src, label);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest);
}

function pruneMuslPackages(nodeModules) {
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageDir = path.join(nodeModules, entry.name);
    if (/linuxmusl/i.test(entry.name)) {
      rmSync(packageDir, { recursive: true, force: true });
    } else if (entry.name.startsWith('@')) {
      for (const scopedEntry of readdirSync(packageDir, { withFileTypes: true })) {
        if (scopedEntry.isDirectory() && /linuxmusl/i.test(scopedEntry.name)) {
          rmSync(path.join(packageDir, scopedEntry.name), { recursive: true, force: true });
        }
      }
    }
  }
}

// node-pty 双二进制错配防护（issue #206）：lib/utils.js 的 loadNativeModule
// 按 ['build/Release','build/Debug','prebuilds/<platform>-<arch>'] 顺序加载，
// build/Release 里的 pty.node 若是历史残留/编译机产物（旧签名），会先于
// prebuilds 被 require，终端首个 resize 即崩（Linux 实测，Windows 同构）。
// 装配后把两份二进制做内容核对：不一致（或 reads 失败）直接删 build 目录，
// 强制加载逻辑落到随包分发的 prebuilds 预编译产物；prebuilds 也缺失时
// 保留 build（别无选择）并告警。
function healNodePtyPlugin(nodeModules, platform, arch) {
  const ptyDir = path.join(nodeModules, 'node-pty');
  const buildDir = path.join(ptyDir, 'build');
  if (!existsSync(buildDir)) return;
  const buildRelease = path.join(buildDir, 'Release', 'pty.node');
  const prebuilt = path.join(ptyDir, 'prebuilds', `${platform}-${arch}`, 'pty.node');
  const hasBuild = existsSync(buildRelease);
  const hasPre = existsSync(prebuilt);
  if (!hasBuild) return;
  if (!hasPre) {
    console.warn(`[stage] node-pty prebuilds/${platform}-${arch} 缺失，保留 build/Release 兜底（构建机残留风险）`);
    return;
  }
  try {
    const a = readFileSync(buildRelease);
    const b = readFileSync(prebuilt);
    if (a.equals(b)) {
      console.log('[stage] node-pty build/Release 与 prebuilds 一致，保留');
      return;
    }
  } catch {}
  console.log('[stage] node-pty build/Release 与 prebuilds 不一致，剔除 build 目录（强制走 prebuilds 预编译产物）');
  rmSync(buildDir, { recursive: true, force: true });
}

console.log(`[stage] 目标平台 ${targetPlatform}；清理旧装配目录` + (skipNpm ? '（--skip-npm：保留上次的生产 node_modules）' : ''));
// 注意：node_modules 必须在整树清空前判定并豁免，否则 --skip-npm 永远不生效
// （先 rm 全目录再 existsSync 检查，检查对象必不存在）。
const stagedNm = path.join(staged, 'dsh-desktop', 'node_modules');
const platformStamp = path.join(staged, '.node-modules-platform');
const keepStagedNm = canReuseStagedNodeModules(
  skipNpm,
  targetPlatform,
  process.arch,
  stagedNm,
  platformStamp,
);
if (skipNpm && existsSync(stagedNm) && !keepStagedNm) {
  console.log('[stage] 上次 node_modules 的目标平台未知或不匹配，将重新安装');
}
rmSync(path.join(staged, 'sidecar'), { recursive: true, force: true });
if (keepStagedNm) {
  for (const entry of readdirSync(path.join(staged, 'dsh-desktop'))) {
    if (entry === 'node_modules') continue;
    rmSync(path.join(staged, 'dsh-desktop', entry), { recursive: true, force: true });
  }
} else {
  rmSync(staged, { recursive: true, force: true });
}
mkdirSync(path.join(staged, 'sidecar'), { recursive: true });
mkdirSync(path.join(staged, 'dsh-desktop'), { recursive: true });

console.log('[stage] 编译 TypeScript（tsc 就地产物）');
execSync('npx tsc -p tsconfig.json', { cwd: dd, stdio: 'inherit' });

console.log('[stage] sidecar 产物');
// v6 严格模式：sidecar 只装 server + bridge + 内部 boot glue。
for (const f of ['server.js', 'bridge.js', 'capability-stubs.js']) {
  cpSync(path.join(root, 'tauri-shell', 'sidecar', f), path.join(staged, 'sidecar', f));
}

console.log('[stage] dsh-desktop 根模块 + lib/desktop + scripts + package.json');
for (const f of ROOT_FILES) {
  const src = path.join(dd, f);
  copyRequired(src, path.join(staged, 'dsh-desktop', f), '根模块');
}
mkdirSync(path.join(staged, 'dsh-desktop', 'lib', 'desktop'), { recursive: true });
for (const f of LIB_DESKTOP) {
  copyRequired(path.join(dd, 'lib', 'desktop', f), path.join(staged, 'dsh-desktop', 'lib', 'desktop', f), '桌面库');
}
console.log('[stage] 通用 lib 模块');
for (const f of LIB_VNEXT) {
  copyRequired(path.join(dd, 'lib', f), path.join(staged, 'dsh-desktop', 'lib', f), '通用库');
}
if (NATIVE_MODULES.length) {
  mkdirSync(path.join(staged, 'dsh-desktop', 'native'), { recursive: true });
  for (const f of NATIVE_MODULES) {
    copyRequired(path.join(dd, 'native', f), path.join(staged, 'dsh-desktop', 'native', f), '原生模块');
  }
}
mkdirSync(path.join(staged, 'dsh-desktop', 'scripts'), { recursive: true });
for (const f of SCRIPTS) {
  copyRequired(path.join(dd, 'scripts', f), path.join(staged, 'dsh-desktop', 'scripts', f), '脚本');
}
// （v6 Task 3.1：feature-pack 链路自检随功能包面剥出——feature-pack-cli.js
// 与 feature-pack.js 均不在最简本体装配清单，成对校验无对象。）
// package.json + lock 原样拷贝（npm ci 要求两者一致；--omit=dev 只装生产树）。
// .npmrc（legacy-peer-deps）必须随行：内核包互相声明 peer，staged 目录里的
// npm ci 若不带该配置会因 lock 缺 peer 闭包直接 EUSAGE 拒装（全新打包必踩）。
copyRequired(path.join(dd, 'package.json'), path.join(staged, 'dsh-desktop', 'package.json'), 'package.json');
copyRequired(path.join(dd, 'package-lock.json'), path.join(staged, 'dsh-desktop', 'package-lock.json'), 'package-lock.json');
copyRequired(path.join(dd, '.npmrc'), path.join(staged, 'dsh-desktop', '.npmrc'), '.npmrc');

// 安装形态标记（v5.4 双形态）：随包默认「完整版」；NSIS 安装器按用户选择
// 覆写为 lite（installer-hooks.nsh POSTINSTALL）。便携包保持缺省完整版。
writeFileSync(path.join(staged, 'dsh-desktop', 'profile.txt'), 'full\n');

// v6 Task 3.1（ADR 0006）：最简本体资产面。不再整树拷贝 assets/ ——
// plugins（102MB）与 skins（26MB）属剥离集（Task 1.2/3.2/4/5/6 接回），
// sdk-plugins / onboarding.html 随插件系统剥出（无插件可选则无向导）。
// 保留：图标（壳层窗口/托盘消费）、主窗口 WS 客户端、
// SOURCES.json（溯源台账随内核组件保留）、
// skills（6KB，eac-desktop-tips 是对话内提示技能，非插件面）。
// 壳层皮肤包（shell-skin/，ADR 0005）若存在则随行 —— 那是本体接缝。
console.log('[stage] assets（v6 最简本体：图标 + WS 客户端 + skills + 壳层皮肤）');
{
  const keep = [
    'icon.ico', 'icon.jpg', 'icon.png', 'tray-icon.png',
    'ws-jsonrpc-client.js', 'SOURCES.json',
  ];
  for (const name of keep) {
    copyRequired(path.join(dd, 'assets', name), path.join(staged, 'dsh-desktop', 'assets', name), '本体资产');
  }
  cpSync(path.join(dd, 'assets', 'skills'), path.join(staged, 'dsh-desktop', 'assets', 'skills'), { recursive: true });
  const shellSkin = path.join(dd, 'assets', 'shell-skin');
  if (existsSync(shellSkin)) {
    cpSync(shellSkin, path.join(staged, 'dsh-desktop', 'assets', 'shell-skin'), { recursive: true });
    console.log('[stage] 壳层皮肤包已随行（ADR 0005 接缝）');
  }
  // v6 Task 3.3：内置插件随行。只拷当前已接回的内置插件目录
  //（ADR 0008 builtin 集合的子集；syncCompanionPlugins 对目录缺失的插件
  // 记录日志并跳过，因此分阶段接回无需改同步器）。
  const BUILTIN_PLUGIN_DIRS = [
    // 阶段 1（PR #392）：零外设依赖的试点插件
    'dsh-terminal',
    'dsh-viewport-lock',
    'dsh-eac-locale-compat',
    // 阶段 2：不依赖 window.dshDesktop 已删桥接面的 7 个 builtin 插件。
    // 余下 6 个（balance / client-file-changes / file-drop-eac /
    // plugin-manager / plugin-shield / plugin-wizard）依赖 ADR 0006 v5
    // 整体删除的方法族，需先恢复 bridge 契约，不在 Task 3.3 范围。
    'dsh-compact',
    'dsh-eac-core-bridge',
    'dsh-easy-setup',
    'dsh-file-changes',
    'dsh-settings-scroll-fix',
    'dsh-skin-switch',
    'dsh-unified-market',
    // 阶段 3：服务端 RPC / bridge 面已随本批接回
    'dsh-plugin-manager',
    'dsh-plugin-shield',
    'dsh-file-drop-eac',
    'dsh-client-file-changes',
  ];
  for (const dir of BUILTIN_PLUGIN_DIRS) {
    const from = path.join(dd, 'assets', 'plugins', dir);
    if (!existsSync(from)) {
      throw new Error(`[stage] 内置插件目录缺失: assets/plugins/${dir}`);
    }
    cpSync(from, path.join(staged, 'dsh-desktop', 'assets', 'plugins', dir), { recursive: true });
  }
  console.log(`[stage] 内置插件已随行（Task 3.3，${BUILTIN_PLUGIN_DIRS.length} 个）`);
}

// dsh-distribution 发行版描述符（阶段 3）：组件清单来自插件来源台账
// （assets/SOURCES.json）+ 内核钉版；协议仍为 Draft，描述符随每次打包重算。
{
  const info = genDistributionDescriptor({
    ddRoot: dd,
    stagedOut: path.join(staged, 'dsh-desktop'),
  });
  console.log(`[stage] distribution-descriptor.json（内核 ${info.kernelVersion}，组件 ${info.components}）`);
}

console.log('[stage] vendor node/npm 运行时');
mkdirSync(path.join(staged, 'dsh-desktop', 'vendor'), { recursive: true });
const runtimeName = targetPlatform === 'win32' ? 'node.exe' : 'node';
copyRequired(
  path.join(dd, 'vendor', 'node', runtimeName),
  path.join(staged, 'dsh-desktop', 'vendor', 'node', runtimeName),
  `${targetPlatform} Node runtime`,
);
if (targetPlatform === 'linux' || targetPlatform === 'darwin') {
  chmodSync(path.join(staged, 'dsh-desktop', 'vendor', 'node', runtimeName), 0o755);
}
// vendor/npm 与 vendor/node、vendor/kernel 同为必需项：随包 node 运行内核需要
// npm，静默跳过会产出缺 npm 的坏树 —— 与其他 vendor 项一致 fail-fast。
const npmCache = path.join(dd, 'vendor', 'npm');
if (existsSync(npmCache)) {
  cpSync(npmCache, path.join(staged, 'dsh-desktop', 'vendor', 'npm'), { recursive: true });
} else {
  throw new Error('[stage] vendor/npm 缺失：先运行 npm run fetch-npm 重建 npm 运行时缓存');
}

// 内核 tarball 缓存（0.1.2 起内核不在 npm registry 上：package.json 的
// 依赖/overrides 全部指向 file:vendor/kernel/<version>/*.tgz）。staged 树的
// npm ci 需要这些 tarball 就位才能解析；8MB 级，直接整目录拷贝。
const kernelCache = path.join(dd, 'vendor', 'kernel');
if (existsSync(kernelCache)) {
  copyKernelCacheForTarget(
    kernelCache,
    path.join(staged, 'dsh-desktop', 'vendor', 'kernel'),
    targetPlatform,
  );
  console.log('[stage] vendor/kernel 内核 tarball 缓存已拷贝（package.json file: 依赖解析用）');
} else {
  throw new Error('[stage] vendor/kernel 缺失：先运行 npm run fetch-kernel 重建内核缓存');
}

console.log('[stage] 生产 node_modules（npm ci --omit=dev --ignore-scripts，首次较慢）');
const nmDest = path.join(staged, 'dsh-desktop', 'node_modules');
if (!keepStagedNm) {
  const stagedDesktop = path.join(staged, 'dsh-desktop');
  const stagedKernel = path.join(stagedDesktop, 'vendor', 'kernel');
  const manifests = ['package.json', 'package-lock.json'].map((name) => path.join(stagedDesktop, name));
  withAbsolutizedKernelManifests(manifests, stagedKernel, () => {
    // npm 11 会把 overrides 里的相对 file: 依赖基于传递依赖目录解析，继而
    // 错找 node_modules/<pkg>/vendor/kernel。安装期改为绝对 staging 路径；
    // finally 恢复相对清单，避免把构建机路径写进最终载荷。
    // stagedDesktop 只含运行时文件，不含 tsconfig；生命周期脚本既无法完成，
    // 也会扩大第三方 install/postinstall 的执行面。依赖补丁在下方显式重放。
    execSync('npm ci --omit=dev --ignore-scripts --no-audit --no-fund', { cwd: stagedDesktop, stdio: 'inherit' });
  });
}

if (targetPlatform === 'linux') {
  console.log('[stage] 移除 Linux 不可达的 Windows/macOS native payload');
  rmSync(path.join(staged, 'dsh-desktop', 'assets', 'plugins', 'computer-user'), { recursive: true, force: true });
  rmSync(path.join(staged, 'dsh-desktop', 'assets', 'plugins', 'dsh-dafeiyu'), { recursive: true, force: true });
  rmSync(path.join(staged, 'dsh-desktop', 'assets', 'agent-presets'), { recursive: true, force: true });
  pruneLinuxPayloads(path.join(staged, 'dsh-desktop', 'assets'), process.arch);
  pruneNonLinuxPrebuilds(nmDest, process.arch);
  pruneLinuxPayloads(nmDest, process.arch);
  pruneMuslPackages(nmDest);
  rmSync(
    path.join(nmDest, '@koromix', `koffi-linux-${process.arch}`, `musl_${process.arch}`),
    { recursive: true, force: true },
  );
}
if (targetPlatform === 'darwin') {
  console.log('[stage] 移除 Darwin 不可达的 Windows/Linux payload');
  rmSync(path.join(staged, 'dsh-desktop', 'assets', 'plugins', 'computer-user'), { recursive: true, force: true });
  rmSync(path.join(staged, 'dsh-desktop', 'assets', 'plugins', 'dsh-dafeiyu'), { recursive: true, force: true });
  rmSync(path.join(staged, 'dsh-desktop', 'assets', 'agent-presets'), { recursive: true, force: true });
  pruneDarwinPayloads(path.join(staged, 'dsh-desktop', 'assets'));
  pruneNonDarwinPrebuilds(nmDest);
  pruneDarwinPayloads(nmDest);
}
// node-pty 双二进制防护（issue #206）：全平台统一执行（Linux 分支已清除
// 非 linux prebuilds，win 分支保留原 prebuilds）。
// 实际使用处二次校验（约束：交叉打包显式不支持）：这里按 targetPlatform ×
// process.arch 选 prebuilds 并落平台戳，与解析处护栏呼应，防后续改动绕过。
if (targetPlatform !== process.platform) {
  throw new Error(`[stage] 目标平台 ${targetPlatform} 与本机 ${process.platform}/${process.arch} 不一致，拒绝装配原生载荷`);
}
healNodePtyPlugin(nmDest, targetPlatform, process.arch);
writeStagedPlatformStamp(platformStamp, targetPlatform, process.arch);

// dsh-desktop 锚点补丁（patch-deps：可选升级字段 / picker 退出码 / 设置左栏滚动）——
// npm ci 从 registry 全新安装会还原成未打补丁的内核文件，必须在 staged 树上重放。
// 脚本幂等：npm ci 的 postinstall（patch-deps.js 已随 SCRIPTS 入 staged）若已应用则直接跳过。
console.log('[stage] 重放 dsh-desktop 锚点补丁（patch-deps）');
execSync('node scripts/patch-deps.js', { cwd: path.join(staged, 'dsh-desktop'), stdio: 'inherit' });

// 上游修复的 vendored 覆盖（bash 输出折叠，PR #181）——npm ci 会还原成
// registry 版本，把仓库内的修复副本盖回去。
// （dsh-subprocess-local 的 pwsh 超时 vendored 修复已废弃：0.1.1-rc.2 上游以
//  Promise.race(done, delay(graceMs)) 原生实现同类兜底，随 registry 版本走。）
const vendoredBashFix = path.join(dd, 'node_modules', '@deepseek-ai', 'dsh-tool-bash', 'lib', 'index.js');
if (existsSync(vendoredBashFix)) {
  cpSync(vendoredBashFix, path.join(nmDest, '@deepseek-ai', 'dsh-tool-bash', 'lib', 'index.js'));
  console.log('[stage] 已回填 dsh-tool-bash 的 vendored 修复');
}

const sanitizedClients = sanitizeClientBuildPaths(nmDest);
console.log(`[stage] 已清理 ${sanitizedClients} 个内核 client bundle 的构建机路径`);

// 捆绑依赖完整性清单（issue #7）：对**最终载荷**（npm ci + 补丁 + vendored
// 回填之后）逐包计文件数，落 bundle-manifest.json。启动期 sidecar 的
// boot.start 在拉起服务前复查比对 —— 空壳包（升级中断残留）会以
// 明确文案提示重装，而不是 ERR_MODULE_NOT_FOUND 循环。
// （Electron 时代由 scripts/after-pack.js 生成；Tauri 化后随 stage 生成。）
{
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const bi = req(path.join(dd, 'bundle-integrity.js'));
  const manifest = bi.buildBundleManifest(nmDest);
  writeFileSync(path.join(staged, 'dsh-desktop', 'bundle-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('[stage] bundle manifest written (' + Object.keys(manifest.packages).length + ' packages)');
}

// Tauri 的增量资源复制不会删除上一次 bundle 中已经消失的文件。只清理可由
// staged-resources 完整重建的副本，避免切换目标平台后残留异平台 payload。
for (const profile of ['debug', 'release']) {
  rmSync(path.join(root, 'tauri-shell', 'target', profile, 'sidecar'), { recursive: true, force: true });
  rmSync(path.join(root, 'tauri-shell', 'target', profile, 'dsh-desktop'), { recursive: true, force: true });
}
const appImageBundleDir = path.join(root, 'tauri-shell', 'target', 'release', 'bundle', 'appimage');
if (existsSync(appImageBundleDir)) {
  for (const entry of readdirSync(appImageBundleDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.endsWith('.AppDir')) {
      rmSync(path.join(appImageBundleDir, entry.name), { recursive: true, force: true });
    }
  }
}
rmSync(
  path.join(root, 'tauri-shell', 'target', 'release', 'bundle', 'appimage_deb'),
  { recursive: true, force: true },
);

console.log('[stage] 完成：' + staged);

// WebView2Loader.dll：webview2-com-sys 提供的当前架构 loader，必须与壳 exe 同级
// （否则 dsh-eac-shell.exe 启动即 0xC0000135 崩）。从 cargo registry 的
// webview2-com-sys 包定位（tauri build 不再重新生成该文件）。
// 约束：仅 win32 装配 —— 只有 tauri.windows.conf.json 引用该 DLL，linux/darwin
// 的 cargo registry 里根本没有 webview2-com-sys，整块跳过（否则必然误杀 exit(1)）。
if (targetPlatform === 'win32') {
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const cargoHome = process.env.CARGO_HOME || path.join(homeDir, '.cargo');
  const dest = prepareWebView2Loader({ cargoHome, arch: process.arch, staged });
  console.log('[stage] WebView2Loader.dll 已装配: ' + path.relative(root, dest));
}
