import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// v6 Task 6.2.4：设置页「皮肤包」tab 的静态与行为契约。
//
// 这里是**单侧契约**测试：不跑真浏览器，但真的把插件 bundle 在受控的
// `window.__ModuleLoader__` + 假 react 下加载起来，注册 tab，并用假桥驱动组件的
// 生命周期。这样能验证 UI 的三条硬要求：
//   1. 只经桥的 skin.* RPC 与 manager 对话（不自己读文件、不自己写状态）；
//   2. 挂载时不自动应用/不自动导入（显式动作）；
//   3. 失败渲染必须带 code 与下一步。

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.join(here, '..', 'assets', 'plugins', 'dsh-skin-switch');
const clientSource = fs.readFileSync(path.join(pluginRoot, 'lib', 'client.js'), 'utf8');

interface RegisteredTab { id: string; order: number; label: string; Component: (props: Record<string, unknown>) => unknown }
interface RpcCall { method: string; params: unknown }

/** 极简 jsx runtime：只记录元素树，不渲染 DOM。 */
function createJsxRuntime() {
  const make = (type: string) => (component: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({
    type: component,
    props: props ?? {},
    children,
  });
  return { jsx: make('jsx'), jsxs: make('jsxs'), Fragment: 'Fragment' };
}

/**
 * 在受控环境里加载插件 client bundle 并执行 apply(ctx)。
 * 返回注册出来的 tab 与记录到的 RPC 调用。
 */
function loadPlugin(options: {bridge?: unknown} = {}) {
  const rpcCalls: RpcCall[] = [];
  const registered: RegisteredTab[] = [];
  const effects: Array<() => void> = [];
  const dictionaries = new Map<string, Record<string, Record<string, string>>>();
  const stateSlots: unknown[] = [];
  let stateIndex = 0;

  const bridge = options.bridge === undefined ? {
    skinManager: {
      status: () => { rpcCalls.push({method: 'skin.status', params: {}}); return Promise.resolve({ok: true, manager: {available: true, version: '1.2.3', source: 'override'}, capabilities: {catalog: true, install: true, snapshot: true, bindings: true, journal: false, recovery: false, forceEnable: false}, snapshot: null, slots: [], installed: []}); },
      inspect: (archivePath: string) => { rpcCalls.push({method: 'skin.inspect', params: {archivePath}}); return Promise.resolve({ok: true}); },
      importArchive: (archivePath: string) => { rpcCalls.push({method: 'skin.import', params: {archivePath}}); return Promise.resolve({ok: true, enabled: false}); },
      select: (slot: string, packageId: string, packageVersion: string) => { rpcCalls.push({method: 'skin.select', params: {slot, packageId, packageVersion}}); return Promise.resolve({ok: true, applied: false}); },
      deselect: (slot?: string) => { rpcCalls.push({method: 'skin.deselect', params: {slot}}); return Promise.resolve({ok: true, applied: false}); },
      apply: () => { rpcCalls.push({method: 'skin.apply', params: {}}); return Promise.resolve({ok: true, generation: 3, reloadRequired: true}); },
      revert: (slot?: string) => { rpcCalls.push({method: 'skin.revert', params: {slot}}); return Promise.resolve({ok: true, generation: 4, reloadRequired: true}); },
      diagnose: () => { rpcCalls.push({method: 'skin.diagnose', params: {}}); return Promise.resolve({ok: true, faults: [], unavailable: []}); },
    },
    windowControls: {reload: () => { rpcCalls.push({method: 'win.reload', params: {}}); return Promise.resolve({}); }},
    restartService: () => Promise.resolve({available: false}),
  } : options.bridge;

  const componentEffects: Array<() => void> = [];
  const react = {
    useState: (initial: unknown) => {
      const index = stateIndex++;
      if (!(index in stateSlots)) stateSlots[index] = initial;
      const setter = (value: unknown) => { stateSlots[index] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(stateSlots[index]) : value; };
      return [stateSlots[index], setter];
    },
    // 组件挂载副作用按 react 的语义收集，由测试在渲染后统一 flush。
    useEffect: (fn: () => void) => { componentEffects.push(fn); },
    useCallback: (fn: unknown) => fn,
  };

  const sandboxWindow = {dshDesktop: bridge, addEventListener: () => {}, dispatchEvent: () => {}};
  const loaders: Array<{id: string; factory: (require: (name: string) => unknown) => unknown}> = [];
  const sandbox = {
    window: sandboxWindow,
    document: {querySelector: () => null, createElement: () => ({dataset: {}, setAttribute: () => {}, appendChild: () => {}, remove: () => {}, style: {}}), head: {appendChild: () => {}}, getElementById: () => null},
    console,
    setTimeout,
    Promise,
  };
  (sandboxWindow as Record<string, unknown>)['__ModuleLoader__'] = {load: (entry: {id: string; factory: (require: (name: string) => unknown) => unknown}) => loaders.push(entry)};

  const context = vm.createContext(sandbox);
  vm.runInContext(clientSource, context);
  assert.equal(loaders.length, 1, 'bundle 必须注册一个模块');

  const requireShim = (name: string): unknown => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return createJsxRuntime();
    throw new Error('unexpected require: ' + name);
  };
  const exports = loaders[0]!.factory(requireShim) as {apply: (ctx: Record<string, unknown>) => void; inject: string[]};

  const ctx = {
    // cordis 的 effect 在 apply 时立即执行；测试里同步执行，保证 tab 注册时字典已就位。
    effect: (fn: () => unknown) => { effects.push(fn as () => void); try { fn(); } catch { /* 注册失败不影响 tab 断言 */ } return fn; },
    locale: {
      register: (ns: string, dicts: Record<string, Record<string, string>>) => { dictionaries.set(ns, dicts); return () => {}; },
      bind: (ns: string) => (key: string) => {
        const dict = dictionaries.get(ns);
        return dict ? (dict['zh'] ?? {})[key] ?? key : key;
      },
    },
    slots: {
      inject: (_name: string, register: () => void) => register(),
      register: (descriptor: {id: string; order: number; label: () => string}, Component: RegisteredTab['Component']) => {
        registered.push({id: descriptor.id, order: descriptor.order, label: descriptor.label(), Component});
        return () => {};
      },
    },
    remote: {$mount: () => Promise.resolve(() => {})},
    get: () => undefined,
    on: () => {},
  };
  exports.apply(ctx);
  // 字典注册在 ctx.effect 里，测试里手动跑一遍。
  for (const effect of effects) { try { effect(); } catch { /* 注册失败不影响 tab 断言 */ } }

  return {registered, rpcCalls, react, exports, stateSlots, flushEffects: () => { const pending = componentEffects.splice(0, componentEffects.length); for (const effect of pending) effect(); }, resetState: () => { stateIndex = 0; }};
}

