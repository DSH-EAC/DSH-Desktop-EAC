PR comment draft: relax UI skin source provenance requirements

Summary

This change makes EAC agnostic to the upstream UI skin source. Staging now consumes the locally supplied manager payload and no longer requires a source lock, pinned source commit, artifact version, or SHA-256 digest. Runtime still consumes the staged manager snapshot and preserves structural, asset-inventory, path-safety, manager-fault, and embedded-recovery checks.

What changed

- Removed tauri-shell/skin-manager-artifact.lock.json from the staging/runtime contract.
- Removed staging SHA-256 verification and lock-file artifact lookups from tauri-shell/stage-resources.mjs.
- Removed runtime source-lock parsing and fixed package/version/digest comparisons from tauri-shell/src/main.rs.
- Removed the Cargo rebuild trigger for the deleted lock file.
- Updated the stage-7 tests so they assert local payload staging without source pinning.
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
- git diff --cached --check

Not run successfully:

- cargo fmt -- --check
- cargo test --locked --lib

Reason: this environment has rustup/cargo installed but no active/default Rust toolchain (`rustup show active-toolchain` reports no active toolchain). No Rust result is being claimed.

Review note

The worktree already contained a large staged migration from the latest development line before this task-specific change. This commit preserves that existing staged baseline and adds the source-provenance relaxation on top; no history rewrite or unrelated cleanup was performed.
