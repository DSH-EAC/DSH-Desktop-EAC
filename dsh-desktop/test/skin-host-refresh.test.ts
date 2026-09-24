import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {JSDOM} from 'jsdom';

// npm pretest builds bridge.js, the actual input consumed by build.rs.
// Run the same DOM/CSS assertions against source and compiled artifact.
const bridges = {
  source: stripTypeScriptTypes(readFileSync(new URL('../../tauri-shell/sidecar/bridge.ts', import.meta.url), 'utf8')),
  built: readFileSync(new URL('../../tauri-shell/sidecar/bridge.js', import.meta.url), 'utf8'),
};
for (const [artifact, bridge] of Object.entries(bridges)) {
const slots = ['top-sidebar', 'bottom-sidebar', 'left-sidebar', 'right-sidebar', 'session', 'overlay'];
function snapshot(generation, color) {
  return {enabled: true, generation, slots: Object.fromEntries(slots.map(s => [s, `#probe {color:${color}}`]))};
}
async function load(current, fail = false) {
  const dom = new JSDOM('<html><head></head><body><div id="probe">test</div></body></html>', {runScripts:'outside-only', pretendToBeVisual:true});
  const w = dom.window;
  // Disconnect bridge observers before closing the document: jsdom 30.0.1
  // otherwise schedules a menu rAF against the already-closed window.
  const observers = [];
  const NativeObserver = w.MutationObserver;
  w.MutationObserver = class extends NativeObserver {
    constructor(callback) { super(callback); observers.push(this); }
  };
  const close = dom.window.close.bind(dom.window);
  dom.window.close = () => {
    for (const observer of observers) observer.disconnect();
    close();
  };
  const calls = [];
  w.__DSH_UI_SKIN_MANAGER__ = snapshot(1, 'red'); // stale initialization payload must never win
  w.__DSH_UI_SKIN_CSS__ = '#probe {color:green}';
  w.__DSH_WS_RPC__ = () => ({onNotify(){}, send(){}, call(method) {
    calls.push(method);
    if (method === 'win.skin-bootstrap') return fail ? Promise.reject(Error('offline')) : Promise.resolve(current);
    return Promise.resolve({});
  }});
  w.eval(bridge);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await new Promise(r => setTimeout(r, 30));
  return {dom, w, calls};
}
test(`[${artifact}] reload after Apply and Revert fetches current host generation, not frozen initialization`, async () => {
  for (const [generation, color, computed] of [[2,'blue','rgb(0, 0, 255)'], [3,'green','rgb(0, 128, 0)']]) {
    const {dom,w,calls} = await load(snapshot(generation,color));
    try {
      assert.ok(calls.includes('win.skin-bootstrap'));
      assert.equal(w.__DSH_UI_SKIN_MANAGER__.generation,generation);
      assert.equal(w.document.querySelectorAll('[data-skin-generation="1"]').length,0);
      assert.equal(w.document.querySelectorAll(`[data-skin-generation="${generation}"]`).length,6);
      assert.equal(w.getComputedStyle(w.document.getElementById('probe')).color,computed);
    } finally {dom.window.close();}
  }
});
test(`[${artifact}] transaction after refreshed bootstrap removes the previous generation`, async () => {
  const {dom,w} = await load(snapshot(2,'blue'));
  try {
    w.dispatchEvent(new w.CustomEvent('dsh-ui-skin-transaction', {detail:snapshot(3,'green')}));
    assert.equal(w.document.querySelectorAll('[data-skin-generation="2"]').length,0);
    assert.equal(w.document.querySelectorAll('[data-skin-generation="3"]').length,6);
  } finally {dom.window.close();}
});
test(`[${artifact}] unavailable host or rejected snapshot uses complete embedded fallback`, async () => {
  for (const fail of [false,true]) {
    const {dom,w} = await load({},fail);
    try {
      assert.equal(w.document.querySelectorAll('[data-skin-slot]').length,0);
      assert.equal(w.getComputedStyle(w.document.getElementById('probe')).color,'rgb(0, 128, 0)');
    } finally {dom.window.close();}
  }
});
}
