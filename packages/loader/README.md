# @dsh-eac/ui-skin-loader

DSH UI 皮肤加载器 —— 弱约束公约 [`dsh.ecosystem.ui-skin-loader/v1`](https://github.com/DSH-EAC/dsh-ui-skin-loader-convention) 的参考实现。装入 DSH 后提供皮肤发现登记、全局互斥切换、持久化与跨重启恢复、故障隔离，以及设置页里的换肤控制台。

- 适配宿主：`@deepseek-ai/dsh` `0.1.7-rc.2`（`peerDependencies`）
- 运行时：Node.js >= 24
- 许可：MIT（见 `LICENSE`）；第三方声明见 `THIRD-PARTY-NOTICES.md`

## 安装

```bash
dsh plugin --profile web add <dist>/dsh-eac-ui-skin-loader-1.1.0.tgz
```

皮肤包依赖本加载器，建议先装加载器再逐个安装皮肤包。完整的构建、安装与验证说明见仓库根 [`README.md`](https://github.com/DSH-EAC/dsh-ui-skin-loader#readme)，宿主 API 实测依据见 `docs/api-notes.md`，验证战役证据见 `docs/verification.md`。

## 产物形态

| 文件 | 说明 |
| --- | --- |
| `lib/index.js` | host 半（Node ESM）：`Config` schema（settings 命名空间 `dsh-ui-skin-loader`）与 `apply` 入口 |
| `lib/client.js` | client 半（浏览器）：`uiSkinLoader` 服务、换肤控制台与皮肤运行时 |
| `cordis.patch.yml` | bundle patch 层：插入行 id `dsh-ui-skin-loader`（== settings 命名空间） |

## 保留面（公约 R2）

皮肤包不得占用 `usl-` 前缀、`dsh-ui-skin-loader` 设置命名空间与 `io.github.dsh-eac.skin.loader.` 槽位前缀。
