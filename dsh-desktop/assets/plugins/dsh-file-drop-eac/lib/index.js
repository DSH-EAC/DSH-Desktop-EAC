/**
 * dsh-file-drop-eac — host half (no-op).
 *
 * 「拖入文件/文件夹到对话」的 EAC 特化版（替代已弃用的 dsh-file-drop）：
 *   · 普通文件显示可预览、可移除的卡片，保存临时副本后只注入紧凑路径
 *     引用，不把全文铺进输入框；
 *   · 图片继续交给官方缩略图链路，混合批次拆分处理；
 *   · 新增对文件夹的接管 —— 识别拖入的是文件夹并给出可操作提示
 *     （浏览器/Electron 出于安全无法把文件夹的磁盘绝对路径交给页面，
 *     故降级为说明 + 替代方案）；
 *   · 临时副本保存失败时，小文本文件才回退为内容注入。
 *
 * 拖放完全由浏览器半边完成（drop 事件发生在 Web UI 页面里），本半边仅
 * 让包成为合法 bundle。
 */
export const name = 'file-drop-eac';
export const inject = [];
export function apply() {
  // no-op.
}