test('注册「皮肤包」tab，且与旧 Cordis tab 分工明确', () => {
  const plugin = loadPlugin();
  const ids = plugin.registered.map((tab) => tab.id);
  assert.ok(ids.includes('skin'), '旧 tab 仍在（本任务不删除它）');
  assert.ok(ids.includes('skin-manager'), '必须注册皮肤包管理 tab');
  const managerTab = plugin.registered.find((tab) => tab.id === 'skin-manager')!;
  const legacyTab = plugin.registered.find((tab) => tab.id === 'skin')!;
  assert.ok(managerTab.order > legacyTab.order, '新 tab 排在旧 tab 之后');
  assert.equal(managerTab.label, '皮肤包');
});

test('挂载时只读一次状态，不自动导入/不自动应用', async () => {
  const plugin = loadPlugin();
  const managerTab = plugin.registered.find((tab) => tab.id === 'skin-manager')!;
  plugin.resetState();
  managerTab.Component({t: (key: string) => key});
  plugin.flushEffects();
  await new Promise((resolve) => setImmediate(resolve));
  const writes = plugin.rpcCalls.filter((call) => ['skin.import', 'skin.apply', 'skin.select', 'skin.revert'].includes(call.method));
  assert.deepEqual(writes, [], '挂载阶段不得有任何写动作：' + JSON.stringify(writes));
  assert.equal(plugin.rpcCalls.filter((call) => call.method === 'skin.status').length, 1, '只读一次状态');
});

test('UI 只经桥的 skin.* RPC 说话：不自己读写状态文件', () => {
  const forbidden = [/node:fs/, /require\(["']fs["']\)/, /snapshot\.json/, /catalog\.json/, /selection\.json/, /child_process/, /fetch\(/];
  for (const pattern of forbidden) {
    assert.ok(!pattern.test(clientSource), 'client bundle 不得直接触碰 ' + String(pattern));
  }
  // 只允许出现桥面与诊断用的字面量。
  assert.ok(/dshDesktop/.test(clientSource), '必须经 window.dshDesktop');
  assert.ok(/skinManager/.test(clientSource), '必须用 skinManager 命名空间');
});

test('失败渲染带 code 与下一步，而不是一句成功提示', () => {
  assert.ok(/fault\.code/.test(clientSource), '必须渲染 fault.code');
  assert.ok(/fault\.nextStep/.test(clientSource), '必须渲染 fault.nextStep');
  assert.ok(/nextStep/.test(clientSource) && /t\("nextStep"\)/.test(clientSource), '下一步要有标签');
});

test('缺桥时不假装可用（显示不可用而不是空成功）', () => {
  const plugin = loadPlugin({bridge: {}});
  const managerTab = plugin.registered.find((tab) => tab.id === 'skin-manager')!;
  plugin.resetState();
  managerTab.Component({t: (key: string) => key});
  const text = JSON.stringify(plugin.rpcCalls);
  assert.equal(text, '[]', '没有桥时不应发出任何 RPC');
  assert.ok(/skinManagerBridge/.test(clientSource));
});

test('应用/回退成功后会提示需要重载窗口，而不是谎称已生效', () => {
  assert.ok(/reloadRequired/.test(clientSource), '必须消费 reloadRequired');
  assert.ok(/windowControls\.reload/.test(clientSource), '重载要走壳层的 windowControls.reload');
  assert.ok(/reloadHint/.test(clientSource));
});

test('旧 tab 明确标注为旧 Cordis 路径，并在管理器有快照时点明关系', () => {
  assert.ok(/legacyNotice/.test(clientSource), '旧 tab 必须有 legacy 说明');
  assert.ok(/skinManager/.test(clientSource));
});
