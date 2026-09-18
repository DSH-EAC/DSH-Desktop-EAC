# v6 Task 3.1 final verification

Date: 2026-09-18
Task: `t_4a3abc50` (implementation chain through `t_1183d99c`, with architecture follow-up `t_411bb0d1`)
Host: Linux `aarch64`

## Result summary

| Gate | Result | Evidence |
|---|---|---|
| `npm run typecheck` | PASS | exit 0 |
| `npm run build` | PASS | exit 0 |
| `npm test` | PASS | 135 tests, 135 passed, 0 failed, 0 skipped |
| `cargo fmt -- --check` | PASS | exit 0 |
| `cargo test --locked` | PASS | 8 passed, 0 failed, 0 ignored |
| `cargo check --locked` | PASS | exit 0; final incremental run finished in 8.55s |
| workflow YAML parse and structure checks | PASS | PyYAML `safe_load`; jobs `source-and-unit`, `rust-shell`, `staged-runtime` present; Linux/Windows matrix asserted |
| `git diff --check` | PASS | exit 0 |
| local staged runtime | NOT RERUN | the pinned kernel install completed, but its full official build did not finish on this 1.8 GiB ARM host; the final stage contract supports native Linux x64 and arm64, but still requires a complete architecture-matching runtime tree |
| local isolated boot smoke | BLOCKED | no valid staged tree existed; the smoke was not run against a fabricated or incomplete tree |
| remote GitHub Actions | UNKNOWN | workflow was created locally but was not pushed or dispatched by this task |

The three `fatal: not a git repository` lines printed during `npm test` are expected stderr from the `verify-dist-fresh` non-repository fixtures. All four tests in that group passed.

## CI coverage

`.github/workflows/ci.yml` defines:

- triggers for `pull_request`, pushes to `dev` and `main`, and `workflow_dispatch`;
- branch/workflow concurrency cancellation;
- Node 24 and pinned pnpm 11.7.0;
- a kernel cache keyed by OS, `0.1.5-rc.2`, and the `fetch-kernel.ts` hash;
- a Node source/unit job that installs, typechecks, builds, runs the non-empty test suite, and checks manifest drift;
- a Rust matrix on Ubuntu 22.04 and Windows with `fmt`, `test --locked`, and `check --locked`;
- Linux Tauri system dependencies;
- native Ubuntu x64 and arm64 staged-runtime jobs that fetch runtime assets, assemble the real tree, verify the exact minimal closure and bundle manifest, then run the isolated boot smoke;
- explicit fail-fast rejection for unsupported 32-bit stage targets and architecture-isolated kernel caches.

Local YAML parsing is not a remote CI result. Remote status remains unknown until GitHub Actions executes all jobs.

## Staged and smoke contracts

`dsh-desktop/scripts/verify-staged-runtime.mjs` checks real staged files, rejects retired recovery/rescue/state/log/protocol artifacts, parses `bundle-manifest.json`, and calls the production `verifyBundle` implementation against staged `node_modules`.

`dsh-desktop/scripts/minimal-boot-smoke.mjs` uses temporary `DSH_HOME`, HOME, XDG and AppData roots. It checks sidecar identity, `-32601` for `rc.action`, `rescue.safe-mode`, and `guard.action`, calls `boot.start`, requires token HTTP 303 followed by authenticated UI 200, stops the web process, shuts down the sidecar, and verifies the web endpoint no longer responds. Failure cleanup attempts `boot.stop` and `shutdown` before a final process kill.

The local host is `aarch64`. The final stage policy accepts native `x64` and `arm64`, rejects 32-bit targets, and does not support cross-architecture assembly. No stage success is inferred from this host because a complete arm64 runtime tree was not available. The GitHub staged-runtime matrix is the required execution environment for both supported architectures.

An additional ARM feasibility attempt used the pinned pnpm 11.7.0 and explicit `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` settings. The 1,264-package workspace install completed in 37m39s, and `build:official` built `linux-arm64/bin/glibc/system.node`. The following host TypeScript build remained in `tsc -b tsconfig.host.json` for more than 34 minutes while the 1.8 GiB host used 3.2 GiB swap, so the optional local build was stopped without claiming a pass. This demonstrates ARM kernel build support, while the complete arm64 staged runtime and smoke remain for the native GitHub Actions runner to verify.

## Shell route correction

Unknown and retired shell pages now return HTTP 404 instead of the previous generic 200 page. `/loading`, `/died`, `/inject/bridge.js`, `/skin/*`, and `/` remain valid. Rust tests exercise the route classifier, a real TCP request to the retired recovery path, and the `/died` retry contract through `boot.start` only.

The two unused clipboard helper functions left after the v5 interface contraction were removed. Their public RPC had already been removed and existing boundary tests require that it stay absent.

## Final state

ADR 0006 now starts with the current effective decision index: v2 is historical; v3 strict scope, v4 source deletion, and v5 interface contraction are authoritative. Recovery is by Git history plus a future package integration, not by current placeholder pages or RPC methods.
