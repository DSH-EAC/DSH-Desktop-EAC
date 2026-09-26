# @dsh-eac/pack-installer

EAC 整合包安装器插件。它加入官方 DSH 设置壳的 `settings.section`，显示由
Mojobox catalog 生成的 Pack 卡片，并按 L1/L2/L3 分级安装组件。

## Architecture

- `src/core/` is pure, upstream-free policy and catalog logic.
- `src/adapter/` is the only Host-side upstream boundary.
- `src/client/adapter/` is the only Client-side official-service boundary.
- `src/client/section.tsx` reuses the official settings shell and adds only the
  text mark `DSH·EAC`; it does not collect or ship official brand artwork.
- `src/data/snapshot.ts` is an offline floor generated from real local Mojobox
  records and artifacts; no digest is invented.

The installer never owns credentials or API keys. After installation it hands
signed-out users to the official account surface. A signed-in DeepSeek account
is then responsible for model access without an API key. At the pinned official
`dsh-v0.1.7-rc.2` source, the account button itself is not guaranteed to be
wired, so the adapter reports the official surface honestly rather than
pretending to implement OAuth inside this plugin.

## Build and verify

```bash
npm install
npm run verify
npm run build
npm pack
```

Publishing and repository creation remain separate owner-authorized actions.
