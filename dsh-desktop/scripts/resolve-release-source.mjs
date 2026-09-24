#!/usr/bin/env node
// Release 来源解析（`.github/workflows/release.yml` 的第一段，只读）。
//
// Why 需要它：发布是不可逆的对外动作，触发前必须把三件事钉死，任何一条不满足
// 都要在「创建 Release 之前」失败，而不是让 gh 事后报错：
//   1) 来源 run 确实是本仓库的生产工作流（ci.yml —— 安装包 job 由它调用
//      staged-runtime-artifact.yml）且 conclusion=success —— 不拿失败的 run 去发布；
//   2) tag 指向的提交与来源 run 的 head_sha **完全一致** —— 否则发布物与被验证
//      的代码不是同一份（这是发布链路里最容易被忽视、后果最严重的一类错误）；
//   3) 四个安装包 artifact 都还在（retention-days: 7，过期或某平台构建失败都会
//      缺件）—— 缺件时给出缺了哪一个，而不是发布半套资产。
//
// 本脚本只发 GET，不写任何远端状态；结果通过 GITHUB_OUTPUT 传给发布 job。
//
// 用法（由 workflow 调用，也可本地指向一个 stub 服务调试）：
//   TAG=v6.0.0 SOURCE_RUN_ID=123 GITHUB_REPOSITORY=o/r GITHUB_TOKEN=... \
//     node dsh-desktop/scripts/resolve-release-source.mjs
//
// 环境变量：
//   TAG                 必填，目标 tag（原样使用，不做任何规范化）
//   SOURCE_RUN_ID       选填，来源 CI run id；留空则按 tag 的提交反查最近一次成功 run
//   GITHUB_REPOSITORY   必填，owner/repo（Actions 内置）
//   GITHUB_TOKEN        必填，读权限即可（Actions 内置 secrets.GITHUB_TOKEN）
//   GITHUB_API_URL      选填，API 基址（Actions 内置；GHES 亦由此覆盖）
//   GITHUB_OUTPUT       选填，输出文件（Actions 内置）
//   PRERELEASE / TITLE  选填，原样回传，供发布 job 使用

import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PACKAGING_WORKFLOW_PATH,
  RELEASE_ARTIFACTS,
  SOURCE_WORKFLOW_PATH,
  artifactNameViolations,
} from './release-artifacts.mjs';

const API_BASE = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');

/**
 * 校验 tag 字面量。
 * 刻意不做规范化：tag 是要写进远端引用的标识，任何「修复」都会让发布的引用
 * 与操作者输入的名字不一致。不合规就拒绝，由人来改。
 * @returns {string|null} 违规原因，null 表示通过。
 */
export function tagViolation(tag) {
  if (!tag) return 'tag 为空';
  if (tag.length > 100) return `tag 过长（${tag.length} > 100）`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._+/-]*$/.test(tag)) {
    return 'tag 只允许 [A-Za-z0-9._+/-] 且不能以 - 或 . 开头';
  }
  if (tag.includes('..')) return 'tag 不能包含 ".."';
  if (tag.endsWith('.lock')) return 'tag 不能以 ".lock" 结尾';
  if (tag.endsWith('.') || tag.endsWith('/')) return 'tag 不能以 "." 或 "/" 结尾';
  return null;
}

function apiHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'dsh-eac-release-resolver',
  };
}

/** 单次 GET，返回 {status, body}；404 不抛（调用方要区分「不存在」与「出错」）。 */
export async function get(token, url) {
  const response = await fetch(url, { headers: apiHeaders(token) });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text.slice(0, 500) };
    }
  }
  return { status: response.status, body };
}

class ResolveError extends Error {}

function fail(message) {
  throw new ResolveError(message);
}

/** 把 tag 引用解析为提交 SHA（兼容附注 tag 需要再解一层）。 */
async function resolveTagSha(token, repo, tag) {
  const ref = await get(token, `${API_BASE}/repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`);
  if (ref.status === 404) return null;
  if (ref.status !== 200) fail(`读取 tag 引用失败（HTTP ${ref.status}）：${ref.body?.message ?? ''}`);
  const object = ref.body?.object;
  if (!object?.sha) fail(`tag ${tag} 的引用响应缺少 object.sha`);
  if (object.type === 'tag') {
    const annotated = await get(token, `${API_BASE}/repos/${repo}/git/tags/${object.sha}`);
    if (annotated.status !== 200) fail(`解析附注 tag 失败（HTTP ${annotated.status}）`);
    return annotated.body?.object?.sha ?? null;
  }
  return object.sha;
}

async function fetchRun(token, repo, runId) {
  const { status, body } = await get(token, `${API_BASE}/repos/${repo}/actions/runs/${runId}`);
  if (status === 404) fail(`找不到 run ${runId}（是否属于本仓库？）`);
  if (status !== 200) fail(`读取 run ${runId} 失败（HTTP ${status}）：${body?.message ?? ''}`);
  return body;
}

/** 在给定提交上找最近一次成功的源工作流 run。 */
async function findLatestSuccessfulRun(token, repo, headSha) {
  const url = `${API_BASE}/repos/${repo}/actions/runs?head_sha=${headSha}&status=success&per_page=50`;
  const { status, body } = await get(token, url);
  if (status !== 200) fail(`按提交查询 run 失败（HTTP ${status}）：${body?.message ?? ''}`);
  const runs = (body?.workflow_runs ?? []).filter((run) => run.path === SOURCE_WORKFLOW_PATH);
  if (runs.length === 0) {
    return null;
  }
  runs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return runs[0];
}

