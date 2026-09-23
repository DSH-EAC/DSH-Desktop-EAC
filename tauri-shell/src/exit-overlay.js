(function () {
  'use strict'
  // Structure and behavior belong here; visual rules live in system.default.style.
  var HTML = [
    '<div id="dsh-exit-overlay" data-region="overlay" data-control-name="overlay-root" data-state="idle">',
    '  <div id="dsh-exit-card" role="dialog" aria-modal="true" data-control-name="dialog-surface">',
    '    <div data-control-name="dialog-title">退出 Deepseek Harness</div>',
    '    <div data-control-name="dialog-body">后台运行时窗口会隐藏到系统托盘，任务完成后会发通知。</div>',
    '    <div data-control-name="dialog-actions">',
    '      <button data-control-name="system.default.exit-minimize" data-state="idle" data-v="minimize">最小化到托盘</button>',
    '      <button data-control-name="system.default.exit-quit" data-state="dangerous" data-v="quit">退出应用</button>',
    '      <button data-control-name="overlay-close" data-state="idle" data-v="cancel">取消</button>',
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
