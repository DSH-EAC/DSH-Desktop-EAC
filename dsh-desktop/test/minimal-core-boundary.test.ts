import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts: string[]): string => readFileSync(join(root, ...parts), 'utf8');
const main = read('tauri-shell', 'src', 'main.rs');
const bridge = read('tauri-shell', 'sidecar', 'bridge.ts');
const hostProfile = read('tauri-shell', 'host-profile.json');
const server = read('tauri-shell', 'sidecar', 'server.ts');
const stubs = read('tauri-shell', 'sidecar', 'capability-stubs.ts');
const stage = read('tauri-shell', 'stage-resources.mjs');
const build = read('tauri-shell', 'build.rs');
const platform = read('dsh-desktop', 'lib', 'desktop', 'platform.ts');
const skinAssets = [
  read('tauri-shell', 'host-profile.json'),
  read('tauri-shell', 'skin-manager-artifact.lock.json'),
  read('tauri-shell', 'artifacts', 'resolved', 'system.default', 'skin.json'),
  read('tauri-shell', 'artifacts', 'resolved', 'system.default', 'snapshot.json'),
].join('\n');

test('minimal shell has no recovery center entry points', () => {
  assert.doesNotMatch(main, /\/recovery-center|DSH_DESKTOP_RECOVERY|"rc\.open"|"shell\.relaunch-safe-mode"/);
  assert.equal(existsSync(join(root, 'dsh-desktop', 'assets', 'recovery-center.html')), false);
  assert.equal(existsSync(join(root, 'dsh-desktop', 'assets', 'recovery-center-preload.js')), false);
  assert.doesNotMatch(skinAssets, /recovery-center(?:\.html)?|恢复中心|safe-mode|card-raised/);
});

