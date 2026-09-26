# Third-party notices — @dsh-eac/ui-skin-loader

The loader is authored by DSH-EAC and contains **no vendored third-party artwork or runtime code**. The package glue (adapter, runtime, console, build script) is MIT under the repository [`LICENSE`](./LICENSE).

## Redistributed content

- `lib/index.js` (host half) and `lib/client.js` (client half) are built from this repository's own `src/`.
- Both halves keep every upstream package **external** — nothing third-party is bundled:
  - `lib/index.js` imports `@deepseek-ai/schemastery` (declared in `dependencies`; resolved by the host profile tree at install time, not redistributed here);
  - `lib/client.js` requires only the host baseline module-table words (`react`, `react/jsx-runtime`).
- `peerDependencies` (`@deepseek-ai/dsh` `0.1.7-rc.2`, `@deepseek-ai/cordis` `~4.0.4`) are supplied by the DSH runtime and are likewise not redistributed here. Their licenses remain with their respective owners.

## Verification

The absence of bundled third-party code is checked mechanically in CI: `packages/loader/src/manifest.test.ts` locks the package metadata and license files, and the built artifacts are inspected by the release smoke checks documented in `docs/verification.md`.
