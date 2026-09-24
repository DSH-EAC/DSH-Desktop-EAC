import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const eac = (...parts: string[]): string => join(repoRoot, ...parts);
const read = (...parts: string[]): string => readFileSync(eac(...parts), 'utf8');
const json = <T>(...parts: string[]): T => JSON.parse(read(...parts)) as T;

const hostProfilePath = ['tauri-shell', 'host-profile.json'];
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
    'system.default',
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

test('offline staging consumes the locally supplied manager payload without a source lock', () => {
  const stage = read('tauri-shell', 'stage-resources.mjs');
  const main = read('tauri-shell', 'src', 'main.rs');
  const config = read('tauri-shell', 'tauri.conf.json');
  assert.equal(existsSync(eac(...defaultArtifact)), true);
  assert.equal(existsSync(eac(...managerArtifact)), true);
  assert.match(stage, /locally supplied UI skin manager payload staged/);
  assert.doesNotMatch(stage, /createHash|skin-manager-artifact\.lock|locked artifact digest mismatch/);
  assert.doesNotMatch(main, /SKIN_MANAGER_LOCK|locked_default_digest|snapshot\.package == "system\.default"/);
  assert.match(config, /staged-resources\/ui-skin-manager/);
  assert.doesNotMatch(stage, /github\.com|raw\x2f|origin\x2f/);
});

test('Rust test staging preserves the manager resource directory contract', () => {
  const workflow = read('.github', 'workflows', 'ci.yml');
  assert.match(workflow, /(?:staged-resources\/ui-skin-manager|staged\+'\/ui-skin-manager')/);
  assert.doesNotMatch(workflow, /skin-manager-artifact\.lock\.json/);
});

test('legacy shell-skin and AIO v1 are not restored', () => {
  const adr = read('docs', 'adr', '0010-canonical-default-skin-source.md');
  assert.match(adr, /shell-skin/);
  assert.match(adr, /AIO v1/);
  assert.match(adr, /must not be restored/i);
});
