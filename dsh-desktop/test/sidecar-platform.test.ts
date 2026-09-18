import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface RpcResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

test('sidecar exposes platform identity and minimal mounted modules over shell.info', { timeout: 15000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-sidecar-platform-'));
  const child = spawn(process.execPath, ['../tauri-shell/sidecar/server.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      DSH_HOME: join(root, 'dsh-home'),
      HOME: join(root, 'home'),
      XDG_CONFIG_HOME: join(root, 'xdg'),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<number, (value: RpcResponse) => void>();
  lines.on('line', (line) => {
    const message = JSON.parse(line) as RpcResponse;
    if (typeof message.id === 'number') pending.get(message.id)?.(message);
  });
  let id = 0;
  const call = (method: string): Promise<RpcResponse> => new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: {} }) + '\n');
  });

  try {
    const info = (await call('shell.info')).result || {};
    assert.equal(info.platform, process.platform);
    assert.equal(info.sidecar, 'server.ts');
    assert.deepEqual(info.modules, [
      'proc',
      'platform',
      'runtime-paths',
      'profile',
      'runtime-patches',
      'boot-server',
    ]);
    for (const method of ['rc.action', 'rescue.state', 'guard.ensure']) {
      const response = await call(method);
      assert.equal(response.error?.code, -32601, `${method} must be absent, not stubbed`);
      assert.match(response.error?.message || '', new RegExp(`method not found: ${method.replace('.', '\\.')}`));
    }

    assert.deepEqual((await call('shutdown')).result, { bye: true });
    await new Promise<void>((resolve, reject) => {
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`sidecar exited ${String(code)}`)));
    });
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
    lines.close();
    rmSync(root, { recursive: true, force: true });
  }
});
