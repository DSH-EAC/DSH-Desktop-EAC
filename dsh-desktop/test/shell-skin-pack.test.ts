// v6 Task 1.1 回归：壳层皮肤包（assets/shell-skin/eac-default）与壳页
// token 消费契约。
//
// 拆分前壳层 UI（Rust 内嵌页 / 磁盘壳页 / exit-overlay）的视觉全部硬编码；
// 拆分后契约（ADR 0005）：
//   1. 皮肤包三件套存在，skin.json 字段合法；
//   2. tokens.css 是 --eac-shell-* 的单一事实源（壳页只消费不定义）；
//   3. 消费处一律 var(--eac-shell-x, <fallback>)——fallback 保证皮肤包
//      缺失时降级可读；
//   4. 壳页不再出现拆分前的硬编码色（黑名单清零）；
//   5. Rust 壳 http_serve 提供 /skin/ 路由（白名单伺服）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p: string[]): string => readFileSync(join(root, ...p), 'utf8');

const packDir = join(root, 'assets', 'shell-skin', 'eac-default');
const aioPackDir = join(root, 'assets', 'shell-skin', 'aio');
const mainRs = read('..', 'tauri-shell', 'src', 'main.rs');
const overlay = read('..', 'tauri-shell', 'src', 'exit-overlay.js');

/** 以平衡括号切分顶层逗号（fallback 可含逗号/嵌套 var）。 */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

