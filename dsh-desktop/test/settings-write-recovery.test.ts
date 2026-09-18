import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const {
  patchSettingsWriteFailureSource,
  patchSettingsWriteFailure,
} = require('../scripts/patch-deps.js') as {
  patchSettingsWriteFailureSource(source: string): string | undefined;
  patchSettingsWriteFailure(targetFile: string): boolean;
};

const oldMutate = [
  '\t\t\tmutate(ops, expectedRevision) {',
  '\t\t\t\tconst ownedOps = structuredClone(ops);',
  '\t\t\t\tconst generation = ++this.writeGeneration;',
  '\t\t\t\treturn this.enqueue(async () => {',
  '\t\t\t\t\tconst revision = expectedRevision ?? this.pendingRevision ?? this.getSnapshot().revision;',
  '\t\t\t\t\tlet response;',
  '\t\t\t\t\ttry {',
  '\t\t\t\t\t\tresponse = await this.api.settings.mutate(this.spec.namespace, ownedOps, revision);',
  '\t\t\t\t\t} catch (_settingsWriteFailure) {',
  '\t\t\t\t\t\tawait this.recover(generation);',
  '\t\t\t\t\t\treturn;',
  '\t\t\t\t\t}',
  '\t\t\t\t\tif (!response.ok) {',
  '\t\t\t\t\t\tawait this.recover(generation);',
  '\t\t\t\t\t\treturn;',
  '\t\t\t\t\t}',
  '\t\t\t\t\tif (this.disposed) return;',
  '\t\t\t\t\tif (generation === this.writeGeneration) {',
  '\t\t\t\t\t\tthis.pendingRevision = void 0;',
  '\t\t\t\t\t\tthis.mirror.acceptView(response.value);',
  '\t\t\t\t\t} else this.pendingRevision = response.value.revision;',
  '\t\t\t\t});',
  '\t\t\t}',
].join('\n');

function patchedController() {
  const method = patchSettingsWriteFailureSource(oldMutate);
  assert.ok(method);
  return new Function(`
    return class SettingsScopeControllerFixture {
      ${method}
      enqueue(operation) {
        return operation();
      }
      async recover(generation) {
        if (this.disposed || generation !== this.writeGeneration) return;
        this.pendingRevision = undefined;
        await this.mirror.load();
      }
      getSnapshot() {
        return this.snapshot;
      }
    };
  `)();
}

test('settings write patch retries only an implicit-revision conflict and exposes final failure', () => {
  const patched = patchSettingsWriteFailureSource(`before\n${oldMutate}\nafter`);
  assert.ok(patched);
  assert.match(patched, /dsh-desktop-settings-write-retry/);
  assert.match(patched, /response\.error\.code === "settings-conflict"/);
  assert.match(patched, /expectedRevision === void 0/);
  assert.match(patched, /await this\.mirror\.load\(\)/);
  assert.match(patched, /throw failure/);
  assert.doesNotMatch(patched, /catch \(_settingsWriteFailure\)[\s\S]*?return;/);
});

test('patched settings controller refreshes and retries one stale implicit revision', async () => {
  const Controller = patchedController();
  const revisions: number[] = [];
  const controller = new Controller();
  controller.writeGeneration = 0;
  controller.disposed = false;
  controller.pendingRevision = undefined;
  controller.snapshot = { revision: 1 };
  controller.spec = { namespace: 'computer-user' };
  controller.mirror = {
    async load() {
      controller.snapshot = { revision: 2 };
    },
    acceptView(value: { revision: number }) {
      controller.snapshot = value;
    },
  };
  controller.api = {
    settings: {
      async mutate(_ns: string, _ops: unknown[], revision: number) {
        revisions.push(revision);
        if (revisions.length === 1) {
          return {
            ok: false,
            error: {
              code: 'settings-conflict',
              message: 'stale revision',
              details: { expected: 1, actual: 2 },
            },
          };
        }
        return { ok: true, value: { revision: 3 } };
      },
    },
  };

  await controller.mutate([{ op: 'set', path: ['mode'], value: 'auto' }]);
  assert.deepEqual(revisions, [1, 2]);
  assert.equal(controller.snapshot.revision, 3);
});

test('patched settings controller rejects a final write failure with its remote code', async () => {
  const Controller = patchedController();
  const controller = new Controller();
  controller.writeGeneration = 0;
  controller.disposed = false;
  controller.pendingRevision = undefined;
  controller.snapshot = { revision: 4 };
  controller.spec = { namespace: 'computer-user' };
  controller.mirror = {
    async load() {},
    acceptView() {},
  };
  controller.api = {
    settings: {
      async mutate() {
        return {
          ok: false,
          error: {
            code: 'settings-rejected',
            message: 'disk is read-only',
            details: { ns: 'computer-user' },
          },
        };
      },
    },
  };

  await assert.rejects(
    () => controller.mutate([{ op: 'set', path: ['mode'], value: 'auto' }]),
    (error: Error & { code?: string }) =>
      error.message === 'disk is read-only' && error.code === 'settings-rejected',
  );
});

test('settings write patch preserves explicit revision fences', () => {
  const patched = patchSettingsWriteFailureSource(oldMutate);
  assert.ok(patched);
  assert.match(
    patched,
    /response\.error\.code === "settings-conflict" && expectedRevision === void 0/,
  );
});

test('settings write source transform is idempotent', () => {
  const once = patchSettingsWriteFailureSource(oldMutate);
  assert.ok(once);
  assert.equal(patchSettingsWriteFailureSource(once), once);
});

test('settings write patch refuses an unknown upstream shape', () => {
  assert.equal(
    patchSettingsWriteFailureSource('const upstreamChanged = true;'),
    undefined,
  );
});

test('settings write file patch applies atomically and stays stable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-settings-write-'));
  const file = join(dir, 'client.js');
  try {
    writeFileSync(file, oldMutate);
    assert.equal(patchSettingsWriteFailure(file), true);
    const once = readFileSync(file, 'utf8');
    assert.equal(patchSettingsWriteFailure(file), true);
    assert.equal(readFileSync(file, 'utf8'), once);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
