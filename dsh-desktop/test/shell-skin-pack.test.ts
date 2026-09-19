import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const skinRoot = join(repoRoot, 'dsh-desktop', 'assets', 'ui-skin', 'system-default');
const profile = 'dsh-desktop-eac-ui-skin-profile@^0.3';
const predefinedStates = [
  'empty',
  'idle',
  'loading',
  'running',
  'success',
  'warning',
  'error',
  'disabled',
  'collapsed',
  'hidden',
  'docked',
  'floating',
  'detached',
  'dragging',
  'drop-target',
  'dangerous',
  'animating',
] as const;
const regions = [
  'top-sidebar',
  'bottom-sidebar',
  'left-sidebar',
  'right-sidebar',
  'session',
  'overlay',
] as const;
const instanceControls = [
  'popup-surface',
  'dialog-surface',
  'dialog-backdrop',
] as const;
const productionConsumers = [
  'tauri-shell/src/main.rs',
  'tauri-shell/src/exit-overlay.js',
  'tauri-shell/sidecar/bridge.ts',
];

interface Compatibility {
  profile: string;
  forceable: boolean;
}

interface Declaration {
  region: string;
  controls?: string[];
  states?: string[];
}

interface BaseManifest {
  id: string;
  type: 'skin' | 'control' | 'style' | 'slot';
  version: string;
  owner: string;
  compatibility: Compatibility;
}

interface SkinManifest extends BaseManifest {
  type: 'skin';
  control: { id: string; version: string };
  style: { id: string; version: string };
}

interface ControlManifest extends BaseManifest {
  type: 'control';
  declarations: Declaration[];
  instanceControls: { kind: string; controls: string[] }[];
  privateControls: string[];
  consumers: string[];
  assets: string[];
}

interface StyleManifest extends BaseManifest {
  type: 'style';
  declarations: Declaration[];
  assets: string[];
}

interface SlotManifest extends BaseManifest {
  type: 'slot';
  regions: { name: string; controlSlot: string; styleSlot: string; defaultZIndex: number }[];
}

function read(...parts: string[]): string {
  return readFileSync(join(repoRoot, ...parts), 'utf8');
}

function readSkinFile(...parts: string[]): string {
  return readFileSync(join(skinRoot, ...parts), 'utf8');
}

function manifest<T>(...parts: string[]): T {
  return JSON.parse(readSkinFile(...parts)) as T;
}

function tokenDefinitions(source: string): Set<string> {
  return new Set(Array.from(source.matchAll(/(--eac-shell-[\w-]+)\s*:/g), (match) => match[1]!));
}

function tokenConsumers(source: string): { name: string; hasFallback: boolean }[] {
  const consumers: { name: string; hasFallback: boolean }[] = [];
  const tokenStart = /var\(\s*(--eac-shell-[\w-]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenStart.exec(source)) !== null) {
    let depth = 1;
    let cursor = tokenStart.lastIndex;
    let hasTopLevelComma = false;
    let fallbackHasContent = false;

    while (cursor < source.length && depth > 0) {
      const char = source[cursor]!;
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (depth === 1 && char === ',') {
        hasTopLevelComma = true;
      } else if (hasTopLevelComma && depth > 0 && !/\s/.test(char)) {
        fallbackHasContent = true;
      }
      cursor += 1;
    }

    consumers.push({
      name: match[1]!,
      hasFallback: hasTopLevelComma && fallbackHasContent,
    });
    tokenStart.lastIndex = cursor;
  }

  return consumers;
}

test('default skin is split into independently identifiable packages', () => {
  for (const path of [
    '../registry.json',
    'skin.json',
    'README.md',
    'control/control.json',
    'control/layout.css',
    'style/style.json',
    'style/tokens.css',
    'style/states.css',
    'slot/slot.json',
  ]) {
    assert.equal(existsSync(join(skinRoot, path)), true, `${path} missing`);
  }

  const skin = manifest<SkinManifest>('skin.json');
  const control = manifest<ControlManifest>('control', 'control.json');
  const style = manifest<StyleManifest>('style', 'style.json');
  const slot = manifest<SlotManifest>('slot', 'slot.json');

  assert.deepEqual([skin.type, control.type, style.type, slot.type], ['skin', 'control', 'style', 'slot']);
  assert.deepEqual([skin.id, control.id, style.id, slot.id], [
    'system.default',
    'system.default.control',
    'system.default.style',
    'system.default.slot',
  ]);
  assert.deepEqual(skin.control, { id: control.id, version: control.version });
  assert.deepEqual(skin.style, { id: style.id, version: style.version });
  assert.deepEqual(control.assets, ['layout.css']);
  assert.equal(Object.hasOwn(skin, 'slot'), false, 'skin must not aggregate a slot package');

  for (const item of [skin, control, style, slot]) {
    assert.equal(item.owner, 'io.github.dsh-eac');
    assert.equal(item.compatibility.profile, profile);
    assert.equal(item.compatibility.forceable, false);
    assert.doesNotMatch(JSON.stringify(item), /shell-skin/);
  }
});