async function listArtifacts(token, repo, runId) {
  const { status, body } = await get(
    token,
    `${API_BASE}/repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`,
  );
  if (status !== 200) fail(`列举 run ${runId} 的 artifact 失败（HTTP ${status}）：${body?.message ?? ''}`);
  return body?.artifacts ?? [];
}

async function fetchRelease(token, repo, tag) {
  const { status, body } = await get(token, `${API_BASE}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  if (status === 404) return null;
  if (status !== 200) fail(`查询 Release 失败（HTTP ${status}）：${body?.message ?? ''}`);
  return body;
}

/**
 * 主流程。返回解析结果（同时由 main 写入 GITHUB_OUTPUT）。
 * @param {Record<string, string|undefined>} env
 */
export async function resolveReleaseSource(env) {
  const tag = (env.TAG ?? '').trim();
  const repo = (env.GITHUB_REPOSITORY ?? '').trim();
  const token = env.GITHUB_TOKEN || env.GH_TOKEN || '';
  const sourceRunId = (env.SOURCE_RUN_ID ?? '').trim();

  const violation = tagViolation(tag);
  if (violation) fail(`tag 不合法：${violation}`);
  if (!/^[^/]+\/[^/]+$/.test(repo)) fail(`GITHUB_REPOSITORY 非法：${repo || '(空)'}`);
  if (!token) fail('缺少 GITHUB_TOKEN');

  const repoRoot = env.REPO_ROOT || process.cwd();
  const packagingWorkflow = path.join(repoRoot, PACKAGING_WORKFLOW_PATH);
  const nameViolations = artifactNameViolations(readFileSync(packagingWorkflow, 'utf8'));
  if (nameViolations.length > 0) {
    fail(`发布物归属表与实际工作流不一致：\n  - ${nameViolations.join('\n  - ')}`);
  }

  const tagSha = await resolveTagSha(token, repo, tag);

  let run;
  if (sourceRunId) {
    run = await fetchRun(token, repo, sourceRunId);
    if (run.status !== 'completed' || run.conclusion !== 'success') {
      fail(`来源 run ${sourceRunId} 不是成功状态：status=${run.status} conclusion=${run.conclusion}`);
    }
    if (run.path !== SOURCE_WORKFLOW_PATH) {
      fail(`来源 run ${sourceRunId} 来自 ${run.path}，不是 ${SOURCE_WORKFLOW_PATH}`);
    }
  } else {
    if (!tagSha) {
      fail(
        `tag ${tag} 不存在，且未提供 SOURCE_RUN_ID。\n` +
          '  说明：tag 尚不存在时无法反查提交，请显式提供来源 CI run id；\n' +
          '  Release 会把 tag 建在该 run 的提交上（不会落到默认分支）。',
      );
    }
    run = await findLatestSuccessfulRun(token, repo, tagSha);
    if (!run) fail(`提交 ${tagSha} 上没有 ${SOURCE_WORKFLOW_PATH} 的成功 run`);
  }

  if (tagSha && tagSha !== run.head_sha) {
    fail(
      `tag ${tag} 指向 ${tagSha}，而来源 run ${run.id} 构建的是 ${run.head_sha}；两者必须一致。\n` +
        '  说明：发布物必须与被验证的代码是同一次提交，否则 Release 资产与 tag 对不上。\n' +
        '  处理：改用该提交上的 run id；或把 tag 重新指向已验证的提交。',
    );
  }

  const artifacts = await listArtifacts(token, repo, run.id);
  const byName = new Map(artifacts.map((item) => [item.name, item]));
  const missing = [];
  const expired = [];
  for (const { artifact } of RELEASE_ARTIFACTS) {
    const found = byName.get(artifact);
    if (!found) missing.push(artifact);
    else if (found.expired) expired.push(artifact);
  }
  if (missing.length > 0) {
    fail(
      `来源 run ${run.id} 缺少安装包 artifact：\n  - ${missing.join('\n  - ')}\n` +
        '  说明：某平台构建失败或被 retention-days 清理（默认 7 天）都会如此；\n' +
        '  请先让 CI 四平台全绿，并尽快发布。',
    );
  }
  if (expired.length > 0) {
    fail(`来源 run ${run.id} 的 artifact 已过期：\n  - ${expired.join('\n  - ')}`);
  }

  const release = await fetchRelease(token, repo, tag);

  return {
    source_run_id: String(run.id),
    source_run_url: run.html_url,
    source_sha: run.head_sha,
    source_branch: run.head_branch ?? '',
    source_run_created_at: run.created_at ?? '',
    tag,
    tag_exists: tagSha ? 'true' : 'false',
    release_exists: release ? 'true' : 'false',
    release_url: release?.html_url ?? '',
    title: (env.TITLE ?? '').trim() || tag,
    prerelease: (env.PRERELEASE ?? 'true').trim(),
  };
}

function writeOutputs(result) {
  const lines = Object.entries(result).map(([key, value]) => `${key}=${value}`).join('\n');
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`);
  }
  console.log('resolve-release-source: 解析结果');
  for (const [key, value] of Object.entries(result)) console.log(`  ${key} = ${value}`);
}

const isEntryPoint = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  try {
    writeOutputs(await resolveReleaseSource(process.env));
  } catch (error) {
    console.error('resolve-release-source:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