/** 解析源码中所有 var(--eac-shell-*) 消费为 [{ name, hasFallback }]。 */
function parseShellVarConsumers(src: string): { name: string; hasFallback: boolean }[] {
  const consumers: { name: string; hasFallback: boolean }[] = [];
  const re = /var\(\s*(--eac-shell-[\w-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // 从 var( 之后扫描到平衡的右括号
    let depth = 1;
    let i = re.lastIndex; // 指向 name 结束后的字符
    let body = '';
    while (i < src.length && depth > 0) {
      const ch = src[i]!;
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (depth > 0) body += ch;
      i += 1;
    }
    const args = splitTopLevel(body);
    consumers.push({ name: m[1]!, hasFallback: args.length > 1 && args.slice(1).join(',').trim().length > 0 });
    re.lastIndex = i;
  }
  return consumers;
}

/** 把每个 var(--eac-shell-*, fallback) 整体替换为占位符，用于裸色检查。 */
function stripShellVars(src: string): string {
  return src.replace(/var\(\s*--eac-shell-[\w-]+[^()]*(?:\([^()]*\)[^()]*)*\)/g, 'TOKEN');
}

function tokenNames(src: string): string[] {
  return [...src.matchAll(/(--eac-shell-[\w-]+)\s*:/g)]
    .map((match) => match[1]!)
    .sort();
}

function assertShellSkinManifest(
  dir: string,
  expected: { id: string; control: string; style: string },
): Record<string, unknown> {
  for (const f of ['skin.json', 'tokens.css', 'controls.css', 'README.md']) {
    assert.ok(existsSync(join(dir, f)), `${dir}/${f} missing`);
  }
  const manifest = JSON.parse(readFileSync(join(dir, 'skin.json'), 'utf8'));
  assert.equal(manifest.id, expected.id);
  assert.equal(manifest.type, 'skin');
  assert.equal(manifest.kind, 'shell-skin');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.match(manifest.owner, /^(?:[a-z0-9-]+\.){2,}[a-z0-9-]+$/);
  assert.equal(manifest.compatibility.profile, 'dsh-desktop-eac-ui-skin-profile@^0.3');
  assert.equal(manifest.compatibility.forceable, false);
  assert.equal(manifest.control, expected.control);
  assert.equal(manifest.style, expected.style);
  assert.equal(manifest.dependencies[manifest.control], manifest.version);
  assert.equal(manifest.dependencies[manifest.style], manifest.version);
  assert.ok(Array.isArray(manifest.assets) && manifest.assets.length > 0);
  for (const f of manifest.assets) {
    assert.ok(existsSync(join(dir, f)), `skin.json assets 声明了不存在的 ${f}`);
  }
  return manifest;
}

test('壳层皮肤包文件存在且 skin.json 符合皮肤创作公约', () => {
  assertShellSkinManifest(packDir, {
    id: 'system.default',
    control: 'system.shell-controls',
    style: 'system.shell-style',
  });
});

test('AIO 壳层皮肤包声明独立的 Skin、Control 和 Style', () => {
  assertShellSkinManifest(aioPackDir, {
    id: 'io.github.dsh-eac.skin.aio',
    control: 'io.github.dsh-eac.aio.shell-controls',
    style: 'io.github.dsh-eac.aio.shell-style',
  });
});

test('tokens.css 只定义 --eac-shell-* token（单一事实源）', () => {
  const tokens = read('assets', 'shell-skin', 'eac-default', 'tokens.css');
  const defined = tokens.match(/--eac-shell-[\w-]+\s*:/g) || [];
  assert.ok(defined.length >= 40, `token 数量异常（${defined.length}），拆分应产生完整 token 集`);
  // controls.css 不写死颜色：只消费 token
  const controls = read('assets', 'shell-skin', 'eac-default', 'controls.css');
  assert.match(controls, /var\(--eac-shell-/, 'controls.css 必须消费 token');
  // controls.css 的 var() 均在 fallback 内携带字面量
  const bare = stripShellVars(controls);
  assert.doesNotMatch(bare, /#[0-9a-fA-F]{6}\b/, 'controls.css fallback 之外不得出现硬编码 hex 色');
});

test('AIO token 与默认包契约兼容且不污染内核命名空间', () => {
  const defaults = read('assets', 'shell-skin', 'eac-default', 'tokens.css');
  const aio = read('assets', 'shell-skin', 'aio', 'tokens.css');
  assert.deepEqual(tokenNames(aio), tokenNames(defaults), 'AIO 必须完整实现默认壳层 token 集');
  assert.doesNotMatch(aio, /--(?:dsw|aion)-[\w-]+\s*:/, 'AIO 不得定义 dsh 内核 token');
  assert.match(aio, /#5b8cff/i, 'AIO 强调色应保留 aio-v1 的 #5b8cff');
  assert.match(aio, /radial-gradient\(1200px 600px at 50% -10%/i, 'AIO 应保留 aio-v1 的启动页背景');
});

test('AIO controls.css 只消费包内声明的壳层 token', () => {
  const tokens = read('assets', 'shell-skin', 'aio', 'tokens.css');
  const controls = read('assets', 'shell-skin', 'aio', 'controls.css');
  const declared = new Set(tokenNames(tokens));
  const consumers = parseShellVarConsumers(controls);
  assert.ok(consumers.length > 0, 'AIO controls.css 必须消费 --eac-shell-* token');
  for (const consumer of consumers) {
    assert.ok(declared.has(consumer.name), `AIO controls.css 消费了未声明的 ${consumer.name}`);
    assert.ok(consumer.hasFallback, `${consumer.name} 必须携带降级 fallback`);
  }
  assert.doesNotMatch(controls, /var\(\s*--(?:dsw|aion)-/, 'AIO controls.css 不得消费 dsh 内核 token');
  const bare = stripShellVars(controls);
  assert.doesNotMatch(bare, /#[0-9a-fA-F]{6}\b/, 'AIO controls.css fallback 之外不得出现硬编码 hex 色');
});

test('AIO 包只包含声明、token、控件样式和说明文档', () => {
  const entries = readdirSync(aioPackDir, { withFileTypes: true });
  assert.deepEqual(
    entries.map((entry) => entry.name).sort(),
    ['README.md', 'controls.css', 'skin.json', 'tokens.css'],
  );
  assert.ok(entries.every((entry) => entry.isFile()), 'AIO 包不应包含业务入口或嵌套运行时代码');
});

test('壳页 token 消费处必须带 fallback 字面量（降级契约）', () => {
  const consumers: [string, string][] = [
    ['assets/onboarding.html', read('assets', 'onboarding.html')],
    ['assets/recovery-center.html', read('assets', 'recovery-center.html')],
    ['tauri-shell/src/exit-overlay.js', overlay],
    ['tauri-shell/src/main.rs', mainRs],
  ];
  for (const [name, src] of consumers) {
    const parsed = parseShellVarConsumers(src);
    assert.ok(parsed.length > 0, `${name} 未消费任何 --eac-shell-* token`);
    const noFallback = parsed.filter((c) => !c.hasFallback).map((c) => c.name);
    assert.deepEqual(noFallback, [], `${name} 存在无 fallback 的 token 消费`);
  }
  // 两个磁盘壳页与 Rust 内嵌页都引用皮肤包
  for (const p of ['assets/onboarding.html', 'assets/recovery-center.html']) {
    assert.match(read(...(p.split('/') as ['assets', string])), /\/skin\/tokens\.css/, `${p} 必须引用皮肤包`);
  }
  assert.ok(mainRs.includes('var(--eac-shell-bg-base,#0b1220)'), 'main.rs 内嵌页须消费 bg-base token');
  assert.ok(mainRs.includes('/skin/tokens.css'), 'main.rs 须注入皮肤包 link');
});

test('壳页不再持有拆分前的硬编码色（黑名单清零）', () => {
  // 仅检查 var()/fallback 之外的裸色值。fallback 中的同值字面量是降级
  // 契约的一部分，合法。
  const banned = ['#0b1220', '#1b2a6b', '#dfe6ff', '#8b9ac4', '#5f6f9c', '#5b8cff'];
  const targets: [string, string][] = [
    ['assets/onboarding.html', read('assets', 'onboarding.html')],
    ['assets/recovery-center.html', read('assets', 'recovery-center.html')],
    ['tauri-shell/src/exit-overlay.js', overlay],
    ['tauri-shell/src/main.rs', mainRs],
  ];
  for (const [name, src] of targets) {
    const stripped = stripShellVars(src);
    for (const hex of banned) {
      assert.ok(!stripped.includes(hex), `${name} 仍含裸硬编码色 ${hex}`);
    }
  }
});

test('http_serve 提供 /skin/ 白名单路由', () => {
  assert.match(mainRs, /strip_prefix\("\/skin\/"\)/, '须有 /skin/ 路由');
  assert.match(mainRs, /fn shell_skin_css/, '须有皮肤包文件伺服函数');
  // 白名单：只放行包内固定文件名
  const fn = mainRs.slice(mainRs.indexOf('fn shell_skin_css'), mainRs.indexOf('async fn http_serve'));
  assert.match(fn, /matches!\(file, "tokens\.css" \| "controls\.css"\)/, '只放行 tokens.css/controls.css');
  assert.match(fn, /\.join\("eac-default"\)/, '#363 不改变生产环境默认皮肤');
  assert.doesNotMatch(fn, /\.join\("aio"\)/, 'AIO 运行时选择属于后续任务');
});
