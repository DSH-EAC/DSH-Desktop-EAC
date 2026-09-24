// 发布物归属表（`.github/workflows/release.yml` 与脚本共用的唯一真相）。
//
// Why 单独一个模块：artifact 名字由 `.github/workflows/staged-runtime-artifact.yml`
// 的 matrix 决定，发布工作流必须逐个点名下载它们。名字散落在多处时，改名的人
// 只会改 CI、不会想起发布链路，最后表现为「发布时某个平台静默缺件」。
//
// 因此这里集中定义两份事实并做自检：
//   - `artifact`：下载与归集用的具体名字（matrix.arch 展开后）；
//   - `template`：源工作流里那一行 `name:` 的字面量（含 `${{ matrix.arch }}`）；
// `assertArtifactTableConsistent()` 校验两者能互相推出，
// `artifactNameViolations()` 再校验源工作流文本里确实还有这几行。

/** 与 staged-runtime-artifact.yml 的 upload-artifact `name:` 完全一致。 */
export const RELEASE_ARTIFACTS = [
  {
    artifact: 'dsh-eac-windows-x64-installers',
    template: 'dsh-eac-windows-${{ matrix.arch }}-installers',
    os: 'windows',
    arch: 'x64',
  },
  {
    artifact: 'dsh-eac-windows-arm64-installers',
    template: 'dsh-eac-windows-${{ matrix.arch }}-installers',
    os: 'windows',
    arch: 'arm64',
  },
  {
    artifact: 'dsh-eac-linux-x64-installers',
    template: 'dsh-eac-linux-${{ matrix.arch }}-installers',
    os: 'linux',
    arch: 'x64',
  },
  {
    artifact: 'dsh-eac-linux-arm64-installers',
    template: 'dsh-eac-linux-${{ matrix.arch }}-installers',
    os: 'linux',
    arch: 'arm64',
  },
];

/** 生产安装包的上游工作流（发布只认这一个来源）。 */
export const SOURCE_WORKFLOW_PATH = '.github/workflows/ci.yml';

/** 安装包 job 实际由这个可复用工作流定义（发布前一致性检查的对象）。 */
export const PACKAGING_WORKFLOW_PATH = '.github/workflows/staged-runtime-artifact.yml';

const ARCH_TOKEN = '${{ matrix.arch }}';

/** 用 arch 展开模板得到具体 artifact 名。 */
export function expandTemplate(template, arch) {
  return template.split(ARCH_TOKEN).join(arch);
}

/**
 * 表内自检：artifact 名必须能由 template 展开得到，且四平台组合齐全。
 * @returns {string[]} 违规描述；空数组表示通过。
 */
export function assertArtifactTableConsistent(artifacts = RELEASE_ARTIFACTS) {
  const violations = [];
  const seen = new Set();
  for (const entry of artifacts) {
    const expanded = expandTemplate(entry.template, entry.arch);
    if (expanded !== entry.artifact) {
      violations.push(`模板与名字不自洽：${entry.template} + ${entry.arch} => ${expanded} ≠ ${entry.artifact}`);
    }
    const key = `${entry.os}/${entry.arch}`;
    if (seen.has(key)) violations.push(`平台重复：${key}`);
    seen.add(key);
  }
  for (const expected of ['windows/x64', 'windows/arm64', 'linux/x64', 'linux/arm64']) {
    if (!seen.has(expected)) violations.push(`缺少平台：${expected}`);
  }
  return violations;
}

/**
 * 检查源工作流文本是否仍声明了这四个 artifact 的 `name:` 行。
 * 只做字面包含判定：模板里带 `${{ matrix.arch }}`，所以必须比对模板而非展开值。
 * @param {string} workflowText
 * @returns {string[]} 违规描述；空数组表示通过。
 */
export function artifactNameViolations(workflowText, artifacts = RELEASE_ARTIFACTS) {
  const violations = assertArtifactTableConsistent(artifacts);
  for (const template of new Set(artifacts.map((entry) => entry.template))) {
    if (!workflowText.includes(template)) {
      violations.push(`源工作流 ${PACKAGING_WORKFLOW_PATH} 中已找不到 artifact 模板：${template}`);
    }
  }
  return violations;
}
