import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASE_ARTIFACTS, expandTemplate } from '../scripts/release-artifacts.mjs';
import { collectReleaseAssets, disambiguate } from '../scripts/collect-release-assets.mjs';
import { tagViolation } from '../scripts/resolve-release-source.mjs';
import { renderReleaseNotes } from '../scripts/write-release-notes.mjs';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const releaseWorkflow = readFileSync(join(repositoryRoot, '.github', 'workflows', 'release.yml'), 'utf8');
const packagingWorkflow = readFileSync(
  join(repositoryRoot, '.github', 'workflows', 'staged-runtime-artifact.yml'),
  'utf8',
);

test('发布工作流只能手动触发，且 tag/标题/pre-release 都由输入给出', () => {
  // 发布对外且不可逆：不接受 push/tag 自动触发，避免一次误推就把半套资产公开。
  assert.match(releaseWorkflow, /^on:\n  workflow_dispatch:\n/m);
  assert.doesNotMatch(releaseWorkflow, /^  (push|release|workflow_run):/m);
  for (const input of ['tag', 'title', 'prerelease']) {
    assert.match(releaseWorkflow, new RegExp(`^      ${input}:\\n`, 'm'), `缺少输入 ${input}`);
  }
  assert.match(releaseWorkflow, /^      tag:\n(?:.*\n)*?        required: true$/m, 'tag 必填');
  assert.match(releaseWorkflow, /^      prerelease:\n(?:.*\n)*?        type: boolean\n(?:.*\n)*?        default: true$/m,
    'pre-release 默认 true（对外发布默认保守）');
});

test('发布工作流的 GITHUB_TOKEN 权限最小：顶层只读，写权限只给发布 job', () => {
  const top = releaseWorkflow.match(/^permissions:\n((?:[ \t]+.*\n|\n)*)/m);
  assert.ok(top, '缺少顶层 permissions，CodeQL actions/missing-workflow-permissions 会告警');
  assert.match(top[1], /^ {2}contents: read$/m, '顶层必须至少含 contents: read');

  const resolveJob = releaseWorkflow.slice(
    releaseWorkflow.indexOf('  resolve:\n'),
    releaseWorkflow.indexOf('  publish:\n'),
  );
  assert.doesNotMatch(resolveJob, /contents: write/, '解析 job 不应有写权限');
  assert.match(resolveJob, /actions: read/, '解析 job 需要 actions: read 才能列举来源 run 的 artifact');

  const publishJob = releaseWorkflow.slice(releaseWorkflow.indexOf('  publish:\n'));
  assert.match(publishJob, /^      contents: write$/m, '发布 job 需要 contents: write');
  assert.match(publishJob, /needs: resolve/, '发布 job 必须依赖解析结果');
});

test('发布前先钉死来源：run 结论、提交一致性与 artifact 齐全都由解析步骤把关', () => {
  assert.match(releaseWorkflow, /resolve-release-source\.mjs/, '缺少来源解析步骤');
  assert.match(releaseWorkflow, /SOURCE_RUN_ID: \$\{\{ inputs\.source_run_id \}\}/, '来源 run id 未被传入解析');
  // 回读远端资产是「上传成功」与「远端确实有这套资产」之间的唯一证据。
  assert.match(releaseWorkflow, /collect-release-assets\.mjs --verify/, '缺少发布后回读核对');
  assert.match(releaseWorkflow, /gh release view "\$TAG"[\s\S]*?--json/, '回读必须走 gh release view');
});