test('slot, control, and style packages share the complete region contract', () => {
  const control = manifest<ControlManifest>('control', 'control.json');
  const style = manifest<StyleManifest>('style', 'style.json');
  const slot = manifest<SlotManifest>('slot', 'slot.json');
  const expected = [...regions].sort();

  assert.deepEqual(control.declarations.map(({ region }) => region).sort(), expected);
  assert.deepEqual(style.declarations.map(({ region }) => region).sort(), expected);
  assert.deepEqual(slot.regions.map(({ name }) => name).sort(), expected);

  for (const region of slot.regions) {
    assert.equal(region.controlSlot, `${region.name}.control`);
    assert.equal(region.styleSlot, `${region.name}.style`);
    assert.equal(Number.isInteger(region.defaultZIndex), true);
  }

  const contractControls = new Set(control.declarations.flatMap(({ controls }) => controls ?? []));
  for (const name of [
    'sidebar-root',
    'sidebar-content',
    'sidebar-collapse-toggle',
    'session-root',
    'session-content',
    'conversation-list',
    'message-list',
    'composer',
    'composer-input',
    'composer-actions',
    'submit-button',
    'stop-button',
    'overlay-root',
    'overlay-backdrop',
    'overlay-content',
    'overlay-close',
  ]) {
    assert.equal(contractControls.has(name), true, `missing contract control ${name}`);
  }

  const instances = new Set(control.instanceControls.flatMap(({ controls }) => controls));
  for (const name of instanceControls) assert.equal(instances.has(name), true, `missing instance control ${name}`);
  assert.equal(slot.regions.some(({ name }) => /popup|dialog|floating-window/.test(name)), false);
  assert.ok(control.privateControls.length > 0);
  assert.deepEqual(control.privateControls.filter((name) => !/^system\.default\.[a-z][a-z0-9-]*$/.test(name)), []);
});

test('all predefined states are declared and style-addressable without interaction aliases', () => {
  const control = manifest<ControlManifest>('control', 'control.json');
  const style = manifest<StyleManifest>('style', 'style.json');
  const statesCss = readSkinFile('style', 'states.css');
  const declaredControlStates = new Set(control.declarations.flatMap(({ states }) => states ?? []));
  const declaredStyleStates = new Set(style.declarations.flatMap(({ states }) => states ?? []));

  assert.deepEqual([...declaredControlStates].sort(), [...predefinedStates].sort());
  assert.deepEqual([...declaredStyleStates].sort(), [...predefinedStates].sort());
  for (const state of predefinedStates) {
    assert.match(statesCss, new RegExp(`\\[data-state~=["']${state}["']\\]`), `missing selector for ${state}`);
  }
  for (const alias of ['default', 'hover', 'focus', 'pressed', 'selected', 'active']) {
    assert.equal(declaredControlStates.has(alias), false, `${alias} is not a predefined state`);
  }
  assert.match(statesCss, /:hover/);
  assert.match(statesCss, /:focus-visible/);
  assert.match(statesCss, /:active/);
  assert.match(statesCss, /\[aria-selected=["']true["']\]/);
});

test('style assets own the token interface without host-side visual declarations', () => {
  const style = manifest<StyleManifest>('style', 'style.json');
  assert.deepEqual(style.assets, ['tokens.css', 'states.css']);

  const tokens = readSkinFile('style', 'tokens.css');
  const states = readSkinFile('style', 'states.css');
  const definitions = tokenDefinitions(tokens);
  assert.ok(definitions.size > 0);

  const consumers = tokenConsumers(states);
  assert.ok(consumers.length > 0, 'style package must consume shell tokens');
  assert.deepEqual(consumers.filter(({ hasFallback }) => !hasFallback), []);
  assert.deepEqual(consumers.filter(({ name }) => !definitions.has(name)), []);

  for (const path of productionConsumers) {
    assert.doesNotMatch(read(...path.split('/')), /--eac-shell-/, `${path} bypasses the style package`);
  }
});

test('runtime exposes stable region, control, and state anchors and loads the split style', () => {
  const control = manifest<ControlManifest>('control', 'control.json');
  assert.deepEqual(control.consumers, productionConsumers);

  const main = read('tauri-shell', 'src', 'main.rs');
  const overlay = read('tauri-shell', 'src', 'exit-overlay.js');
  const bridge = read('tauri-shell', 'sidecar', 'bridge.ts');

  assert.match(main, /\/skin\/control\/layout\.css/);
  assert.match(main, /\/skin\/style\/tokens\.css/);
  assert.match(main, /\/skin\/style\/states\.css/);
  assert.match(main, /data-region=/);
  assert.match(main, /data-control-name=/);
  assert.match(main, /data-state=/);
  assert.doesNotMatch(main, /\.join\("shell-skin"\)/);
  assert.match(main, /\.join\("ui-skin"\)/);
  assert.match(main, /registry\.default\.directory/);
  assert.match(main, /registry\.json/);
  assert.match(main, /ui_skin_directory_is_safe/);

  for (const source of [overlay, bridge]) {
    assert.match(source, /data-region/);
    assert.match(source, /data-control-name/);
  }
  assert.match(overlay, /data-state/);
  assert.match(overlay, /system\.default\.exit-/);
  assert.match(overlay, /data-control-name=\"dialog-surface\"/);
  assert.match(bridge, /top-sidebar/);
  assert.match(bridge, /left-sidebar/);
  assert.match(bridge, /right-sidebar/);
  assert.match(bridge, /session/);
  assert.match(bridge, /popup-surface/);
  assert.match(bridge, /dialog-surface/);
  const layout = readSkinFile('control', 'layout.css');
  const states = readSkinFile('style', 'states.css');
  assert.doesNotMatch(layout, /nth-child|\[class\*=/);
  assert.match(layout, /button\[data-control-name\^="window-"\]/);
  assert.match(states, /button\[data-control-name\^="window-"\]/);
});

test('retired surfaces stay outside the built-in packages', () => {
  const retiredPageLanguage = /recovery(?:-center)?|onboarding|update|about|恢复中心|安全模式|向导/i;
  const packageText = [
    readSkinFile('skin.json'),
    readSkinFile('README.md'),
    readSkinFile('control', 'control.json'),
    readSkinFile('style', 'style.json'),
    readSkinFile('style', 'tokens.css'),
    readSkinFile('style', 'states.css'),
    readSkinFile('slot', 'slot.json'),
  ].join('\n');

  assert.doesNotMatch(packageText, retiredPageLanguage);
});
