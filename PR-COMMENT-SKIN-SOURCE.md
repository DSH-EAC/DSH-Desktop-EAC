PR comment draft: rebase UI skin source-agnostic staging onto latest dev

Summary

This change is rebuilt on the latest origin/dev baseline and keeps EAC agnostic to the upstream UI skin source. Staging consumes the locally supplied manager payload and no longer requires a source lock, pinned source commit, artifact version, or SHA-256 digest. Runtime still consumes the staged manager snapshot and preserves structural, asset-inventory, path-safety, manager-fault, per-slot bridge, and embedded-recovery checks.

What changed

- Rebased the implementation baseline onto origin/dev, preserving the latest per-slot manager bridge.
- Removed tauri-shell/skin-manager-artifact.lock.json from the staging/runtime contract.
- Removed staging SHA-256 verification and lock-file artifact lookups from tauri-shell/stage-resources.mjs.
- Removed runtime source-lock parsing and fixed package/version/digest comparisons from tauri-shell/src/main.rs.
- Removed the Cargo rebuild trigger for the deleted lock file.
- Updated the stage-7 and minimal-core tests so they assert local payload staging without source pinning.
- Updated ADRs, README material, and the stage handoff to describe source-agnostic offline assembly.

Safety retained

- Manager fault states still reject the manager snapshot.
- Resolved asset inventory and safe relative asset paths are still required.
- Path traversal, absolute paths, backslashes, empty segments, and unsafe asset references remain rejected.
- Runtime does not fetch branches, raw URLs, or network resources.
- The manager path remains the default; DSH_UI_SKIN_MANAGER_ROLLBACK=1 remains the one-release embedded recovery fallback.

Verification

Passed:

- node --check tauri-shell/stage-resources.mjs
- node --test --experimental-strip-types dsh-desktop/test/stage-7-canonical-source.test.ts dsh-desktop/test/minimal-core-boundary.test.ts (14/14)
- git diff --check
- no unresolved index conflicts (git diff --name-only --diff-filter=U and git ls-files -u are empty)

Not run successfully:

- cargo fmt -- --check
- cargo test --locked --lib

Reason: this environment has rustup/cargo installed but no active/default Rust toolchain. No Rust result is being claimed; CI must provide the Rust toolchain and report the final status.

Scope note

The worktree already contained 38 untracked migration paths before this change. They were preserved and not added to the commit. The tracked implementation is based on origin/dev rather than merging the unrelated, disconnected prior source-agnostic history.
