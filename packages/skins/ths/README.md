# 同花顺风格 / Tonghuashun Trading

This is the `dsh.ecosystem.ui-skin-loader/v1` conversion of the historical
`ths` skin. It is sourced from immutable `DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf`
Git objects and keeps the original bundle's visual behavior.

- Skin id: `dsh-eac.skin.ths`
- License: `MIT AND BSD-3-Clause`
- Source package: `@linxin666/dsh-client-ui-skin-ths`
- Lifecycle: registration is side-effect free; all DOM, observer, timer and
  favicon effects occur only after loader activation and are unwound on
  deactivate, abort, or fiber disposal.
- Full provenance and license text: `THIRD-PARTY-NOTICES.md`.

Build and test:

```bash
pnpm --filter @dsh-eac/skin-ths build
pnpm --filter @dsh-eac/skin-ths test
```