test('输入只经 env 传递，绝不内联进 run 正文（防 shell 注入）', () => {
  const runBodies = releaseWorkflow.split(/^      - name: /m).slice(1);
  for (const body of runBodies) {
    const runPart = body.slice(body.indexOf('        run: '));
    assert.doesNotMatch(runPart, /\$\{\{/, `run 正文出现内联表达式：${body.split('\n')[0]}`);
  }
  for (const input of ['tag', 'title', 'prerelease', 'source_run_id']) {
    assert.match(releaseWorkflow, new RegExp(`\\$\\{\\{ inputs\\.${input} \\}\\}`), `输入 ${input} 没被使用`);
  }
  // 只用官方 action：本工作流持有 contents: write，第三方 action 会扩大供应链面。
  for (const use of releaseWorkflow.match(/uses: [^\s#]+/g) ?? []) {
    assert.match(use, /^uses: actions\//, `出现非官方 action：${use}`);
  }
});

test('tag 不存在时由 --target 建在来源提交上，绝不会落到默认分支', () => {
  assert.match(releaseWorkflow, /gh release create "\$TAG" "\$\{args\[@\]\}" --target "\$SOURCE_SHA"/,
    'gh release create 必须显式 --target 来源提交');
  assert.match(releaseWorkflow, /gh release edit "\$TAG"/, 'Release 已存在时走 edit 分支');
  assert.match(releaseWorkflow, /gh release upload "\$TAG" "\$\{files\[@\]\}" --clobber/,
    '重跑发布必须 --clobber，否则同名资产会失败');
  // mapfile 的进程替换会吞掉失败，空列表必须在 gh 之前就失败。
  assert.match(releaseWorkflow, /node dsh-desktop\/scripts\/collect-release-assets\.mjs --list > asset-list\.txt/,
    '资产列表要先落盘，失败才会让本步真实失败');
  assert.match(releaseWorkflow, /资产列表为空，拒绝上传空集合/);
});

test('发布物归属表与源工作流的 artifact 名字一致', () => {
  assert.equal(RELEASE_ARTIFACTS.length, 4, '四个平台各一个 artifact');
  for (const entry of RELEASE_ARTIFACTS) {
    assert.equal(expandTemplate(entry.template, entry.arch), entry.artifact,
      `${entry.template} + ${entry.arch} 应展开为 ${entry.artifact}`);
    assert.ok(packagingWorkflow.includes(entry.template),
      `源工作流已不再声明 artifact 模板 ${entry.template}`);
  }
  const platforms = RELEASE_ARTIFACTS.map((entry) => `${entry.os}/${entry.arch}`).sort();
  assert.deepEqual(platforms, ['linux/arm64', 'linux/x64', 'windows/arm64', 'windows/x64']);
});

test('tag 字面量按白名单校验，拒绝可注入形态（不做任何规范化）', () => {
  for (const tag of ['v6.0.0', 'v6.0.0-rc.1', 'release/6.0', '6.0.0+build.5']) {
    assert.equal(tagViolation(tag), null, `${tag} 应被接受`);
  }
  for (const tag of ['', '-leading', 'has space', 'v6..0', 'v6.0.0.lock', 'v6.0.0.', 'trailing/',
    'semi;colon', 'dollar$(x)', 'back\\slash', '`cmd`', 'a\nb']) {
    assert.notEqual(tagViolation(tag), null, `${JSON.stringify(tag)} 应被拒绝`);
  }
  assert.notEqual(tagViolation('x'.repeat(101)), null, '超长 tag 应被拒绝');
});

test('同名的便携包与校验和不互相覆盖：按平台后缀消歧', () => {
  assert.equal(disambiguate('Deepseek-Harness-EAC-6.0.0-portable.zip', 'windows', 'arm64'),
    'Deepseek-Harness-EAC-6.0.0-portable-windows-arm64.zip');
  assert.equal(disambiguate('SHA256SUMS.txt', 'windows', 'x64'), 'SHA256SUMS-windows-x64.txt');
});

test('归集四个平台的 artifact：资产齐全、重名消解、校验和可核对', () => {
  const work = mkdtempSync(join(tmpdir(), 'release-collect-'));
  try {
    const inDir = join(work, 'artifacts');
    const version = '6.0.0';
    const layout: Record<string, Record<string, string>> = {
      'dsh-eac-windows-x64-installers': {
        [`tauri-shell/target/release/bundle/nsis/Deepseek-Harness-EAC_${version}_x64-setup.exe`]: 'win-x64-nsis',
        [`tauri-shell/target/release/portable/Deepseek-Harness-EAC-${version}-portable.zip`]: 'win-x64-portable',
        'tauri-shell/target/release/portable/SHA256SUMS.txt': 'win-x64-sums',
      },
      'dsh-eac-windows-arm64-installers': {
        [`tauri-shell/target/release/bundle/nsis/Deepseek-Harness-EAC_${version}_arm64-setup.exe`]: 'win-arm64-nsis',
        [`tauri-shell/target/release/portable/Deepseek-Harness-EAC-${version}-portable.zip`]: 'win-arm64-portable',
        'tauri-shell/target/release/portable/SHA256SUMS.txt': 'win-arm64-sums',
      },
      'dsh-eac-linux-x64-installers': {
        [`tauri-shell/target/release/bundle/deb/deepseek-harness-eac_${version}_amd64.deb`]: 'linux-x64-deb',
        [`tauri-shell/target/release/bundle/appimage/Deepseek-Harness-EAC_${version}_amd64.AppImage`]: 'linux-x64-appimage',
      },
      'dsh-eac-linux-arm64-installers': {
        [`tauri-shell/target/release/bundle/deb/deepseek-harness-eac_${version}_arm64.deb`]: 'linux-arm64-deb',
        [`tauri-shell/target/release/bundle/appimage/Deepseek-Harness-EAC_${version}_aarch64.AppImage`]: 'linux-arm64-appimage',
      },
    };
    for (const [artifact, files] of Object.entries(layout)) {
      for (const [relative, body] of Object.entries(files)) {
        const dest = join(inDir, artifact, ...relative.split('/'));
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, body);
      }
    }

    const outDir = join(work, 'dist');
    const { assets } = collectReleaseAssets({ inDir, outDir });
    const targets = assets.map((asset) => asset.target);
    assert.equal(new Set(targets).size, targets.length, '归集后不得出现重名');
    assert.equal(targets.length, 11, '10 个安装包 + 1 个聚合校验和');
    assert.ok(targets.includes('Deepseek-Harness-EAC-6.0.0-portable-windows-x64.zip'));
    assert.ok(targets.includes('Deepseek-Harness-EAC-6.0.0-portable-windows-arm64.zip'));
    assert.ok(targets.includes('Deepseek-Harness-EAC_6.0.0_x64-setup.exe'), '基名唯一者保持原名');

    // 消歧的关键证据：两个同名便携包的内容都还在，没有被后者覆盖。
    assert.equal(
      readFileSync(join(outDir, 'Deepseek-Harness-EAC-6.0.0-portable-windows-x64.zip'), 'utf8'),
      'win-x64-portable',
    );
    assert.equal(
      readFileSync(join(outDir, 'Deepseek-Harness-EAC-6.0.0-portable-windows-arm64.zip'), 'utf8'),
      'win-arm64-portable',
    );

    const sums = readFileSync(join(outDir, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
    assert.equal(sums.length, 10, '聚合校验和覆盖 10 个安装包');
    for (const line of sums) {
      assert.match(line, /^[0-9a-f]{64} {2}\S+$/, `校验和行格式异常：${line}`);
    }
    for (const asset of assets) {
      assert.match(asset.sha256, /^[0-9a-f]{64}$/, `${asset.target} 的 sha256 形态异常`);
      assert.ok(asset.origin.length > 0, `${asset.target} 缺少来源 artifact`);
    }

    // 缺件必须硬失败，绝不发布半套资产。
    rmSync(join(inDir, 'dsh-eac-linux-arm64-installers'), { recursive: true, force: true });
    assert.throws(() => collectReleaseAssets({ inDir, outDir }),
      /dsh-eac-linux-arm64-installers/, '缺少某个平台的 artifact 时必须失败');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('release notes 只写有据可依的事实', () => {
  const notes = renderReleaseNotes(
    {
      assets: [
        { target: 'a.exe', origin: 'x', os: 'windows', arch: 'x64', sourcePath: 'p/a.exe', bytes: 2 * 1024 * 1024, sha256: 'f'.repeat(64) },
      ],
    },
    {
      SOURCE_RUN_URL: 'https://github.com/o/r/actions/runs/1',
      SOURCE_SHA: 'a'.repeat(40),
      SOURCE_BRANCH: 'dev',
      PRERELEASE: 'true',
      GITHUB_REPOSITORY: 'o/r',
    },
  );
  assert.match(notes, /https:\/\/github\.com\/o\/r\/actions\/runs\/1/, '写出来源 run');
  assert.match(notes, new RegExp('a'.repeat(40)), '写出来源提交');
  assert.match(notes, /pre-release \| 是/);
  assert.match(notes, /2\.0 MiB/, '资产大小可读');
  assert.match(notes, /不在发布链路上执行安装/, '如实声明未做安装验证');
});
