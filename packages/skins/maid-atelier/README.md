# 深海女仆工坊 / Abyssal Maid Atelier

This is the `dsh.ecosystem.ui-skin-loader/v1` conversion of the historical
`maid-atelier` skin. It is sourced from immutable `DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf`
Git objects and keeps the original bundle's visual behavior.

- Skin id: `dsh-eac.skin.maid-atelier`
- License: `MIT AND CC-BY-NC-SA-4.0` (MIT package glue + CC BY-NC-SA 4.0 vendored artwork)
- Source package: `@dsh-external/dsh-client-ui-skin-maid-atelier`
- Lifecycle: registration is side-effect free; all DOM, observer, timer and
  favicon effects occur only after loader activation and are unwound on
  deactivate, abort, or fiber disposal.
- Full provenance and license text: `THIRD-PARTY-NOTICES.md`.

Build and test:

```bash
pnpm --filter @dsh-eac/skin-maid-atelier build
pnpm --filter @dsh-eac/skin-maid-atelier test
```
