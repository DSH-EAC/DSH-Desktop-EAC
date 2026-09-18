/// <reference lib="dom" />
'use strict';
// DSH 桌面桥（v6 Task 3.1 · 官方契约 + 壳最小控制面）：在 Tauri WebView2 里
// 暴露 window.dshDesktop（transport = 回环 WS JSON-RPC，而非 ipcRenderer）。
//
// 通道分流：
//   win.*   → Rust 壳层在 WS 中继处本地拦截（窗口控制/拖拽/开发工具）
//   boot.*  → 转发 sidecar（dsh web 进程编排）
//   通知帧（无 id）→ win.maximized / boot.web-ready 推送
//
// 页面侧 chrome：36px 玻璃栏（主窗 decorations(false)，自绘标题栏必需），
// mousedown → win.start-dragging（WebView2 无 -webkit-app-region），5s 心跳，
// 页面异常上报。
//
// 接口面收敛（ADR 0006 v5）：只保留官方 dshDesktop 契约 + 窗口控制 + boot；
// EAC 自造面全部移除，被剥能力接回见 ADR 0006「插口契约」节。

(function () {
  var BAR_ID = '__dsh_desktop_chrome__';
  var BAR_HEIGHT = 36;

  // 回环 WS JSON-RPC 客户端（单源：assets/ws-jsonrpc-client.js，Rust 壳在
  // initialization_script 序列中先注入本桥）。connect/queue/call/重连逻辑
  // 只存在于单源文件；这里只做钩子接线与语义别名。
  var notifyHooks: ((method: string, params: any) => void)[] = [];
  var readyHooks: ((info: any) => void)[] = [];
  var rpc = (window as any).__DSH_WS_RPC__({
    onOpen: function () {
      call('boot.state', {}).then(function (info) {
        try { readyHooks.forEach(function (h) { h(info); }); } catch (e) { /* 页面回调异常不断桥 */ }
      }).catch(function () { /* boot.state 不可用不致命 */ });
    },
  });
  rpc.onNotify(function (method: string, params: any): void {
    try { notifyHooks.forEach(function (h) { h(method, params); }); } catch (e) { /* 同上 */ }
  });

  // fire-and-forget（ipcRenderer.send 语义）：不等回复，断了就丢。
  function send(method: string, params?: unknown): void { rpc.send(method, params); }
  // invoke 语义（ipcRenderer.invoke）：Promise + 超时。
  function call(method: string, params?: unknown, timeoutMs?: number): Promise<any> { return rpc.call(method, params, timeoutMs); }
  function onNotify(fn: (method: string, params: any) => void): void { notifyHooks.push(fn); }

  // ---------------------------------------------------------------------------
  // window.dshDesktop（v6 Task 3.1 · 官方契约 + 壳最小控制面）
  //
  // 面收敛依据（ADR 0006 v5）：只保留「官方保留的接口」——
  //   1. 官方 dshDesktop 契约（对照内核 apps/desktop/src/ipc.ts 的
  //      DshDesktopApi：protocolVersion / locale / plugins / updates）；
  //      其中 plugins.* 与 updates.* 的能力随最简本体剥出，按官方返回形态
  //      给出空实现（list → []，check → idle），接回时替换实现体即可。
  //   2. 壳最小控制面：windowControls（窗口控制，主窗 decorations(false)
  //      自绘标题栏必需）+ boot（拉起/停止/查询 dsh web）。
  // 其余 EAC 自造面（chrome.init / menu.* / files.* / balance.* / phone.* /
  // guard.* / rc.* / rescue.* / recovery.* / onboard.* / wizard.* / service.* /
  // profile.* / float.* / imagePaste / fileDrop / copyText / openExternal /
  // openPath / getPathForFile）全部移除。
  // ---------------------------------------------------------------------------
  function unavailable(capability: string): Promise<never> {
    return Promise.reject(new Error('capability "' + capability + '" is not bundled in the v6 minimal core'));
  }

  (window as any).dshDesktop = {
    // ---- 官方 dshDesktop 契约 ----
    protocolVersion: 1,
    locale: function () {
      try { return Promise.resolve(String((navigator && navigator.language) || 'zh-CN')); }
      catch (e) { return Promise.resolve('zh-CN'); }
    },
    plugins: {
      list: function () { return Promise.resolve([]); },
      add: function () { return unavailable('plugin-install'); },
      remove: function () { return unavailable('plugin-install'); },
      update: function () { return unavailable('plugin-install'); },
    },
    updates: {
      check: function () { return Promise.resolve({ phase: 'idle' }); },
      install: function () { return unavailable('client-update'); },
      subscribe: function () { return function () { /* 无更新事件源 */ }; },
    },
    // ---- 壳最小控制面：窗口控制（自绘标题栏与 Rust L1 能力）----
    windowControls: {
      minimize: function () { return call('win.minimize', {}); },
      toggleMaximize: function () { return call('win.toggle-maximize', {}); },
      close: function () { return call('win.close', {}); },
      isMaximized: function () { return call('win.is-maximized', {}).then(function (r) { return !!(r && r.maximized); }); },
      reload: function () { return call('win.reload', {}); },
      toggleDevtools: function () { return call('win.devtools', {}); },
      toggleFullscreen: function () { return call('win.fullscreen', {}); },
      openInBrowser: function () { return call('win.open-browser', {}); },
      onMaximizeChange: function (cb: (maximized: boolean) => void) {
        var hook = function (method: string, params: any) {
          if (method !== 'win.maximized') return;
          try { cb(!!(params && params.maximized)); } catch (e) { /* 回调异常不断桥 */ }
        };
        notifyHooks.push(hook);
        return function () {
          var i = notifyHooks.indexOf(hook);
          if (i >= 0) notifyHooks.splice(i, 1);
        };
      },
    },
    // ---- 壳最小控制面：dsh web 服务编排 ----
    boot: {
      start: function () { return call('boot.start', {}); },
      stop: function () { return call('boot.stop', {}); },
      state: function () { return call('boot.state', {}); },
      restart: function () { return call('boot.restart', {}); },
      onStateChange: function (cb: (info: any) => void) {
        var hook = function (method: string, params: any) {
          if (method !== 'boot.web-ready') return;
          try { cb(params); } catch (e) { /* 回调异常不断桥 */ }
        };
        notifyHooks.push(hook);
        return function () {
          var i = notifyHooks.indexOf(hook);
          if (i >= 0) notifyHooks.splice(i, 1);
        };
      },
    },
    // ---- v6 Task 3.3 接回：内置插件消费的 EAC 面 ----
    // 依据 ADR 0006 v5 的接口收敛清单，这些方法族曾随最简本体剥出；
    // 现按其「插口契约」逐项接回。服务端实现见 sidecar/server.ts。
    // 配置收窄说明：仅恢复当前已接回插件实际消费的键，未恢复的
    // （menu / floatWindow / phoneBridge / pluginUpdates / imagePaste /
    //   recovery / rescue / refreshBalance / restartService 等）继续留空。
    pluginManager: {
      list: function () { return call('plugins.list', {}); },
      setEnabled: function (id: string, enabled: boolean) { return call('plugins.set-enabled', { id: id, enabled: enabled }); },
      setRemoved: function (id: string, removed: boolean) { return call('plugins.set-removed', { id: id, removed: removed }); },
    },
    guard: {
      action: function (action: string, value?: unknown) { return call('guard.action', { action: action, value: value }); },
    },
    fileDrop: {
      save: function (payload: Record<string, unknown>) { return call('file-drop.save', payload || {}); },
    },
    // 浏览器环境无 File 磁盘路径：与 v5 一致返回空串，插件据此降级为可读提示。
    getPathForFile: function (): string { return ''; },
    // 壳信息（v6 语义：等同 boot.state；staticPort 恒 0，静态预览服务随
    // 插件面剥出，客户端按既有契约回退宿主路由）。
    getInfo: function () { return call('boot.state', {}); },
    // 文件还原（内容精确匹配；白名单校验在 sidecar）。
    revertFiles: function (changes: unknown) { return call('files.revert', { changes: changes }); },
    // 文件打开：L1 拦截（先经 sidecar files.authorize-open 授权，再 ShellExecuteW）。
    openPath: function (path: string) { return call('files.open', { path: path }); },
    // 外链打开：L1 拦截（ShellExecuteW）。
    openExternal: function (url: string) { return call('shell.open-external', { url: url }); },
    // 桥内省（壳层页面与冒烟用；不属于对外契约）。
    _call: call,
    _send: send,
    _onNotify: onNotify,
    _onReady: function (fn: (info: any) => void) { readyHooks.push(fn); },
  };
  var dshDesktop: any = (window as any).dshDesktop;

  // 页面异常 → 壳层日志。
  window.addEventListener('error', function (e) {
    try { send('log.page-error', { message: 'window.onerror: ' + ((e && (e.message || e.error)) || 'unknown') }); } catch (err) { /* 忽略 */ }
  });
  window.addEventListener('unhandledrejection', function (e) {
    try { send('log.page-error', { message: 'unhandledrejection: ' + String((e && (e as any).reason && ((e as any).reason.message || (e as any).reason)) || e) }); } catch (err) { /* 忽略 */ }
  });

  // ---------------------------------------------------------------------------
  // Chrome DOM（36px 玻璃栏；拖拽 = mousedown → win.start-dragging）
  // ---------------------------------------------------------------------------
  var GLYPHS = {
    min: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><path d="M2.5 6h7"/></svg>',
    max: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1"><rect x="2.6" y="2.6" width="6.8" height="6.8" rx="1.4"/></svg>',
    restore: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M4.2 4.2V2.6h5.2v5.2H7.8"/><rect x="2.6" y="4.2" width="5.2" height="5.2" rx="1.2"/></svg>',
    close: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8"/></svg>',
  };

  var maxBtn: HTMLElement | null = null;
  // 壳栏展示状态（来源：boot.state —— 唯一的壳信息接口）。
  var state: any = { appVersion: '', agentVersion: '', agentSource: '' };

  // WebView2 无 -webkit-app-region:drag —— mousedown 转发壳层 start_dragging。
  // 双击标题 = 最大化/还原（与系统标题栏默认行为对齐）。
  function armDrag(el: Element): void {
    var lastClick = 0;
    el.addEventListener('mousedown', function (e) {
      if ((e as MouseEvent).button !== 0) return;
      var target = e.target as HTMLElement | null;
      // 按钮上的按下不触发拖拽（关闭/最大化等仍可点击）。
      if (target && target.closest && target.closest('button')) return;
      var now = Date.now();
      if (now - lastClick < 400) {
        lastClick = 0;
        dshDesktop.windowControls.toggleMaximize().catch(function () { /* 壳层不可用时静默 */ });
        return;
      }
      lastClick = now;
      send('win.start-dragging', {});
    });
  }

  function setMaximized(isMax: boolean): void {
    if (!maxBtn) return;
    maxBtn.innerHTML = isMax ? GLYPHS.restore : GLYPHS.max;
    maxBtn.title = isMax ? '还原' : '最大化';
    maxBtn.setAttribute('aria-label', maxBtn.title);
  }

  // ---------------------------------------------------------------------------
  // UI 稳定性垫片（自绘标题栏相关；不碰内核/插件代码，纯 CSS 层叠加）
  // 背景：主窗 decorations(false) 由桥自绘 36px 标题栏；内核 hero 输入区在
  // 内容高于视口时顶部不可滚动到达、被 overflow 链与标题栏切掉，模型选择弹层
  // 也会捅进标题栏区被盖住。三类修正：
  //  b) 新建对话裁剪 —— hero 阶段 scrollBody 用 justify-content:center 居中，
  //     内容高于视口时顶部不可达；改为 flex-start + 子项 margin-block:auto
  //     （放得下时居中、放不下时从顶排布可滚）。
  //  c) 模型选择弹层遮挡 —— 菜单 absolute 向上展开且 z 只有 20，顶部会捅出滚动
  //     容器/视口并被高 z 覆盖物盖住；抬到内容层之上并支持「翻转向下」救援。
  //  d) 悬停浮层横向溢出 —— hero 输入区的 absolute 浮层向上展开时把滚动容器撑出
  //     横向溢出；在输入区滚动体与 body 层把 x 轴溢出钉死。
  // ---------------------------------------------------------------------------
  function injectUiPatchCss(): void {
    if (document.getElementById('dsh-ui-patch')) return;
    var tag = document.createElement('style');
    tag.id = 'dsh-ui-patch';
    tag.textContent = '\
  html[data-dsh-title-bar-height] #root,\
  html[data-dsh-title-bar-height] #root > div[data-slot="root"] > div > div:nth-child(2){transition:none!important}\
  /* 0.1.2 起 CSS Modules 哈希前缀随内核版本漂移（.wSkVaW_*→.FArfia_*，\
     ._7KE1Ra_menu→.ra1x4W_menu，已从安装闭包 bundle 实核），旧哈希选择器\
     全部换锚稳定契约 data-phase/data-conversation-scroll（不随构建漂移），\
     旧哈希仅作回滚内核场景的兜底保留。 */\
  html[data-dsh-title-bar-height] [data-phase=hero] [data-conversation-scroll]{justify-content:flex-start!important}\
  html[data-dsh-title-bar-height] [data-phase=hero] [data-conversation-scroll] > *{margin-block:auto!important}\
  html[data-dsh-title-bar-height] .wSkVaW_root[data-phase=hero] .wSkVaW_scrollBody{justify-content:flex-start!important}\
  html[data-dsh-title-bar-height] .wSkVaW_root[data-phase=hero] .wSkVaW_scrollBody > *{margin-block:auto!important}\
  html[data-dsh-title-bar-height] ._7KE1Ra_menu,\
  html[data-dsh-title-bar-height] .ra1x4W_menu{z-index:5100!important}\
  html[data-dsh-title-bar-height] ._7KE1Ra_menu.dsh-popup-flip,\
  html[data-dsh-title-bar-height] .ra1x4W_menu.dsh-popup-flip{top:calc(100% + 8px)!important;bottom:auto!important}\
  html[data-dsh-title-bar-height] [class*=composerStack]:has(._7KE1Ra_menu),\
  html[data-dsh-title-bar-height] [class*=composerStack]:has(.ra1x4W_menu){overflow:visible!important}\
  html[data-dsh-title-bar-height] [data-phase=hero] [data-conversation-scroll]{overflow-x:hidden!important}\
  html[data-dsh-title-bar-height] .wSkVaW_root[data-phase=hero] .wSkVaW_scrollBody{overflow-x:hidden!important}\
  html[data-dsh-title-bar-height] body{overflow-x:hidden!important}\
  /* 0.1.2 设置弹窗滚动防御（结构性选择器不随哈希类漂移）：左栏滚到边界后剩余滚动量链到外层/右栏滚动锚定微移，用户感知为「滑左栏右边跟着小幅滑动」；弹窗层挡链 + 两栏禁链 + 禁滚动锚定 */\
  [role=dialog]{overscroll-behavior:contain!important}\
  [role=dialog] [class*=navList],[role=dialog] [class*=options]{overscroll-behavior:contain!important;overflow-anchor:none!important}\
  [role=dialog] [class*=panel],[role=dialog] [class*=overlay]{overscroll-behavior:contain!important}';
    document.head.appendChild(tag);
  }

  // 模型选择弹层救援：菜单绝对定位向上展开（最高 360px + 8px 间距），在 hero
  // 页或矮窗口里顶部会越出滚动容器/视口被切。探到菜单顶部进入玻璃栏区（<40px）
  // 就翻转向下展开，并按触发钮下方可用空间收缩高度；菜单关闭或空间充足时还原。
  // 翻转向下后菜单会伸出 composerStack（overflow:auto）的盒子 —— 配套 CSS 用
  // :has(...) 在菜单打开时放开该容器裁剪（见 injectUiPatchCss）。
  // 0.1.2 菜单哈希类 ._7KE1Ra_menu→.ra1x4W_menu（已实核安装闭包），双锚并留。
  function initPopupRescue(): void {
    var MENU_SEL = '._7KE1Ra_menu, .ra1x4W_menu';
    var FLIP_CLS = 'dsh-popup-flip';
    var BAR_EDGE = 40;
    var probeTimer: number | null = null;
    // 翻转态按菜单元素保存（WeakSet，菜单卸载即回收）：翻转与否只在菜单开起来
    // 时判定一次。绝不能根据翻转后的 r.top 还原 —— 翻转让它 ≥40，还原又让它
    // <40，会形成每 200ms 翻转↔复原的震荡（弹层自带抽搐，且导致位置随机）。
    var flippedMenus = new WeakSet<HTMLElement>();

    function probeMenus(): void {
      probeTimer = null;
      var menus = document.querySelectorAll(MENU_SEL);
      var anyOpen = false;
      for (var i = 0; i < menus.length; i++) {
        var menu = menus[i] as HTMLElement;
        var r = menu.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue; // 未渲染/已关闭
        anyOpen = true;
        if (!flippedMenus.has(menu) && r.top < BAR_EDGE) flippedMenus.add(menu);
        if (flippedMenus.has(menu)) {
          var trigger = menu.parentElement as HTMLElement | null;
          var below = trigger ? window.innerHeight - trigger.getBoundingClientRect().bottom - 16 : 240;
          menu.classList.add(FLIP_CLS);
          // 下限 80（而非 120）：矮窗口下触发钮本身贴近视口底，过高的下限会让
          // 菜单底部挤出视口（实测 470px 高时 120 的底超出 12px）。
          menu.style.maxHeight = String(Math.max(80, Math.min(360, below))) + 'px';
        } else {
          menu.classList.remove(FLIP_CLS);
          menu.style.maxHeight = '';
        }
      }
      // 菜单存续期间低频轮询（内容加载会改变高度/位置）。
      if (anyOpen) probeTimer = window.setTimeout(probeMenus, 200);
    }

    function scheduleProbe(): void {
      // 每个变更批次都同步 querySelectorAll 全树扫描：对话流式输出期间 DOM
      // 变更风暴会把这条热路径烧起来。菜单开/关/挪位晚一帧探测无可感知
      // 差异 —— rAF 把同帧的整批变更合并成一次探测（与页面渲染同帧节流）。
      if (probeTimer === null) probeTimer = window.requestAnimationFrame(probeMenus);
    }

    function start(): void {
      if (!document.body) return;
      new MutationObserver(scheduleProbe).observe(document.body, { childList: true, subtree: true });
      window.addEventListener('resize', scheduleProbe, { passive: true });
      scheduleProbe();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  function injectChrome(): void {
    if (document.getElementById(BAR_ID)) return;
    injectUiPatchCss();
    var style = document.createElement('style');
    style.textContent = '\
#' + BAR_ID + '{position:fixed;top:0;left:0;right:0;height:' + BAR_HEIGHT + 'px;z-index:2147483000;\
  display:flex;align-items:center;justify-content:space-between;padding:0 6px 0 10px;\
  user-select:none;box-sizing:border-box;cursor:default;\
  font-family:var(--dsw-font-family,"Segoe UI","Microsoft YaHei",system-ui,sans-serif);\
  background:color-mix(in srgb,var(--dsw-alias-bg-base,#0b1220) 74%,transparent);\
  backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);\
  border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,rgba(255,255,255,.09)) 55%,transparent)}\
#' + BAR_ID + ' .dch-left{display:flex;align-items:center;gap:8px;min-width:0}\
#' + BAR_ID + ' .dch-icon{width:20px;height:20px;border-radius:6px;display:block;flex:none;\
  background:#f6f8fc;box-shadow:0 1px 3px rgba(0,0,0,.35)}\
#' + BAR_ID + ' .dch-title{font-size:12.5px;font-weight:600;letter-spacing:.2px;line-height:16px;\
  color:var(--dsw-alias-label-primary,#e6ecff);white-space:nowrap}\
#' + BAR_ID + ' .dch-badge{font-size:10px;line-height:14px;padding:1px 6px;border-radius:999px;\
  color:var(--dsw-alias-label-tertiary,#93a5d8);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));\
  white-space:nowrap;font-family:var(--ds-font-family-code,Consolas,monospace)}\
#' + BAR_ID + ' .dch-right{display:flex;align-items:center;gap:2px}\
#' + BAR_ID + ' .dch-btn{width:30px;height:28px;display:grid;place-items:center;border:none;border-radius:8px;\
  background:transparent;color:var(--dsw-alias-label-secondary,#b8c5ea);cursor:pointer;padding:0;outline:none;transition:background .12s,color .12s}\
#' + BAR_ID + ' .dch-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.09));\
  color:var(--dsw-alias-label-primary,#eef2ff)}\
#' + BAR_ID + ' .dch-btn:active{background:var(--dsw-alias-interactive-bg-hover-solid,rgba(255,255,255,.14))}\
#' + BAR_ID + ' .dch-close:hover{background:#e81123;color:#fff}';
    document.head.appendChild(style);

    // 声明自绘标题栏高度：内核据此把顶部固定元素下移（fixed 侧栏等）。
    document.documentElement.setAttribute('data-dsh-title-bar-height', String(BAR_HEIGHT));

    var layout = document.createElement('style');
    layout.textContent = 'body{box-sizing:border-box!important;padding-top:' + BAR_HEIGHT + 'px!important}' +
      // 壳自绘标题栏 z-index 极高（2147483000），内核弹层（模型下拉、对话框等）
      // 在视口顶部附近会被标题栏盖住。统一把常见弹层形态提到内容层之上
      // （5000，仍低于标题栏）。只提层级不动布局 —— 纯叠加修复。
      'html[data-dsh-title-bar-height] [role="dialog"]:not([aria-hidden="true"]),' +
      'html[data-dsh-title-bar-height] [data-floating-ui-portal],' +
      'html[data-dsh-title-bar-height] [data-radix-popper-content-wrapper]{z-index:5000!important}';
    document.head.appendChild(layout);

    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.innerHTML = '\
    <div class="dch-left">\
      <img class="dch-icon" alt="" draggable="false" />\
      <span class="dch-title">Deepseek Harness EAC</span>\
      <span class="dch-badge" hidden></span>\
    </div>\
    <div class="dch-right">\
      <button class="dch-btn" data-act="min" title="最小化" aria-label="最小化">' + GLYPHS.min + '</button>\
      <button class="dch-btn" data-act="max" title="最大化" aria-label="最大化">' + GLYPHS.max + '</button>\
      <button class="dch-btn dch-close" data-act="close" title="关闭" aria-label="关闭">' + GLYPHS.close + '</button>\
    </div>';
    document.body.appendChild(bar);

    var badge = bar.querySelector('.dch-badge') as HTMLElement | null;
    var icon = bar.querySelector('.dch-icon') as HTMLImageElement | null;
    maxBtn = bar.querySelector('[data-act="max"]') as HTMLElement | null;

    // 只 arm bar 一层：.dch-left 是 bar 子元素，mousedown 会冒泡到 bar；
    // 两层各自持有 lastClick 闭包会让左半栏双击 toggle 两次（净零）= 双击
    // 最大化失效 + 每次按下多发一次拖拽事件。
    armDrag(bar);
    var minBtn = bar.querySelector('[data-act="min"]');
    if (minBtn) minBtn.addEventListener('click', function () { dshDesktop.windowControls.minimize(); });
    if (maxBtn) maxBtn.addEventListener('click', function () { dshDesktop.windowControls.toggleMaximize(); });
    var closeBtn = bar.querySelector('.dch-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { dshDesktop.windowControls.close(); });

    // 标题栏信息（版本徽标 + 图标）：来源 boot.state —— 唯一的壳信息接口。
    // 首启重载（profile 初始化）下可能超时，失败后 logo 会停在白方块，
    // 故指数退避重试至拿到 iconDataUri。
    (function initInfo(attempt: number): void {
      dshDesktop.boot.state().then(function (info: any) {
        if (!info) return;
        state = Object.assign({}, state, info);
        if (info.appVersion) {
          if (badge) badge.textContent = 'v' + info.appVersion;
        }
        if (badge && info.agentVersion) {
          badge.title = 'agent v' + info.agentVersion + '（' + (info.agentSource || 'bundled') + '）';
          badge.hidden = false;
        }
        if (icon && info.iconDataUri) {
          icon.src = info.iconDataUri;
        } else if (attempt < 5) {
          window.setTimeout(function () { initInfo(attempt + 1); }, 1000 * attempt);
        }
      }).catch(function () {
        if (attempt < 5) window.setTimeout(function () { initInfo(attempt + 1); }, 1000 * attempt);
      });
    })(0);
    dshDesktop.windowControls.isMaximized().then(setMaximized).catch(function () { /* 壳层不可用时静默 */ });
    dshDesktop.windowControls.onMaximizeChange(setMaximized);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectChrome);
  } else {
    injectChrome();
  }

  // ---------------------------------------------------------------------------
  // 每 5s 上报页面视口（visibilitychange 回前台时立即补报）。
  // win.viewport-beat 由壳层本地拦截：WebView2 在窗口
  // 尺寸/DPI 变化事件被吞（副屏拔插、DPI 切换、启动期阻塞）时视口停留在
  // 旧尺寸 —— 窗口其余区域永不重绘（黑屏条带）、页面按旧窄视口布局，
  // 用户看到"侧边栏只剩一个图标+黑屏"的冻结画面。壳层比对该报文与窗口
  // 实际尺寸，超差即重申 webview bounds 自愈。
  // ---------------------------------------------------------------------------
  (function () {
    var beat = function () {
      try {
        send('win.viewport-beat', {
          w: window.innerWidth,
          h: window.innerHeight,
          dpr: window.devicePixelRatio || 1,
          src: 'main',
        });
      } catch (e) { /* 视口上报失败不致命 */ }
    };
    beat();
    setInterval(beat, 5000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') beat();
    });
  })();

  initPopupRescue();
})();
