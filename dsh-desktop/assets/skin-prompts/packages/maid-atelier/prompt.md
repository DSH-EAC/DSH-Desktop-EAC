# 深海女仆工坊皮肤

## 设计目标

围绕双女仆工坊场景构建精致动漫主题，在深海蓝、陶瓷白和柔金之间形成高定制
视觉。装饰可以丰富，但不能遮挡长对话、工具输出和代码。

## 视觉关键词

双女仆、深海、工坊、蕾丝、陶瓷白、长春花蓝、柔金、Q 版侧栏、玻璃。

## 色彩系统

以深海蓝 `#10204d`、靛蓝 `#526aa8`、长春花蓝 `#8ea5da` 为主体，
陶瓷白 `#f8f6f0` 承载内容，柔金 `#c5a468` 用于边框和重点装饰。

## 页面布局

对话区背景展示双角色工坊场景，侧边栏可使用 Q 版装饰。面板以玻璃和陶瓷表面
分层，蕾丝或金线只用于边缘。必须兼容桌面标题栏高度和窗口控制区域。

## 核心控件

输入框、卡片和菜单使用深蓝细线、柔金重点边框及适中圆角。加载、思考和工具
运行状态保留独立动画钩子。危险操作仍用清晰红色，不以金色代替。

## 明暗主题

浅色主题以陶瓷白和长春花蓝为主；深色主题以深海军蓝和低亮度金色为主。
角色背景在两种主题下都要通过遮罩保证正文可读。

## 动画与交互

可以为加载、思考和工具状态提供稳定的小幅动画，禁止让人物背景持续抢占注意力。
减少动态效果时停止非必要动画。

## 业务与接口边界

保留 DSH 全部业务和窗口控制行为，作用域限定在
`body[data-dsh-maid-atelier]`。不得覆盖桌面标题栏可拖动区域。该皮肤采用
`CC-BY-NC-SA-4.0`，衍生与分发必须保留署名、非商业和相同方式共享条件。

## 可用素材

- `dsh-desktop/assets/skins/maid-atelier/skin.json`
- `dsh-desktop/assets/skins/maid-atelier/lib/client.js`
- `dsh-desktop/assets/skins/maid-atelier/preview/light.webp`
- `dsh-desktop/assets/skins/maid-atelier/preview/dark.webp`
- `dsh-desktop/assets/skins/maid-atelier/LICENSE`
- `dsh-desktop/assets/skins/maid-atelier/NOTICE`

## 验收标准

1. 双女仆、深海蓝、陶瓷白和柔金特征完整。
2. 标题栏、输入框、工具状态和设置面板均可正常使用。
3. 明暗主题与减少动态效果均完整。
4. 分发物保留许可证和 NOTICE。
