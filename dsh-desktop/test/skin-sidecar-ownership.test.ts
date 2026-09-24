import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import readline from 'node:readline';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function sidecar(dir: string, script = path.join(root, 'tauri-shell/sidecar/server.js'), rpcTimeout = 15000) {
  const child = spawn(process.execPath, [script], {
    env: {...process.env, APPDATA: dir, XDG_CONFIG_HOME: dir, DSH_HOME: path.join(dir, 'home'),
      DSH_UI_SKIN_MANAGER_STATE: path.join(dir, 'state'), DSH_UI_SKIN_MANAGER_RESOLVED: path.join(dir, 'resolved')},
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let id = 0;
  let ended = false;
  let failure: Error | undefined;
  let stderr = '';
  const pending = new Map<number, {resolve(value: any): void; reject(error: Error): void}>();
  const fail = (error: Error) => {
    failure = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  child.stderr.on('data', chunk => {
    stderr = (stderr + String(chunk)).slice(-16000);
    process.stderr.write(`[sidecar ${child.pid}] ${chunk}`);
  });
  const lines = readline.createInterface({input: child.stdout});
  lines.on('line', line => {
    try {
      const value = JSON.parse(line);
      const request = pending.get(value.id);
      if (!request) return;
      if (value.error) request.reject(new Error(`RPC error: ${JSON.stringify(value.error)}`));
      else request.resolve(value.result);
    } catch (error) { fail(new Error(`Invalid sidecar response: ${String(error)}`)); }
  });
  // Register before any request/kill; signal exits have exitCode === null.
  const closed = new Promise<void>(resolve => child.once('close', () => {
    ended = true;
    lines.close();
    resolve();
  }));
  child.once('exit', (code, signal) => {
    ended = true;
    fail(new Error(`Sidecar exited: code=${code} signal=${signal}\n${stderr}`));
  });
  child.once('error', error => { ended = true; fail(error); });
  child.stdin.on('error', fail);
  const waitClosed = async (ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([closed, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Sidecar ${child.pid} cleanup timed out\n${stderr}`)), ms);
      })]);
    } finally { clearTimeout(timer); }
  };
  let stopping: Promise<void> | undefined;
  return {
    child,
    call(method: string) {
      if (ended || failure) return Promise.reject(failure ?? new Error('Sidecar already exited'));
      return new Promise<any>((resolve, reject) => {
        const n = ++id;
        const finish = (error?: Error, value?: any) => {
          clearTimeout(timer);
          pending.delete(n);
          if (error) reject(error); else resolve(value);
        };
        const timer = setTimeout(() => finish(new Error(`RPC timeout ${method}\n${stderr}`)), rpcTimeout);
        pending.set(n, {resolve: value => finish(undefined, value), reject: error => finish(error)});
        child.stdin.write(JSON.stringify({id: n, method, params: {}}) + '\n', error => {
          if (error) finish(error);
        });
      });
    },
    stop() {
      return stopping ??= (async () => {
        if (!ended && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        try { await waitClosed(2000); }
        catch (error) {
          // Escalate only to reclaim our child; cleanup timeout still fails the test.
          child.kill('SIGKILL');
          try { await waitClosed(2000); }
          finally {
            child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); lines.close();
          }
          throw error;
        }
      })();
    },
  };
}

async function cleanup(dir: string, children: ReturnType<typeof sidecar>[]) {
  const results = await Promise.allSettled(children.map(child => child.stop()));
  fs.rmSync(dir, {recursive: true, force: true});
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, 'Sidecar cleanup failed');
}

test('real sidecars exclude same-root owner and recover after process death', {timeout: 45000}, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-owner-'));
  const children: ReturnType<typeof sidecar>[] = [];
  const start = () => { const child = sidecar(dir); children.push(child); return child; };
  try {
    const a = start();
    const initial = await a.call('skin.startup');
    assert.equal(initial.ok, true);
    assert.equal(initial.ready, true);
    const b = start();
    for (const method of ['skin.startup', 'skin.status', 'skin.apply', 'skin.force-enable']) {
      const denied = await b.call(method);
      assert.equal(denied.ok, false);
      assert.equal(denied.fault?.code, 'SKIN_OWNER_UNAVAILABLE');
    }
    await a.stop();
    assert.ok(a.child.exitCode !== null || a.child.signalCode !== null);
    await a.stop(); // Regression: repeated stop after signal death must settle.
    await b.stop();
    const c = start();
    const recovered = await c.call('skin.startup');
    assert.equal(recovered.ok, true);
    assert.equal(recovered.ready, true);
  } finally { await cleanup(dir, children); }
});

test('sidecar RPC rejects protocol errors and requests after child exit', {timeout: 10000}, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-rpc-'));
  const child = sidecar(dir);
  try {
    await assert.rejects(child.call('not-a-method'), /RPC error/);
    assert.equal((await child.call('ping')).pong, true);
    await child.stop();
    await assert.rejects(child.call('ping'), /exited/);
    await child.stop();
  } finally { await cleanup(dir, [child]); }
});

test('pending RPC settles on process death and RPC timeout clears its request', {timeout: 10000}, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-pending-'));
  const script = path.join(dir, 'silent.cjs');
  fs.writeFileSync(script, 'process.stdin.resume();');
  const child = sidecar(dir, script, 300);
  try {
    await assert.rejects(child.call('timeout'), /RPC timeout/);
    const rejected = assert.rejects(child.call('pending'), /Sidecar exited/);
    await child.stop();
    await rejected;
  } finally { await cleanup(dir, [child]); }
});
