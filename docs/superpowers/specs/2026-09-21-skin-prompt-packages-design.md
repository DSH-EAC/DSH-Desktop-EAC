# EAC/AIO 自定义皮肤 Prompt 包设计

日期：2026-09-21

## 目标

收集 EAC 与 AIO 已有的自定义客户端皮肤，将每套皮肤整理为可供 AI 阅读、
复刻和继续修改的 Prompt 包。该交付物独立于 Issue #363 和 PR #389 的
壳层皮肤包，不依赖 `shell-skin` 的 Skin/Control/Style 实现。

## 范围

第一阶段交付：

1. 定义 Prompt 包目录和 `manifest.json` 契约。
2. 建立 JSON Schema。
3. 盘点 EAC 与 AIO 的全部自定义皮肤。
4. 以 `miku` 制作第一份完整样板，并按确认后的模板整理其余九套皮肤。
5. 增加自动化契约测试。

本任务不改变现有 Cordis 皮肤的加载、安装或切换逻辑。

## 包结构

```text
dsh-desktop/assets/skin-prompts/
├── README.md
├── schema/
│   └── manifest.schema.json
├── inventory.json
└── packages/
    └── <skin-id>/
        ├── manifest.json
        ├── prompt.md
        └── README.md
```

Prompt 包默认引用仓库中的原始代码、预览图和许可证，而不复制这些文件。
这样可以避免预览图和大型构建产物产生重复副本。`manifest.json` 同时记录
来源版本和 Git tree，确保引用可以追溯。

## 数据模型

`manifest.json` 包含：

- 包格式版本、皮肤 ID、名称、作者和标签；
- 面向 AI 的 `prompt.md`；
- EAC 与 AIO 两个来源版本；
- 原始代码、预览图和许可证引用；
- 目标客户端、主题模式和可访问性约束；
- Prompt 的必备章节。

`inventory.json` 记录全部皮肤的 EAC/AIO 来源路径和 Git tree，不把相同 ID
直接判定为相同内容。

## Prompt 规则

每个 `prompt.md` 必须覆盖：

1. 设计目标与视觉关键词；
2. 色彩、字体、排版和空间；
3. 页面布局及主要区域；
4. 输入框、按钮、菜单等控件；
5. 明暗主题和交互状态；
6. 动效与减少动态效果；
7. 必须保留的业务行为；
8. 禁止修改的接口和约束；
9. 可用源文件与预览图；
10. 可检查的验收标准。

Prompt 描述视觉意图和实施边界，不内嵌整份压缩 CSS，也不要求 AI 重写业务
逻辑。

## 验证

契约测试检查：

- Schema、清单和样板文件存在且 JSON 可解析；
- 清单覆盖 EAC/AIO 的十套皮肤；
- 样板符合必填字段和枚举约束；
- 所有本地引用均存在；
- Prompt 包含规定章节；
- Prompt 包不依赖 `assets/shell-skin/`。

## 后续

十套皮肤均按同一模板整理。AIO 来源来自独立历史分支，因此测试验证清单、
Manifest 和本地引用的一致性，不依赖 CI 必须检出 AIO 分支对象。若团队后续
确定正式的 Prompt 包公约，通过提升 `schemaVersion` 演进，不静默改变版本 1
的字段语义。
