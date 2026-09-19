#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function requireMethodNotFound(method, response) {
  if (response?.error?.code !== -32601) {
    throw new Error(`${method} must return -32601, got ${JSON.stringify(response)}`);
  }
}

export async function followTokenRedirect(webUrl, request = fetch) {
  const first = await request(webUrl, { redirect: 'manual' });
  if (first.status !== 303) throw new Error(`token request must return 303, got ${first.status}`);
  const location = first.headers.get('location');
  const setCookie = first.headers.get('set-cookie');
  if (!location || !setCookie) throw new Error('token redirect is missing location or set-cookie');
  const cookie = setCookie.split(';', 1)[0];
  const target = new URL(location, webUrl);
  const second = await request(target, { redirect: 'manual', headers: { cookie } });
  if (second.status !== 200) throw new Error(`authenticated UI request must return 200, got ${second.status}`);
  await second.body?.cancel();
  return { redirectStatus: first.status, uiStatus: second.status };
}

class RpcClient {
  constructor(child) {
    this.child = child;
    this.nextId = 0;
    this.pending = new Map();
    this.lines = createInterface({ input: child.stdout });
    this.lines.on('line', (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (typeof message.id !== 'number') return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      pending.resolve(message);
    });
  }

  call(method, params = {}, timeoutMs = 300_000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  close() {
    this.lines.close();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('sidecar closed'));
    }
    this.pending.clear();
  }
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sidecar did not exit after shutdown')), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function expectWebStopped(webUrl) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(webUrl, { redirect: 'manual', signal: AbortSignal.timeout(1_000) });
      await response.body?.cancel();
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`web process still serves requests after shutdown: ${webUrl}`);
}

export async function runMinimalBootSmoke(stageRoot) {
  const root = path.resolve(stageRoot);
  const sidecar = path.join(root, 'sidecar', 'server.js');
  const desktop = path.join(root, 'dsh-desktop');
  if (!existsSync(sidecar) || !existsSync(path.join(desktop, 'package.json'))) {
    throw new Error(`staged runtime is incomplete: ${root}`);
  }

  const isolated = mkdtempSync(path.join(tmpdir(), 'dsh-v6-smoke-'));
  const dshHome = path.join(isolated, 'dsh-home');
  const home = path.join(isolated, 'home');
  const xdg = path.join(isolated, 'xdg');
  const appData = path.join(isolated, 'appdata');
  const child = spawn(process.execPath, [sidecar], {
    cwd: desktop,
    env: {
      ...process.env,
      DSH_HOME: dshHome,
      DSH_RESOURCE_ROOT: root,
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: xdg,
      XDG_CACHE_HOME: path.join(isolated, 'cache'),
      XDG_DATA_HOME: path.join(isolated, 'data'),
      APPDATA: appData,
      LOCALAPPDATA: path.join(isolated, 'localappdata'),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    process.stderr.write(chunk);
  });
  const rpc = new RpcClient(child);
  let webUrl = '';
  try {
    const info = await rpc.call('shell.info', {}, 15_000);
    if (info.result?.sidecar !== 'server.ts') throw new Error(`sidecar identity failed: ${JSON.stringify(info)}`);

    // v6 Task 3.3：guard.* 已随插件治理接回，不在退役清单内。
    // rc.* / rescue.* 仍属 Task 3.5 范围，必须保持 method-not-found。
    for (const method of ['rc.action', 'rescue.safe-mode']) {
      requireMethodNotFound(method, await rpc.call(method, {}, 15_000));
    }
    const guard = await rpc.call('guard.ensure', {}, 15_000);
    if (guard.error || guard.result?.ok !== true) {
      throw new Error(`guard.ensure must be served after Task 3.3: ${JSON.stringify(guard)}`);
    }

    const boot = await rpc.call('boot.start');
    if (boot.error || typeof boot.result?.webUrl !== 'string') {
      throw new Error(`boot.start failed: ${JSON.stringify(boot)}\n${stderr}`);
    }
    webUrl = boot.result.webUrl;
    const auth = await followTokenRedirect(webUrl);

    const stop = await rpc.call('boot.stop', {}, 30_000);
    if (stop.error || stop.result?.ok !== true) throw new Error(`boot.stop failed: ${JSON.stringify(stop)}`);
    const shutdown = await rpc.call('shutdown', {}, 30_000);
    if (shutdown.result?.bye !== true) throw new Error(`shutdown failed: ${JSON.stringify(shutdown)}`);
    const exitCode = await waitForExit(child, 15_000);
    if (exitCode !== 0) throw new Error(`sidecar exited with ${exitCode}`);
    await expectWebStopped(webUrl);

    return { auth, dshHome, exitCode, retiredRpc: 2, orphanWeb: false };
  } finally {
    if (child.exitCode === null) {
      try { await rpc.call('boot.stop', {}, 15_000); } catch { /* best-effort cleanup */ }
      try { await rpc.call('shutdown', {}, 5_000); } catch { /* best-effort cleanup */ }
      try { await waitForExit(child, 5_000); } catch { /* SIGKILL fallback below */ }
    }
    rpc.close();
    if (child.exitCode === null) child.kill('SIGKILL');
    if (webUrl) {
      try { await expectWebStopped(webUrl); } catch { /* preserve the primary smoke failure */ }
    }
    rmSync(isolated, { recursive: true, force: true });
  }
}

async function main() {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const stageRoot = process.argv[2] || path.join(repo, 'tauri-shell', 'staged-resources');
  const result = await runMinimalBootSmoke(stageRoot);
  console.log(`[boot-smoke] PASS 303=${result.auth.redirectStatus} ui=${result.auth.uiStatus} retired-rpc=${result.retiredRpc} orphan-web=${result.orphanWeb}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error('[boot-smoke] FAIL:', error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
