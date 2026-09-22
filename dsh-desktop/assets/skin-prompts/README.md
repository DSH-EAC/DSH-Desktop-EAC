# 自定义皮肤 Prompt 包

本目录收集 EAC 与 AIO 已有自定义客户端皮肤的 AI 创作说明。它服务于皮肤
复刻、迁移和继续设计，不参与 Cordis 皮肤的运行时加载。

## 目录

```text
skin-prompts/
├── schema/manifest.schema.json
├── inventory.json
└── packages/<skin-id>/
    ├── manifest.json
    ├── prompt.md
    └── README.md
```

## 使用方式

1. 读取目标包的 `manifest.json`，确认来源、许可证和目标客户端。
2. 将 `prompt.md` 作为主要需求说明。
3. 按 `references` 查看原始代码和预览图，不要把构建后的压缩 CSS 当成
   唯一设计依据。
4. 生成或修改皮肤时保留 Prompt 中列出的业务能力、接口边界和可访问性要求。

## 约束

- 一个目录只描述一套皮肤。
- Prompt 包不等于可安装插件，不包含安装或启用逻辑。
- Prompt 包不属于 `assets/shell-skin/`，也不继承 PR #389 的壳层契约。
- 原始皮肤的授权条件仍然适用，Prompt 包不能扩大原许可证授予的权利。
- `inventory.json` 中相同 ID 的 EAC/AIO 来源只表示同一皮肤谱系，不保证
  两份源码逐字相同。
