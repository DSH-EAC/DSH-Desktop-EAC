/**
 * assets/ws-jsonrpc-client.js — 桌面窗 ↔ sidecar 的 WS JSON-RPC 回环客户端（单源）。
 *
 * 架构：由壳层在主窗口 initialization_script 中先注入本文件，再注入桥胶水；
 * 桥胶水经 window.__DSH_WS_RPC__ 取回客户端实例（见 tauri-shell/src/main.rs
 * 的 BRIDGE_INIT_JS）。
 *
 * 用法：window.__DSH_WS_RPC__({ timeoutMs, onOpen }) → { send, call, onNotify }
 *   - 在 DOMContentLoaded 自动 connect 并 1500ms 退避重连；
 *   - send：fire-and-forget（ipcRenderer.send 语义），未就绪即丢弃；
 *   - call：Promise + 超时（缺省 30s，可经 options.timeoutMs 覆盖），未就绪排队；
 *   - onNotify：注册无 id 通知帧回调（如 win.maximized / dsh.balance / boot.web-ready）。
 *   - onOpen：连接建立且队列排空后回调（桥在此做 chrome.init 握手）。
 */
'use strict';
(function () {
  function createWsJsonRpc(options) {
    options = options || {};
    var WS_URL = (typeof window !== 'undefined' && window.__DSH_BRIDGE_WS__) || 'ws://127.0.0.1:19873/ws';
    var timeoutMs = options.timeoutMs || 30000;
    var seq = 0;
    var pending = {};
    var ws = null;
    var wsReady = false;
    var queue = [];
    var notifyHooks = [];

    function rawSend(obj) {
      try { if (ws) ws.send(JSON.stringify(obj)); } catch (e) { /* 断线由重连兜底 */ }
    }

    function send(method, params) {
      if (wsReady) rawSend({ jsonrpc: '2.0', method: method, params: params || {} });
    }

    function settle(id, ok, value) {
      var r = pending[id];
      if (!r) return;
      delete pending[id];
      if (r.timer) clearTimeout(r.timer);
      if (ok) r.resolve(value);
      else r.reject(value);
    }

    function call(method, params, t) {
      return new Promise(function (resolve, reject) {
        var id = ++seq;
        var entry = { resolve: resolve, reject: reject, timer: null, sent: false };
        pending[id] = entry;
        if (!wsReady) queue.push({ jsonrpc: '2.0', id: id, method: method, params: params || {} });
        else { entry.sent = true; rawSend({ jsonrpc: '2.0', id: id, method: method, params: params || {} }); }
        // 超时定时器在请求 settle（响应/断线回绝）时清掉：旧实现任由它到点
        // 空跑，长会话累积大量无用定时器。
        entry.timer = setTimeout(function () {
          if (pending[id]) {
            delete pending[id];
            reject(new Error('bridge call timeout: ' + method));
          }
        }, t || timeoutMs);
      });
    }

    function connect() {
      ws = new WebSocket(WS_URL);
      ws.onopen = function () {
        wsReady = true;
        while (queue.length) {
          var frame = queue.shift();
          // 补发即视为已发出：此后断线同样走「在途回绝」路径。
          var pe = pending[frame.id];
          if (pe) pe.sent = true;
          rawSend(frame);
        }
        try { if (options.onOpen) options.onOpen(); } catch (e) { /* 回调异常不断桥 */ }
      };
      ws.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.id != null && pending[msg.id]) {
          if (msg.error) settle(msg.id, false, new Error(msg.error.message || 'rpc error'));
          else settle(msg.id, true, msg.result);
        } else if (msg.method) {
          // 通知帧：win.maximized / dsh.balance / boot.web-ready …
          try {
            for (var i = 0; i < notifyHooks.length; i++) notifyHooks[i](msg.method, msg.params);
          } catch (e) { /* 回调异常不断桥 */ }
        }
      };
      ws.onclose = function () {
        wsReady = false;
        // 回绝所有【已发出】的在途请求：sidecar 重启/崩溃期间旧实现让它们
        // 干等到 30-60s 超时，恢复/自愈流程动辄卡半分钟。排队区（未发出）
        // 的请求保留 —— 重连后 onopen 会补发。
        for (var id in pending) {
          if (Object.prototype.hasOwnProperty.call(pending, id) && pending[id].sent) {
            settle(Number(id), false, new Error('bridge disconnected'));
          }
        }
        setTimeout(connect, 1500);
      };
      ws.onerror = function () { try { if (ws) ws.close(); } catch (e) { /* 重连由 onclose 驱动 */ } };
    }

    function onNotify(fn) { notifyHooks.push(fn); }

    if (typeof window !== 'undefined') {
      window.addEventListener('DOMContentLoaded', function () { connect(); });
    }
    return { send: send, call: call, onNotify: onNotify };
  }

  if (typeof window !== 'undefined') {
    window.__DSH_WS_RPC__ = function (options) { return createWsJsonRpc(options); };
  }
})();