test('minimal sidecar does not register retired recovery RPC families', () => {
  assert.doesNotMatch(server, /DSH_DESKTOP_RECOVERY/);
  assert.doesNotMatch(server, /stubs\.(?:rcMethods|rescueMethods|guardMethods)/);
  assert.doesNotMatch(stubs, /['"](?:rc|rescue|guard)\.[\w-]+['"]\s*:/);
});

// v6 Task 3.3：插件系统接回后，平台抽象重新暴露插件能力矩阵。
// 原断言（pluginCapabilityDetails 不存在）随接回反转：现在锁住它必须存在，
// 且保持按平台判定可用性的语义。防呆方向由"必须不存在"改为"必须存在且完整"。
test('platform abstraction exposes plugin capability matrix after Task 3.3', () => {
  assert.match(platform, /pluginCapabilityDetails/);
  assert.match(platform, /PluginCapability/);
  assert.match(platform, /status: 'supported' \| 'external-dependency' \| 'unavailable'/);
  // 四个受能力矩阵管辖的插件必须全部有平台判定项。
  for (const id of ['computer-user', 'picturereader', 'dsh-dafeiyu', 'dsh-stt']) {
    assert.match(platform, new RegExp(`${id}`), `能力矩阵缺少 ${id}`);
  }
});

test('minimal shell has no float, update, about, or renderer heartbeat implementation', () => {
  assert.doesNotMatch(main, /"float\.(?:open|close)"|fn open_float_window|fn update_page|fn about_page/);
  assert.doesNotMatch(main, /"(?:client-update\.(?:show|hide)|shell\.about|shell\.exit-dismiss|log\.renderer-heartbeat)"/);
});

test('staging excludes retired recovery and isolation modules', () => {
  // v6 Task 3.3：插件治理闭包接回后，plugin-copy.js 重新进入装配面
  //（companion-sync 消费），故自退役清单移除；其余仍必须被排除。
  for (const retired of [
    'recovery-center.html',
    'recovery-center-preload.js',
    'state.js',
    'log.js',
    'logger.js',
    'shared/protocol.js',
  ]) {
    const escaped = retired.replaceAll('.', '\\.');
    // 词边界防止子串误匹配（如 plugin-manager-state.js 含 'state.js'）。
    assert.doesNotMatch(stage, new RegExp(`(^|[^-\\w])${escaped}`));
  }
  // 接回项必须真实进入装配清单，反向锁住 Task 3.3 不被回退。
  for (const revived of ['plugin-copy.js', 'companion-sync.js', 'guard-box.js', 'plugin-ops.js', 'file-roots.js']) {
    assert.match(stage, new RegExp(revived.replaceAll('.', '\\.')));
  }
});

test('minimal shell keeps boot recovery, native window actions, and system notification', () => {
  assert.match(server, /['"]boot\.start['"]\s*:/);
  assert.match(server, /['"]boot\.restart['"]\s*:/);
  assert.match(main, /fn died_page\(/);
  assert.match(main, /"win\.minimize"\s*=>/);
  assert.match(main, /"win\.open-browser"\s*=>/);
  assert.match(main, /"win\.viewport-beat"\s*=>/);
  assert.match(main, /"shell\.system-notification"\s*=>/);
});

test('WS JSON-RPC client remains a single staged source for the main window bridge', () => {
  assert.match(build, /\.join\("assets"\)[\s\S]*\.join\("ws-jsonrpc-client\.js"\)/);
  assert.match(build, /bridge-bundle\.js/);
  assert.match(main, /BRIDGE_JS: &str = include_str!/);
  assert.match(stage, /'ws-jsonrpc-client\.js'/);
});

test('bundle integrity remains in build manifest generation and startup verification', () => {
  assert.match(stage, /buildBundleManifest|bundle-integrity\.js/);
  assert.match(server, /verifyBundle/);
});

test('UI skin startup and hot-switch paths consume dynamic HostProfile slots', () => {
  for (const slot of ['top-sidebar', 'bottom-sidebar', 'left-sidebar', 'right-sidebar', 'session', 'overlay']) {
    assert.match(hostProfile, new RegExp(`"${slot}"`), `默认 HostProfile 缺少 ${slot}`);
  }
  assert.match(main, /slot_definitions/);
  assert.match(bridge, /slotDefinitions/);
  assert.match(bridge, /removeSlots/);
  assert.match(main, /ui_skin_slot_is_supported/);
  assert.match(bridge, /UNSUPPORTED_SLOT/);
});

test('UI skin transaction keeps bootstrap and per-slot generations isolated', () => {
  class FakeStyle {
    id = '';
    textContent = '';
    removed = false;
    attributes = new Map<string, string>();
    setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
    getAttribute(name: string): string | null { return this.attributes.get(name) || null; }
    remove(): void { this.removed = true; }
  }
  const styles: FakeStyle[] = [];
  const listeners = new Map<string, ((event: any) => void)[]>();
  const document = {
    head: { appendChild(node: FakeStyle): void { styles.push(node); } },
    createElement(): FakeStyle { return new FakeStyle(); },
    getElementById(id: string): FakeStyle | undefined { return styles.find((node) => !node.removed && node.id === id); },
    querySelectorAll(selector: string): FakeStyle[] {
      const match = /data-skin-slot="([^"]+)"\]\[data-skin-generation="([^"]+)"/.exec(selector);
      if (!match) return [];
      return styles.filter((node) => !node.removed && node.attributes.get('data-skin-slot') === match[1]
        && node.attributes.get('data-skin-generation') === match[2]);
    },
  };
  class FakeCustomEvent {
    type: string;
    detail: any;
    constructor(type: string, init: {detail: any}) { this.type = type; this.detail = init.detail; }
  }
  const window = {
    __DSH_UI_SKIN_MANAGER__: {enabled: true, generation: 1, slots: {'top-sidebar': 'boot-top', session: 'boot-session'}},
    addEventListener(type: string, listener: (event: any) => void): void {
      listeners.set(type, [...(listeners.get(type) || []), listener]);
    },
    dispatchEvent(event: FakeCustomEvent): void {
      for (const listener of listeners.get(event.type) || []) listener(event);
    },
  };

  // Execute the actual bridge transaction IIFE with a minimal DOM, rather than
  // duplicating its state machine in the test.  Node's type stripping does not
  // apply to source extracted from the larger bridge, so remove only its type
  // annotations before evaluation.
  const context = {
    window,
    document,
    CustomEvent: FakeCustomEvent,

    UI_SKIN_SLOTS: {
      'top-sidebar': true,
      'bottom-sidebar': true,
      'left-sidebar': true,
      'right-sidebar': true,
      session: true,
      overlay: true,
    },
    Number,
    String,
    Error,
  };
  const start = bridge.indexOf('(function installUiSkinTransactionBridge(): void {');
  const end = bridge.indexOf('\n  })();', start);
  assert.ok(start >= 0 && end > start, 'transaction bridge IIFE must remain present');
  const transaction = bridge.slice(start, end + '\n  })();'.length)
    .replace(/:\s*(?:void|number|string|boolean|Event|Record<string, number>)/g, '')
    .replace(/:\s*Record<string, unknown>/g, '')
    .replace(/\?:\s*string/g, '')
    .replace(/([A-Za-z_$][\w$]*)\?/g, '$1')
    .replace(/:\s*HTMLStyleElement\[\]/g, '')
    .replace(/\((window|event) as (?:any|CustomEvent)\)/g, '$1')
    .replace(/\):\s*(?:boolean|string)/g, ')')
    .replace(/ as (?:any|unknown\[\]|unknown|Record<string, unknown> \| undefined)/g, '');
  const slotRefresh = `function refreshUiSkinSlots(manager) { UI_SKIN_SLOTS = {}; Object.keys((manager && manager.slotDefinitions) || {}).forEach(function (slot) { UI_SKIN_SLOTS[slot] = manager.slotDefinitions[slot]; }); Object.keys((manager && manager.slots) || {}).forEach(function (slot) { if (UI_SKIN_SLOTS[slot] === undefined) UI_SKIN_SLOTS[slot] = true; }); }`;
  vm.runInNewContext(slotRefresh + transaction, context);

  // Match startup order: the transaction bridge is installed first, then
  // injectUiSkin publishes the manager's bootstrap generation.
  const injectStart = bridge.indexOf('function injectUiSkin(): void {');
  const injectEnd = bridge.indexOf('\n  }\n\n  // Generation-aware', injectStart);
  assert.ok(injectStart >= 0 && injectEnd > injectStart, 'injectUiSkin must remain present');
  const inject = bridge.slice(injectStart, injectEnd + '\n  }'.length)
    .replace(/:\s*(?:void|number|string|boolean|Event|Record<string, number>)/g, '')
    .replace(/:\s*Record<string, unknown>/g, '')
    .replace(/\):\s*(?:boolean|string)/g, ')')
    .replace(/ as (?:any|unknown\[\]|unknown|Record<string, unknown> \| undefined)/g, '');
  const injectUiSkin = vm.runInNewContext(`(${inject})`, context) as () => void;
  injectUiSkin();
  assert.deepEqual(styles.filter((node) => !node.removed).map((node) => node.id).sort(), [
    'dsh-ui-skin-session-1',
    'dsh-ui-skin-top-sidebar-1',
  ]);

  const dispatch = (detail: any): FakeCustomEvent => {
    const event = new FakeCustomEvent('dsh-ui-skin-transaction', {detail});
    window.dispatchEvent(event);
    return event;
  };
  const acks: any[] = [];
  window.addEventListener('dsh-ui-skin-transaction-ack', (event) => acks.push(event.detail));

  dispatch({generation: 2, slots: {'top-sidebar': 'new-top'}});
  assert.equal(acks.at(-1).ok, true);
  assert.equal(styles.some((node) => node.removed && node.id === 'dsh-ui-skin-top-sidebar-1'), true);
  assert.equal(styles.some((node) => !node.removed && node.id === 'dsh-ui-skin-top-sidebar-2'), true);
  assert.equal(styles.some((node) => !node.removed && node.id === 'dsh-ui-skin-session-1'), true);

  dispatch({generation: 3, slots: {session: 'new-session'}});
  assert.equal(acks.at(-1).ok, true);
  assert.equal(styles.some((node) => node.removed && node.id === 'dsh-ui-skin-session-1'), true);
  assert.equal(styles.some((node) => !node.removed && node.id === 'dsh-ui-skin-top-sidebar-2'), true);

  const beforeStale = styles.filter((node) => !node.removed).map((node) => node.id).sort();
  dispatch({generation: 2, slots: {'top-sidebar': 'stale-top'}});
  assert.equal(acks.at(-1).error, 'STALE_OR_INVALID_GENERATION');
  assert.deepEqual(styles.filter((node) => !node.removed).map((node) => node.id).sort(), beforeStale);

  dispatch({generation: 4, slots: {'../unknown-slot': 'must-not-mount'}});
  assert.equal(acks.at(-1).error, 'UNSUPPORTED_SLOT');
  assert.deepEqual(styles.filter((node) => !node.removed).map((node) => node.id).sort(), beforeStale);

  // Slot topology is extensible: add a slot with an explicit definition,
  // update its contribution, then remove it without disturbing other slots.
  dispatch({generation: 5, slotDefinitions: {'composer': {id: 'composer'}}, slots: {composer: 'composer-v1'}});
  assert.equal(acks.at(-1).ok, true);
  assert.equal(styles.some((node) => !node.removed && node.id === 'dsh-ui-skin-composer-5'), true);
  dispatch({generation: 6, slotDefinitions: {'composer': {id: 'composer'}}, slots: {composer: 'composer-v2'}});
  assert.equal(acks.at(-1).ok, true);
  assert.equal(styles.some((node) => node.removed && node.id === 'dsh-ui-skin-composer-5'), true);
  assert.equal(styles.some((node) => !node.removed && node.id === 'dsh-ui-skin-composer-6'), true);
  dispatch({generation: 7, removeSlots: ['composer']});
  assert.equal(acks.at(-1).ok, true);
  assert.equal(styles.some((node) => !node.removed && node.id === 'dsh-ui-skin-composer-6'), false);
  assert.equal(styles.some((node) => !node.removed && node.id === 'dsh-ui-skin-top-sidebar-2'), true);
});
