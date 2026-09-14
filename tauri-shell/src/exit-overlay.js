(function () {
  'use strict'
  // 退出确认 overlay：叠加到主窗，不新建窗口、不替换页面。
  // 按钮颜色：蓝=最小化到托盘、红=退出应用、灰=取消。
  // 样式消费壳层皮肤包 token（--eac-shell-*，v6 Task 1.1）；overlay 注入
  // 在主窗 Web UI 上下文（无 /skin/ 路由），fallback 字面量恒为实际渲染
  // 值，与皮肤包 tokens.css 同源同值，保证视觉不变。
  var CSS = [
    '#dsh-exit-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:var(--eac-shell-bg-overlay,rgba(5,10,24,.65));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}',
    '#dsh-exit-card{background:var(--eac-shell-card-bg,#1e1e2e);border:1px solid var(--eac-shell-border,rgba(255,255,255,.10));border-radius:14px;padding:28px 32px 22px;width:380px;box-shadow:var(--eac-shell-card-shadow,0 12px 48px rgba(0,0,0,.6));user-select:none}',
    '#dsh-exit-card .hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}',
    '#dsh-exit-card .title{font-size:17px;font-weight:600;color:var(--eac-shell-text-primary,#dfe6ff)}',
    '#dsh-exit-card .sub{font-size:12px;color:var(--eac-shell-text-secondary,#8b9ac4);margin-bottom:20px;line-height:1.5}',
    '#dsh-exit-card .btns{display:flex;flex-direction:column;gap:9px}',
    '#dsh-exit-card .btn-min{padding:10px;border:1px solid var(--eac-shell-accent-soft-border,rgba(91,140,255,.35));border-radius:10px;background:var(--eac-shell-accent-soft-bg,rgba(91,140,255,.12));color:var(--eac-shell-accent-text,#a8c4ff);font-size:13.5px;cursor:pointer;text-align:center;transition:background .15s}',
    '#dsh-exit-card .btn-min:hover{background:var(--eac-shell-accent-soft-bg-hover,rgba(91,140,255,.22))}',
    '#dsh-exit-card .btn-quit{padding:10px;border:1px solid var(--eac-shell-danger-soft-border,rgba(232,50,70,.30));border-radius:10px;background:var(--eac-shell-danger-soft-bg,rgba(232,50,70,.10));color:var(--eac-shell-danger,#ff8a94);font-size:13.5px;cursor:pointer;text-align:center;transition:background .15s}',
    '#dsh-exit-card .btn-quit:hover{background:var(--eac-shell-danger-soft-bg-hover,rgba(232,50,70,.20))}',
    '#dsh-exit-card .btn-cancel{padding:8px;border:none;border-radius:10px;background:transparent;color:var(--eac-shell-text-tertiary,#6e7f9e);font-size:12.5px;cursor:pointer;text-align:center;transition:color .15s}',
    '#dsh-exit-card .btn-cancel:hover{color:var(--eac-shell-text-label,#a8b8d0)}',
    '@media(hover:none){#dsh-exit-card .btn-min,#dsh-exit-card .btn-quit,#dsh-exit-card .btn-cancel{padding:13px}}',
  ].join('\n')
  var HTML = [
    '<div id="dsh-exit-overlay">',
    '  <div id="dsh-exit-card">',
    '    <div class="hdr"><span class="title">退出 Deepseek Harness</span></div>',
    '    <div class="sub">后台运行时窗口会隐藏到系统托盘，任务完成后会发通知。</div>',
    '    <div class="btns">',
    '      <button class="btn-min" data-v="minimize">最小化到托盘</button>',
    '      <button class="btn-quit" data-v="quit">退出应用</button>',
    '      <button class="btn-cancel" data-v="cancel">取消</button>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('\n')

  function dismiss() {
    var el = document.getElementById('dsh-exit-overlay')
    if (el) el.remove()
    if (activeKeyHandler) {
      document.removeEventListener('keydown', activeKeyHandler)
      activeKeyHandler = null
    }
  }

  // 每次 show() 都会挂一个 keydown 监听（Escape 取消用）：旧实现只有 Esc
  // 路径自移除，反复开关 overlay 会把监听器累加到 document 上。show() 开头
  // 先经 dismiss() 卸掉旧监听，杜绝堆积。
  var activeKeyHandler = null

  function show() {
    dismiss()
    // 样式按 id 复用：旧实现每次 show() 都 append 一个新 <style>，dismiss()
    // 只删 overlay 节点 —— 反复「取消→再关」会在 head 里无限堆 style 标签。
    var style = document.getElementById('dsh-exit-overlay-style')
    if (!style) {
      style = document.createElement('style')
      style.id = 'dsh-exit-overlay-style'
      style.textContent = CSS
      document.head.appendChild(style)
    }
    document.body.insertAdjacentHTML('beforeend', HTML)
    document.querySelectorAll('[data-v]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-v')
        dismiss()
        if (window.dshDesktop && window.dshDesktop._call) {
          var target = v === 'cancel' ? 'win.close-dialog' : (v === 'quit' ? 'win.close-force' : 'win.hide-and-close-dialog')
          window.dshDesktop._call(target, {}).catch(function () { dismiss() })
        } else {
          dismiss()
        }
      })
    })
    // Escape / Cmd+W 取消
    var onKey = function (e) {
      if (e.key === 'Escape' || (e.metaKey && e.key === 'w')) {
        e.preventDefault()
        dismiss()
        if (window.dshDesktop && window.dshDesktop._call) window.dshDesktop._call('win.close-dialog', {})
        else dismiss()
      }
    }
    activeKeyHandler = onKey
    document.addEventListener('keydown', onKey)
  }

  window.__dshExitOverlay = { show: show, dismiss: dismiss }
  show()
})()
