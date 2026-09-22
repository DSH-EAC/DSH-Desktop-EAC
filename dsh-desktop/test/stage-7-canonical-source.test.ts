import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const eac = (...parts: string[]): string => join(repoRoot, ...parts);
const read = (...parts: string[]): string => readFileSync(eac(...parts), 'utf8');
const json = <T>(...parts: string[]): T => JSON.parse(read(...parts)) as T;

const lockPath = ['tauri-shell', 'skin-manager-artifact.lock.json'];
const hostProfilePath = ['tauri-shell', 'host-profile.json'];
const resolvedRootPath = ['tauri-shell', 'artifacts', 'resolved'];
const snapshotPath = ['tauri-shell', 'artifacts', 'resolved', 'snapshot.json'];
const defaultArtifact = ['tauri-shell', 'artifacts', 'system.default-2.0.0.dshpack.tar'];
const managerArtifact = ['tauri-shell', 'artifacts', 'dsh-eac-ui-skin-manager-0.1.0-preview.1.tgz'];
const removedSource = [
  ['dsh-desktop', 'assets', 'ui-skin', 'registry.json'],
  ['dsh-desktop', 'assets', 'ui-skin', 'system-default'],
];

test('EAC no longer carries an editable default skin source or active registry', () => {
  for (const path of removedSource) {
    assert.equal(existsSync(eac(...path)), false, `${path.join('/')} must be removed`);
  }
  const tracked = read('tauri-shell', 'src', 'main.rs');
  const staging = read('tauri-shell', 'stage-resources.mjs');
  assert.doesNotMatch(tracked, /ui_skin_registry|registry/);
  assert.doesNotMatch(staging, /assets.*ui-skin/);
  assert.doesNotMatch(staging, /shell-skin|aio-v1/);
});

test('host profile owns topology while the default artifact owns contributions', () => {
  const profile = json<{
    id: string;
    version: string;
    regions: string[];
    slots: { id: string; region: string; kind: string; scope: string }[];
    instanceKinds: string[];
    fallbackSkin: { id: string; version: string; digest: string };
  }>(...hostProfilePath);
  assert.equal(profile.id, 'dsh-desktop-eac-ui-skin-profile');
  assert.equal(profile.version, '0.3.0');
  assert.deepEqual(profile.regions, [
    'top-sidebar',
    'bottom-sidebar',
    'left-sidebar',
    'right-sidebar',
    'session',
    'overlay',
  ]);
  assert.deepEqual(profile.instanceKinds, ['popup', 'dialog', 'floating-window']);
  assert.deepEqual(profile.slots.map(({ region }) => region), profile.regions);
  assert.equal(profile.fallbackSkin.id, 'system.default');
  assert.match(profile.fallbackSkin.digest, /^sha256:[a-f0-9]{64}$/);

  const artifactManifest = json<{ contributions: unknown[]; metadata: { id: string } }>(
    'tauri-shell',
    'artifacts',
    'resolved',
    'skin.json',
  );
  assert.equal(artifactManifest.metadata.id, 'system.default');
  assert.equal(artifactManifest.contributions.length, 6);
  assert.doesNotMatch(JSON.stringify(artifactManifest), /registry\.json|slot\/slot\.json|main\.rs|bridge\.ts/);
});

test('manager is the default path with a one-release emergency rollback switch', () => {
  const main = read('tauri-shell', 'src', 'main.rs');
  assert.match(main, /DSH_UI_SKIN_MANAGER_ROLLBACK/);
  assert.match(main, /manager_enabled/);
  assert.match(main, /system\.default/);
  assert.match(main, /embedded fallback/i);
  assert.doesNotMatch(main, /manager_flag_is_disabled_by_default/);
});

test('offline staging consumes only pinned manager and default artifacts', () => {
  const stage = read('tauri-shell', 'stage-resources.mjs');
  const config = read('tauri-shell', 'tauri.conf.json');
  const lock = json<{ manager: { artifact: string; sha256: string }; default: { artifact: string; sha256: string } }>(...lockPath);
  const snapshot = json<{
    schema: string;
    bindings: { slot: string; package: { id: string; version: string; digest: string } }[];
  }>(...snapshotPath);
  assert.equal(existsSync(eac(...defaultArtifact)), true);
  assert.equal(existsSync(eac(...managerArtifact)), true);
  assert.equal(lock.default.artifact, 'system.default-2.0.0.dshpack.tar');
  assert.equal(lock.manager.artifact, 'dsh-eac-ui-skin-manager-0.1.0-preview.1.tgz');
  assert.match(lock.default.sha256, /^[a-f0-9]{64}$/);
  assert.match(lock.manager.sha256, /^[a-f0-9]{64}$/);
  // 6.2.3：快照是逐槽绑定，默认制品身份只能从 bindings 里逐条核对。
  assert.equal(snapshot.schema, 'dsh-eac-active-binding-snapshot@1');
  const defaultBindings = snapshot.bindings.filter(({ package: pkg }) => pkg.id === lock.default.package);
  assert.ok(defaultBindings.length > 0, '默认制品必须至少在一个 slot 上生效');
  for (const binding of defaultBindings) {
    assert.equal(binding.package.version, lock.default.version);
    assert.equal(binding.package.digest, `sha256:${lock.default.sha256}`);
  }
  assert.match(stage, /createHash/);
  assert.match(stage, /lock\.manager\.artifact/);
  assert.match(stage, /lock\.default\.artifact/);
  assert.match(stage, /locked artifact digest mismatch/);
  assert.match(config, /staged-resources\/ui-skin-manager/);
  assert.doesNotMatch(stage, /github\.com|raw\x2f|origin\x2f/);
  // 消费根是快照根：装配拷贝的是 `artifacts/`（内含 resolved/snapshot.json），
  // 而不是某个包目录。
  assert.equal(existsSync(eac(...resolvedRootPath, 'snapshot.json')), true);
  assert.equal(existsSync(eac(...resolvedRootPath, 'manifest.json')), true);
});

test('Rust test staging preserves the manager resource directory contract', () => {
  const workflow = read('.github', 'workflows', 'ci.yml');
  assert.match(workflow, /(?:staged-resources\/ui-skin-manager|staged\+'\/ui-skin-manager')/);
  assert.match(workflow, /skin-manager-artifact\.lock\.json/);
});

test('legacy shell-skin and AIO v1 are not restored', () => {
  const adr = read('docs', 'adr', '0010-canonical-default-skin-source.md');
  assert.match(adr, /shell-skin/);
  assert.match(adr, /AIO v1/);
  assert.match(adr, /must not be restored/i);
});
