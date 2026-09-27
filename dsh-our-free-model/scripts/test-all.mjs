/**
 * Run every offline suite in one command.
 *
 *     node scripts/test-all.mjs [--only <name>]
 *
 * These are the checks that need no network and spend no free-lane quota: each
 * one mounts the real module against a local stand-in. The live end-to-end run
 * against the gateway is separate and costs minutes and quota, so it stays a
 * deliberate act: `node scripts/host-selftest.mjs`.
 *
 * The manifest check is in here because shipping a manifest that disagrees with
 * the files it describes breaks the in-app upgrade for every user at once
 * (issue #1), and nothing else fails when that happens.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = fileURLToPath(new URL('.', import.meta.url))
const only = process.argv.indexOf('--only') === -1 ? null : process.argv[process.argv.indexOf('--only') + 1]

const suites = [
  ['manifest', 'build-manifest.mjs', ['--check']],
  ['release', 'release-e2e.mjs', []],
  ['client-lint', 'client-lint.mjs', []],
  ['trust', 'trust-test.mjs', []],
  ['sanitize', 'sanitize-test.mjs', []],
  ['feed', 'feed-test.mjs', []],
  ['updater', 'updater-test.mjs', []],
  ['effort', 'effort-test.mjs', []],
  ['sniff', 'sniff-test.mjs', []],
  ['truncation', 'truncation-test.mjs', []],
  ['retry-safety', 'retry-safety-test.mjs', []],
  ['speed-stat', 'speed-stat-test.mjs', []],
  ['picker', 'picker-test.mjs', []],
  ['tui', 'tui-test.mjs', []],
  ['catalog', 'catalog-test.mjs', []],
  ['offline', 'offline-test.mjs', []],
].filter(([name]) => only === null || name.startsWith(only))

if (only !== null && suites.length === 0) {
  console.error(`--only "${only}" selected no suite`)
  process.exit(1)
}

/**
 * A suite that hangs is a suite that reports nothing.
 *
 * One of these bound a fixed port, lost the race to a suite running beside it, and
 * then sat in a `fetch` whose socket nobody answered — three minutes of the
 * runner's own ceiling, after which it printed six `ok` lines as the "failure
 * detail" because a hung process emits no `FAIL` to grep. The deadline is well
 * above the slowest suite, and the reason is printed rather than inferred.
 */
const SUITE_TIMEOUT_MS = 60_000

const results = []
for (const [name, script, args] of suites) {
  const started = Date.now()
  const run = spawnSync(process.execPath, [path.join(scriptsDir, script), ...args], { encoding: 'utf8', timeout: SUITE_TIMEOUT_MS })
  const elapsed = Date.now() - started
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trimEnd().split('\n')
  const hung = run.error !== undefined || run.signal !== null
  const ok = !hung && run.status === 0
  results.push({ name, ok, ms: elapsed, output })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(14)} ${String(elapsed).padStart(5)} ms`)
  if (!ok) {
    if (hung) console.log(`       ${run.error?.code === 'ETIMEDOUT' ? `killed at the ${SUITE_TIMEOUT_MS / 1000}s deadline — it hung, and printed nothing to explain itself` : `never finished (${run.error?.message ?? run.stderr ?? `signal ${run.signal}`})`}`)
    const detail = output.filter(line => /^(FAIL|✗|Error|error:)/.test(line.trim())).slice(0, 6)
    for (const line of (detail.length > 0 ? detail : output.slice(-12))) console.log(`       ${line}`)
  }
}

const failed = results.filter(result => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} suites passed${failed.length > 0 ? ` — ${failed.map(f => f.name).join(', ')} failed` : ''}`)
process.exitCode = failed.length === 0 ? 0 : 1
