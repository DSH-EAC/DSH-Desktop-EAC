import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRpmPackage } from '../scripts/audit-rpm-package.mjs';

const repositoryRoot = join(fileURLToPath(new URL('../..', import.meta.url)));
const linuxConfig = JSON.parse(
  readFileSync(join(repositoryRoot, 'tauri-shell', 'tauri.linux.conf.json'), 'utf8'),
) as { bundle?: { targets?: string[] } };
const installerWorkflow = readFileSync(
  join(repositoryRoot, '.github', 'workflows', 'staged-runtime-artifact.yml'),
  'utf8',
);
const rpmAudit = readFileSync(
  join(repositoryRoot, 'dsh-desktop', 'scripts', 'audit-rpm-package.mjs'),
  'utf8',
);

test('Linux Tauri bundle explicitly includes RPM alongside deb and AppImage', () => {
  assert.deepEqual(linuxConfig.bundle?.targets, ['deb', 'appimage', 'rpm']);
});

test('Linux installer workflow installs RPM tooling and uploads RPM artifacts', () => {
  const linuxDeps = installerWorkflow.match(
    /Install Linux Tauri dependencies[\s\S]*?run: ([^\n]+)/,
  )?.[1] || '';
  assert.match(linuxDeps, /\brpm\b/);
  assert.match(installerWorkflow, /rpm --version && rpmbuild --version/);
  const linuxUpload = installerWorkflow.match(
    /Upload Linux installer packages[\s\S]*?path:([\s\S]*?)if-no-files-found:/,
  )?.[1] || '';
  assert.match(linuxUpload, /bundle\/rpm\/\*\.rpm/);
});

test('RPM audit checks metadata, architecture, runtime closure, and forbidden payloads', () => {
  assert.match(rpmAudit, /'-qip'/);
  assert.match(rpmAudit, /\['-qlp'\]/);
  assert.match(rpmAudit, /aarch64/);
  assert.match(rpmAudit, /x86_64/);
  assert.match(rpmAudit, /sidecar\/server\.js/);
  assert.match(rpmAudit, /ui-skin-manager\/resolved\/system\.default\/snapshot\.json/);
  assert.match(rpmAudit, /musl/);
});

test('RPM audit validator accepts the staged runtime closure and rejects bad payloads', () => {
  const files = [
    '/usr/lib/deepseek-harness-eac/sidecar/server.js',
    '/usr/lib/deepseek-harness-eac/sidecar/bridge.js',
    '/usr/lib/deepseek-harness-eac/dsh-desktop/package.json',
    '/usr/lib/deepseek-harness-eac/dsh-desktop/vendor/node/node',
    '/usr/lib/deepseek-harness-eac/ui-skin-manager/resolved/system.default/snapshot.json',
  ];
  const info = { name: 'deepseek-harness-eac', version: '6.0.0', release: '1', arch: 'x86_64' };
  assert.deepEqual(validateRpmPackage(info, files, { arch: 'x64' }), {
    name: info.name, version: info.version, release: info.release, arch: info.arch, files: files.length,
  });
  assert.throws(() => validateRpmPackage(info, [...files, '/usr/lib/deepseek-harness-eac/dsh-desktop/node_modules/foo/bin/musl/system.node'], { arch: 'x64' }), /不可达平台载荷/);
  assert.throws(() => validateRpmPackage({ ...info, arch: 'aarch64' }, files, { arch: 'x64' }), /架构错误/);
});
