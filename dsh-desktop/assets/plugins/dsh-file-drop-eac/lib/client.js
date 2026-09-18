// dsh-file-drop-eac — 拖入文件/文件夹到对话（Deepseek Harness EAC 特化版）
//
// 浏览器半边（classic-script bundle，经 __ModuleLoader__.load 注册）：
//   · 仅对话输入框区域 dragover/drop 拦截（阻止浏览器直接打开文件）；
//   · 普通文件 → 输入框上方显示文件卡片；桌面端保存临时副本后只注入紧凑
//     路径引用，让 agent 用文件工具直接读取；
//   · 文本/代码文件卡片可查看摘要；保存路径失败时才回退到内容注入；
//   · 图片 → 完全不接管（区别于已弃用的 dsh-file-drop）：不注入任何内容，
//     交给视觉桥 / 原生缩略图处理，避免重复注入冲突；
//   · 文件夹 → 新增接管：识别拖入的是文件夹并给出可操作降级提示。
//     浏览器/Electron 出于安全限制无法把文件夹的磁盘绝对路径交给页面
//     （webUtils.getPathForFile 只接受 File，文件夹是 webkitGetAsEntry()
//     返回的目录条目，仅有虚拟路径），故提示用户改用文件/项目目录方式。
//   · 当前输入框为 Lexical contenteditable，通过 conversation.input.overlay
//     获取 inputActions.setDraft，避免直接修改编辑器 DOM。
//
// 纯逻辑挂在 window.__dshFileDropEacCore 上（生产无副作用），供 node 测试
// 套件直接评估本文件验证 —— 官方模块加载器只支持 classic script，不能 import。
(function () {
  'use strict';

  // ───────────────────────── 纯逻辑（可测） ─────────────────────────
  var TEXT_MAX_BYTES = 256 * 1024;
  var SNIFF_BYTES = 8192;
  var PREVIEW_MAX_CHARS = 16 * 1024;
  var SAVE_MAX_BYTES = 64 * 1024 * 1024;
  var reactRuntime = null;
  var reactDomRuntime = null;
  var primitivesRuntime = null;
  var sessionInputs = new Map();
  var sessionFiles = new Map();
  var currentSessionId = null;
  var fileSequence = 0;

  function usesEnglishUi() {
    return typeof document !== 'undefined' && String(document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;
  }

  var TEXT_EXT = new Set([
    '.txt', '.md', '.markdown', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
    '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
    '.py', '.rb', '.go', '.rs', '.java', '.c', '.h', '.cpp', '.hpp', '.cs',
    '.php', '.sh', '.bat', '.ps1', '.html', '.htm', '.css', '.scss',
    '.less', '.xml', '.csv', '.tsv', '.log', '.env', '.gitignore', '.npmrc',
    '.lock', '.sum', '.properties', '.editorconfig', '.vue', '.svelte',
  ]);
  var IMAGE_EXT = new Set([
    '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.avif', '.ico', '.tiff',
  ]);

  function extOf(name) {
    var dot = String(name || '').lastIndexOf('.');
    if (dot <= 0) return '';
    return String(name).slice(dot).toLowerCase();
  }

  /**
   * 文件分类：text（内容注入）/ image（本插件不接管，标记跳过分发给
   * 视觉桥）/ binary（路径提示）。
   */
  function classifyFile(name, size) {
    var ext = extOf(name);
    if (IMAGE_EXT.has(ext)) return { kind: 'image', reason: 'image' };
    if (TEXT_EXT.has(ext) || ext === '') return { kind: 'text', reason: ext === '' ? 'extensionless' : 'text' };
    return { kind: 'binary', reason: 'binary' };
  }

  /** 头部 NUL 字节嗅探：文本里出现 \0 视为二进制。 */
  function looksBinary(content) {
    var head = String(content || '').slice(0, SNIFF_BYTES);
    return head.indexOf('\u0000') !== -1;
  }

  function formatSize(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * 构造要注入输入框的文本。
   * 内容在 TEXT_MAX_BYTES 内 → { kind: 'text', text }；
   * 超过 → { kind: 'path-hint', text }（有 path 时给完整路径让 agent 读文件）。
   */
  function buildTextInsertion(_a) {
    var name = _a.name, content = _a.content, path = _a.path, size = _a.size;
    var text = String(content || '');
    if (text.length > TEXT_MAX_BYTES || looksBinary(text)) {
      return { kind: 'path-hint', text: buildPathHint({ name: name, path: path, size: size != null ? size : text.length }) };
    }
    return {
      kind: 'text',
      text: (usesEnglishUi() ? '<!-- Dropped file: ' : '<!-- 拖入文件：') + name + ' -->\n' + text,
    };
  }

  /** 二进制 / 超大文件的路径提示（agent 按路径读取）。 */
  function buildPathHint(_a) {
    var name = _a.name, path = _a.path, size = _a.size;
    var label = name || '（未命名文件）';
    var english = usesEnglishUi();
    if (english && !name) label = '(unnamed file)';
    var sizeText = size != null ? (english ? ', size ' : '，大小 ') + formatSize(size) : '';
    if (path) {
      return english
        ? '[Dropped file: ' + label + sizeText + ']\nFull path: ' + path + '\nRead this file before continuing.'
        : '[拖入文件：' + label + sizeText + ']\n完整路径：' + path + '\n请读取该文件内容后继续处理。';
    }
    return english
      ? '[Dropped file: ' + label + sizeText + ']\n(The full path is unavailable. Read it from the Files tab or project directory.)'
      : '[拖入文件：' + label + sizeText + ']\n（无法获取完整路径，请通过文件标签页或项目目录读取该文件。）';
  }

  /** 文件卡片对应的紧凑 draft 引用，不把完整文本铺进 Lexical 输入框。 */
  function buildFileReference(_a) {
    var name = _a.name, path = _a.path, size = _a.size;
    var english = usesEnglishUi();
    var label = name || (english ? '(unnamed file)' : '（未命名文件）');
    var sizeText = size != null ? ' · ' + formatSize(size) : '';
    if (path) {
      return english
        ? '[File: ' + label + sizeText + ']\nPath: ' + path + '\nRead this file before continuing.'
        : '[文件：' + label + sizeText + ']\n路径：' + path + '\n请读取该文件后继续处理。';
    }
    return english
      ? '[File: ' + label + sizeText + ']\nThe local path is unavailable. Read it from the Files tab or project directory.'
      : '[文件：' + label + sizeText + ']\n无法获取本地路径，请通过文件标签页或项目目录读取。';
  }

  /** 文件夹降级提示：浏览器/Electron 拿不到磁盘绝对路径，给出替代方案。 */
  function buildFolderHint(folders) {
    var english = usesEnglishUi();
    var list = (folders || []).map(function (f) {
      var v = f && f.virtualPath && f.virtualPath !== '/' ? (english ? ' (' + f.virtualPath + ')' : '（' + f.virtualPath + '）') : '';
      return '  · ' + (f && f.name || (english ? '(unnamed directory)' : '（未命名目录）')) + v;
    }).join('\n');
    if (english) return [
      '[Dropped folders: ' + (folders ? folders.length : 0) + ']', list, '',
      'Browser security prevents this page from reading absolute folder paths or passing an entire directory to the model.',
      'Use either option:',
      '  · Open the directory from the Files / Project directory tab so the agent can read its files;',
      '  · Drop the relevant files into the composer individually.', ''
    ].join('\n');
    return [
      '[拖入文件夹：' + (folders ? folders.length : 0) + ' 个]',
      list,
      '',
      '说明：网页 / Electron 出于安全限制，无法读取文件夹的磁盘绝对路径，不能把整个目录直接交给模型。',
      '请改用以下任一方式：',
      '  · 在「文件 / 项目目录」标签打开该目录，让 agent 读取其中的文件；',
      '  · 把关键文件逐一拖入本输入框。',
      ''
    ].join('\n');
  }

  /** Electron 里取拖入文件的完整路径（webUtils.getPathForFile 经 preload 暴露）。 */
  function filePathOf(file) {
    try {
      if (file && window.dshDesktop && typeof window.dshDesktop.getPathForFile === 'function') {
        var p = window.dshDesktop.getPathForFile(file);
        return typeof p === 'string' && p ? p : '';
      }
    } catch (_e) { /* 浏览器环境无此能力 */ }
    return '';
  }

  /**
   * 解析 DataTransferItem 列表：目录项进 folders，其余取 File 进 files。
   * 标准接口为 getAsEntry()，Chromium/Electron 用 webkitGetAsEntry() 前缀，
   * 两者兼容。目录项只有虚拟路径（entry.name / entry.fullPath），无绝对路径。
   */
  function collectEntries(items) {
    var out = { files: [], folders: [] };
    if (!items) return out;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      var entry = null;
      if (typeof it.webkitGetAsEntry === 'function') entry = it.webkitGetAsEntry();
      else if (typeof it.getAsEntry === 'function') entry = it.getAsEntry();
      if (entry && entry.isDirectory) {
        out.folders.push({ name: entry.name || '', virtualPath: entry.fullPath || '' });
        continue;
      }
      if (typeof it.getAsFile === 'function') {
        var f = it.getAsFile();
        if (f) out.files.push(f);
      }
    }
    return out;
  }

  /**
   * 把拖入内容编排成执行计划（纯逻辑，可测）：
   *   folders  → 需要弹出文件夹降级提示的目录列表；
   *   texts    → 内容注入列表（文本/代码）；
   *   hints    → 路径提示列表（二进制/超大）；
   *   skipped  → 图片列表（本插件不接管，交给视觉桥）。
   */
  function planDrop(files, folders) {
    var plan = { folders: (folders || []).slice(), texts: [], hints: [], skipped: [] };
    if (!files) return plan;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f) continue;
      var name = f.name || '';
      var size = f.size || 0;
      var path = filePathOf(f);
      var cls = classifyFile(name, size);
      if (cls.kind === 'image') { plan.skipped.push(name); continue; }
      var rec = { file: f, name: name, size: size, path: path };
      if (cls.kind === 'text') plan.texts.push(rec);
      else plan.hints.push(rec);
    }
    return plan;
  }

  /** 只识别当前对话输入框；旧版 textarea 仅在会话容器内作为兼容兜底。 */
  function composerInputOf(target) {
    if (!target || typeof target.closest !== 'function') return null;
    try {
      var lexical = target.closest('[data-composer-input="true"]');
      if (lexical) return lexical;
      var textarea = target.closest('textarea');
      if (textarea && typeof textarea.closest === 'function' && textarea.closest('[data-slot="conversation.session"]')) {
        return textarea;
      }
    } catch (_e) { /* 非 Element 事件目标 */ }
    return null;
  }

  /** 在旧 draft 后追加完整文本块，确保各块之间和末尾都有换行。 */
  function appendDraft(current, text) {
    var base = String(current || '');
    var block = String(text || '');
    if (!block) return base;
    if (base && !base.endsWith('\n')) base += '\n';
    var next = base + block;
    if (!next.endsWith('\n')) next += '\n';
    return next;
  }

  /** 从 draft 中精确移除一个由本插件插入的文件引用。 */
  function removeInsertedBlock(current, text) {
    var draft = String(current || '');
    var block = String(text || '');
    if (!block) return draft;
    if (!block.endsWith('\n')) block += '\n';
    var index = draft.indexOf(block);
    if (index < 0) return draft;
    return draft.slice(0, index) + draft.slice(index + block.length);
  }

  function appendToSessionDraft(sessionId, text) {
    var captured = sessionId ? sessionInputs.get(sessionId) : null;
    if (!captured || !captured.inputActions || typeof captured.inputActions.setDraft !== 'function') return false;
    var previous = captured.draft;
    var next = appendDraft(previous, text);
    if (next === previous) return false;
    captured.draft = next;
    try {
      captured.inputActions.setDraft(next);
      return true;
    } catch (_e) {
      captured.draft = previous;
      return false;
    }
  }

  /** 通过当前会话的官方 input API 更新 Lexical draft。 */
  function appendToCurrentDraft(text) {
    return appendToSessionDraft(currentSessionId, text);
  }

  function transferLooksImageOnly(dataTransfer) {
    if (!dataTransfer || !hasFiles(dataTransfer.types)) return false;
    var candidates = [];
    var items = dataTransfer.items;
    if (items) {
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item && (!item.kind || item.kind === 'file')) candidates.push(item);
      }
    }
    if (candidates.length === 0 && dataTransfer.files) {
      candidates = Array.prototype.slice.call(dataTransfer.files);
    }
    if (candidates.length === 0) return false;
    for (var j = 0; j < candidates.length; j++) {
      var candidate = candidates[j];
      var type = String(candidate && candidate.type || '').toLowerCase();
      if (type.indexOf('image/') === 0) continue;
      if (candidate && candidate.name && classifyFile(candidate.name, candidate.size || 0).kind === 'image') continue;
      return false;
    }
    return true;
  }

  // 暴露纯逻辑供测试；生产无副作用。
  if (typeof window !== 'undefined') {
    window.__dshFileDropEacCore = {
      TEXT_MAX_BYTES: TEXT_MAX_BYTES,
      SNIFF_BYTES: SNIFF_BYTES,
      TEXT_EXT: TEXT_EXT,
      IMAGE_EXT: IMAGE_EXT,
      classifyFile: classifyFile,
      looksBinary: looksBinary,
      formatSize: formatSize,
      buildTextInsertion: buildTextInsertion,
      buildPathHint: buildPathHint,
      buildFileReference: buildFileReference,
      buildFolderHint: buildFolderHint,
      filePathOf: filePathOf,
      collectEntries: collectEntries,
      planDrop: planDrop,
      composerInputOf: composerInputOf,
      appendDraft: appendDraft,
      removeInsertedBlock: removeInsertedBlock,
      appendToCurrentDraft: appendToCurrentDraft,
      transferLooksImageOnly: transferLooksImageOnly,
    };
  }

  // ───────────────────────── DOM 粘合 ─────────────────────────

  function sessionRecords(sessionId) {
    return sessionId && sessionFiles.get(sessionId) || [];
  }

  function publishSessionRecords(sessionId, records) {
    if (!sessionId) return;
    sessionFiles.set(sessionId, records);
    var captured = sessionInputs.get(sessionId);
    if (captured && typeof captured.refreshFiles === 'function') {
      captured.refreshFiles(function (value) { return value + 1; });
    }
  }

  function updateFileRecord(sessionId, id, patch) {
    var records = sessionRecords(sessionId);
    var found = false;
    var next = records.map(function (record) {
      if (record.id !== id) return record;
      found = true;
      return Object.assign({}, record, patch);
    });
    if (found) publishSessionRecords(sessionId, next);
    return found;
  }

  function removeFileRecord(sessionId, id) {
    var records = sessionRecords(sessionId);
    var record = records.find(function (candidate) { return candidate.id === id; });
    if (!record) return false;
    record.removed = true;
    publishSessionRecords(sessionId, records.filter(function (candidate) { return candidate.id !== id; }));
    if (record.insertionText) {
      var captured = sessionInputs.get(sessionId);
      if (captured && captured.inputActions && typeof captured.inputActions.setDraft === 'function') {
        var nextDraft = removeInsertedBlock(captured.draft, record.insertionText);
        if (nextDraft !== captured.draft) {
          captured.draft = nextDraft;
          captured.inputActions.setDraft(nextDraft);
        }
      }
    }
    return true;
  }

  function clearSessionRecords(sessionId) {
    var records = sessionRecords(sessionId);
    records.forEach(function (record) { record.removed = true; });
    publishSessionRecords(sessionId, []);
  }

  function ensureStyles() {
    if (typeof document === 'undefined' || !document.head || typeof document.createElement !== 'function') return function () {};
    var id = 'dsh-file-drop-eac-styles';
    if (document.getElementById && document.getElementById(id)) return function () {};
    var style = document.createElement('style');
    style.id = id;
    style.textContent = [
      '[data-composer-card]:has([data-dsh-file-preview-rail]){padding-top:74px!important}',
      '[data-dsh-file-preview-rail]{position:absolute;left:12px;right:12px;top:10px;height:54px;display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;pointer-events:auto;scrollbar-width:thin}',
      '[data-dsh-file-preview-item]{box-sizing:border-box;width:220px;min-width:220px;height:52px;display:flex;align-items:center;gap:9px;padding:7px 8px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin);border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer}',
      '[data-dsh-file-preview-item]:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}',
      '[data-dsh-file-preview-icon]{width:32px;height:32px;display:grid;place-items:center;flex:none;border-radius:6px;background:var(--dsw-specific-selector);color:var(--dsw-alias-state-business-primary)}',
      '[data-dsh-file-preview-copy]{min-width:0;flex:1}',
      '[data-dsh-file-preview-name]{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;line-height:17px}',
      '[data-dsh-file-preview-meta]{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}',
      '[data-dsh-file-preview-remove]{width:24px;height:24px;display:grid;place-items:center;flex:none;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '[data-dsh-file-preview-remove]:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}',
      '[data-dsh-file-preview-modal]{position:fixed;inset:0;z-index:2147483001;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.52)}',
      '[data-dsh-file-preview-dialog]{width:min(760px,calc(100vw - 48px));max-height:min(720px,calc(100vh - 48px));display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l2-darkmode-thin);border-radius:8px;background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-shadow-lv4);color:var(--dsw-alias-label-primary)}',
      '[data-dsh-file-preview-header]{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l2)}',
      '[data-dsh-file-preview-title]{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600}',
      '[data-dsh-file-preview-body]{margin:0;padding:14px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--dsw-alias-label-secondary)}'
    ].join('');
    document.head.appendChild(style);
    return function () {
      if (style && typeof style.remove === 'function') style.remove();
    };
  }

  function statusText(record) {
    var english = usesEnglishUi();
    if (record.status === 'loading') return english ? 'Preparing...' : '正在准备…';
    if (record.status === 'error') return english ? 'Path unavailable' : '路径不可用';
    return record.path ? (english ? 'Ready' : '已就绪') : (english ? 'Content attached' : '内容已附加');
  }

  function recordMeta(record) {
    if (record.kind === 'folder') {
      return (usesEnglishUi() ? 'Folder' : '文件夹') + ' · ' + statusText(record);
    }
    return formatSize(record.size) + ' · ' + statusText(record);
  }

  function previewText(record) {
    if (record.preview) return record.preview;
    if (record.kind === 'folder') return record.insertionText || '';
    return usesEnglishUi()
      ? 'This file type has no text preview.\n\n' + (record.path || 'The local path is unavailable.')
      : '此文件类型没有文本预览。\n\n' + (record.path || '无法获取本地路径。');
  }

  function FilePreviewRail(props) {
    var records = props.records;
    var selectedState = reactRuntime.useState(null);
    var selectedId = selectedState[0];
    var setSelectedId = selectedState[1];
    var selected = records.find(function (record) { return record.id === selectedId; }) || null;
    var IconPaperclip = primitivesRuntime && primitivesRuntime.IconPaperclipOutline16;
    var IconClose = primitivesRuntime && primitivesRuntime.IconCloseOutline16;
    var h = reactRuntime.createElement;
    var rail = h('div', {
      'data-dsh-file-preview-rail': 'true',
      role: 'list',
      'aria-label': usesEnglishUi() ? 'Pending files' : '待发送文件',
    }, records.map(function (record) {
      return h('div', {
        key: record.id,
        role: 'listitem',
        tabIndex: 0,
        'data-dsh-file-preview-item': 'true',
        title: record.name,
        onClick: function () { setSelectedId(record.id); },
        onKeyDown: function (event) {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          setSelectedId(record.id);
        },
      },
      h('span', { 'data-dsh-file-preview-icon': 'true' }, IconPaperclip ? h(IconPaperclip, { size: 16 }) : 'F'),
      h('span', { 'data-dsh-file-preview-copy': 'true' },
        h('span', { 'data-dsh-file-preview-name': 'true' }, record.name),
        h('span', { 'data-dsh-file-preview-meta': 'true' }, recordMeta(record))
      ),
      h('button', {
        type: 'button',
        'data-dsh-file-preview-remove': 'true',
        'aria-label': (usesEnglishUi() ? 'Remove file ' : '移除文件 ') + record.name,
        onClick: function (event) {
          event.stopPropagation();
          removeFileRecord(props.sessionId, record.id);
          if (selectedId === record.id) setSelectedId(null);
        },
      }, IconClose ? h(IconClose, { size: 14 }) : '×'));
    }));
    if (!selected || !reactDomRuntime || typeof reactDomRuntime.createPortal !== 'function' || typeof document === 'undefined' || !document.body) {
      return rail;
    }
    var modal = h('div', {
      'data-dsh-file-preview-modal': 'true',
      role: 'presentation',
      onMouseDown: function (event) {
        if (event.target === event.currentTarget) setSelectedId(null);
      },
    }, h('section', {
      'data-dsh-file-preview-dialog': 'true',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': selected.name,
    },
    h('header', { 'data-dsh-file-preview-header': 'true' },
      h('span', { 'data-dsh-file-preview-icon': 'true' }, IconPaperclip ? h(IconPaperclip, { size: 16 }) : 'F'),
      h('span', { 'data-dsh-file-preview-title': 'true' }, selected.name + ' · ' + formatSize(selected.size)),
      h('button', {
        type: 'button',
        'data-dsh-file-preview-remove': 'true',
        'aria-label': usesEnglishUi() ? 'Close preview' : '关闭预览',
        onClick: function () { setSelectedId(null); },
      }, IconClose ? h(IconClose, { size: 16 }) : '×')
    ),
    h('pre', { 'data-dsh-file-preview-body': 'true' }, previewText(selected))));
    return h(reactRuntime.Fragment, null, rail, reactDomRuntime.createPortal(modal, document.body));
  }

  /** input overlay occupant：镜像 input API，并渲染当前会话的文件预览卡片。 */
  function FileDropCapture(props) {
    var sessionId = props.sessionId;
    var inputActions = props.inputActions;
    var input = null;
    try {
      if (typeof props.useInput === 'function') {
        input = props.useInput(function (state) { return state || null; });
      }
    } catch (_e) { input = null; }
    var draft = input && typeof input.draft === 'string' ? input.draft : '';
    var refreshState = reactRuntime.useState(0);
    var refreshFiles = refreshState[1];
    var captureRef = reactRuntime.useRef(null);
    if (!captureRef.current) captureRef.current = { draft: draft, previousDraft: draft };
    var captured = captureRef.current;
    captured.inputActions = inputActions;
    captured.draft = draft;
    captured.refreshFiles = refreshFiles;

    reactRuntime.useEffect(function () {
      if (!sessionId) return;
      currentSessionId = sessionId;
      sessionInputs.set(sessionId, captured);
      return function () {
        if (currentSessionId === sessionId) currentSessionId = null;
        if (sessionInputs.get(sessionId) === captured) sessionInputs.delete(sessionId);
      };
    }, [sessionId, captured]);

    reactRuntime.useEffect(function () {
      if (!sessionId) return;
      if (captured.previousDraft && !draft && sessionRecords(sessionId).length) {
        clearSessionRecords(sessionId);
      }
      captured.previousDraft = draft;
    }, [sessionId, draft, captured]);

    var records = sessionRecords(sessionId);
    return sessionId && records.length
      ? reactRuntime.createElement(FilePreviewRail, { sessionId: sessionId, records: records })
      : null;
  }

  function readFile(file, mode) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('file read failed')); };
      if (mode === 'data-url') reader.readAsDataURL(file);
      else reader.readAsText(file);
    });
  }

  /** HTML5 拖拽拿不到磁盘路径时，经受控 fileDrop.save 保存临时副本。 */
  function saveDroppedFile(rec) {
    if (rec.path) return Promise.resolve(rec.path);
    var b = typeof window !== 'undefined' && window.dshDesktop && window.dshDesktop.fileDrop;
    if (!b || typeof b.save !== 'function' || !rec.file || rec.size > SAVE_MAX_BYTES) {
      return Promise.resolve('');
    }
    return readFile(rec.file, 'data-url').then(function (dataUrl) {
      return b.save({ dataUrl: dataUrl, name: rec.name || '拖入文件' });
    }).then(function (res) {
      return res && res.ok && typeof res.path === 'string' ? res.path : '';
    }).catch(function () { return ''; });
  }

  function fileRecordIsActive(sessionId, id) {
    return sessionRecords(sessionId).some(function (record) { return record.id === id && !record.removed; });
  }

  function processFileRecord(sessionId, record, rec) {
    var textPromise = record.kind === 'text' && rec.size <= TEXT_MAX_BYTES
      ? readFile(rec.file, 'text').catch(function () { return ''; })
      : Promise.resolve('');
    Promise.all([saveDroppedFile(rec), textPromise]).then(function (values) {
      if (!fileRecordIsActive(sessionId, record.id)) return;
      var path = values[0];
      var content = values[1];
      var insertion;
      var status = 'ready';
      if (path) {
        insertion = buildFileReference({ name: rec.name, path: path, size: rec.size });
      } else if (record.kind === 'text' && content && !looksBinary(content)) {
        insertion = buildTextInsertion({ name: rec.name, content: content, path: '', size: rec.size }).text;
      } else {
        insertion = buildFileReference({ name: rec.name, path: '', size: rec.size });
        status = 'error';
      }
      if (!appendToSessionDraft(sessionId, insertion)) status = 'error';
      updateFileRecord(sessionId, record.id, {
        path: path,
        preview: content ? content.slice(0, PREVIEW_MAX_CHARS) : '',
        insertionText: insertion,
        status: status,
      });
    }).catch(function () {
      if (!fileRecordIsActive(sessionId, record.id)) return;
      var insertion = buildFileReference({ name: rec.name, path: '', size: rec.size });
      appendToSessionDraft(sessionId, insertion);
      updateFileRecord(sessionId, record.id, { insertionText: insertion, status: 'error' });
    });
  }

  /** 按计划执行：先显示文件卡片，再异步保存/预览并写入紧凑引用。 */
  function handlePlan(plan, sessionId) {
    if (!sessionId || !sessionInputs.has(sessionId)) return;
    if (plan.folders && plan.folders.length) {
      plan.folders.forEach(function (folder) {
        var insertion = buildFolderHint([folder]);
        var record = {
          id: 'folder-' + (++fileSequence),
          name: folder.name || (usesEnglishUi() ? '(unnamed directory)' : '（未命名目录）'),
          size: 0,
          kind: 'folder',
          status: 'ready',
          path: '',
          preview: insertion,
          insertionText: insertion,
        };
        publishSessionRecords(sessionId, sessionRecords(sessionId).concat(record));
        appendToSessionDraft(sessionId, insertion);
      });
    }
    plan.texts.concat(plan.hints).forEach(function (rec) {
      var record = {
        id: 'file-' + (++fileSequence),
        name: rec.name || (usesEnglishUi() ? '(unnamed file)' : '（未命名文件）'),
        size: rec.size || 0,
        kind: plan.texts.indexOf(rec) >= 0 ? 'text' : 'binary',
        status: 'loading',
        path: rec.path || '',
        preview: '',
        insertionText: '',
      };
      publishSessionRecords(sessionId, sessionRecords(sessionId).concat(record));
      processFileRecord(sessionId, record, rec);
    });
  }

  function hasFiles(types) {
    if (!types) return false;
    for (var i = 0; i < types.length; i++) {
      if (types[i] === 'Files') return true;
    }
    return false;
  }

  var dropIndicator = null;
  var activeDropInput = null;
  var ownsFileDrag = false;

  function clearDropIndicator() {
    activeDropInput = null;
    if (dropIndicator && typeof dropIndicator.remove === 'function') dropIndicator.remove();
    dropIndicator = null;
  }

  function stopOtherFileHandlers(event) {
    if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  }

  function resetOfficialDropOverlay() {
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('dragend'));
      }
    } catch (_e) { /* 仅用于清除官方图片拖放深度状态 */ }
  }

  function redispatchImages(input, files) {
    if (!input || !files || files.length === 0 || typeof DataTransfer !== 'function' || typeof DragEvent !== 'function') return false;
    try {
      var transfer = new DataTransfer();
      if (!transfer.items || typeof transfer.items.add !== 'function') return false;
      files.forEach(function (file) { transfer.items.add(file); });
      input.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function showDropIndicator(input) {
    if (!input || typeof input.getBoundingClientRect !== 'function' || typeof document === 'undefined' || !document.body) return;
    if (!dropIndicator) {
      dropIndicator = document.createElement('div');
      dropIndicator.setAttribute('data-dsh-file-drop-eac-indicator', 'true');
      dropIndicator.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'z-index:2147483000',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'box-sizing:border-box',
        'border:2px dashed #3b82f6',
        'background:rgba(59,130,246,.12)',
        'color:#1d4ed8',
        'font:600 13px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'border-radius:8px',
      ].join(';');
      dropIndicator.textContent = usesEnglishUi() ? 'Drop to add files' : '释放以添加文件';
      document.body.appendChild(dropIndicator);
    }
    activeDropInput = input;
    var rect = input.getBoundingClientRect();
    dropIndicator.style.left = Math.round(rect.left) + 'px';
    dropIndicator.style.top = Math.round(rect.top) + 'px';
    dropIndicator.style.width = Math.max(0, Math.round(rect.width)) + 'px';
    dropIndicator.style.height = Math.max(0, Math.round(rect.height)) + 'px';
  }

  function attachDropHandlers() {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return function () {};

    function onDragEnterOrOver(e) {
      var transfer = e.dataTransfer;
      if (!transfer || !hasFiles(transfer.types)) return;
      if (transferLooksImageOnly(transfer)) {
        if (ownsFileDrag) {
          ownsFileDrag = false;
          clearDropIndicator();
        }
        return;
      }
      ownsFileDrag = true;
      stopOtherFileHandlers(e);
      var input = composerInputOf(e.target);
      if (!input) {
        clearDropIndicator();
        return;
      }
      e.preventDefault();
      transfer.dropEffect = 'copy';
      showDropIndicator(input);
    }

    function onDragLeave(e) {
      if (!ownsFileDrag) return;
      stopOtherFileHandlers(e);
      if (!activeDropInput) return;
      var related = e.relatedTarget;
      if (related && typeof activeDropInput.contains === 'function' && activeDropInput.contains(related)) return;
      if (e.target && typeof activeDropInput.contains === 'function' && !activeDropInput.contains(e.target)) return;
      clearDropIndicator();
    }

    function onDrop(e) {
      var dt = e.dataTransfer;
      if (!dt || !hasFiles(dt.types)) return;
      var collected = collectEntries(dt.items);
      var files = collected.files;
      var folders = collected.folders;
      // 兜底：个别实现 items 解析不到时回退 dt.files。
      if (files.length === 0 && folders.length === 0 && dt.files && dt.files.length) {
        files = Array.prototype.slice.call(dt.files);
      }
      var plan = planDrop(files, folders);
      var handledCount = plan.folders.length + plan.texts.length + plan.hints.length;
      var imageFiles = files.filter(function (file) {
        return classifyFile(file && file.name, file && file.size).kind === 'image';
      });
      var shouldOwn = ownsFileDrag || handledCount > 0;
      if (!shouldOwn) return;
      ownsFileDrag = false;
      stopOtherFileHandlers(e);
      clearDropIndicator();
      resetOfficialDropOverlay();
      var input = composerInputOf(e.target);
      if (!input) return;
      e.preventDefault();
      if (handledCount > 0) handlePlan(plan, currentSessionId);
      if (imageFiles.length > 0) redispatchImages(input, imageFiles);
    }

    function onWindowBlur() {
      ownsFileDrag = false;
      clearDropIndicator();
      resetOfficialDropOverlay();
    }

    document.addEventListener('dragenter', onDragEnterOrOver, true);
    document.addEventListener('dragover', onDragEnterOrOver, true);
    document.addEventListener('dragleave', onDragLeave, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('dragend', clearDropIndicator, true);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('blur', onWindowBlur);
    }
    return function () {
      document.removeEventListener('dragenter', onDragEnterOrOver, true);
      document.removeEventListener('dragover', onDragEnterOrOver, true);
      document.removeEventListener('dragleave', onDragLeave, true);
      document.removeEventListener('drop', onDrop, true);
      document.removeEventListener('dragend', clearDropIndicator, true);
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('blur', onWindowBlur);
      }
      ownsFileDrag = false;
      sessionFiles.clear();
      clearDropIndicator();
    };
  }

  // ───────────────────────── 注册 ─────────────────────────
  window.__ModuleLoader__.load({
    id: 'dsh-file-drop-eac',
    factory: function (require) {
      reactRuntime = require('react');
      reactDomRuntime = require('react-dom');
      primitivesRuntime = require('@deepseek-ai/dsh-client-ui-primitives');
      var inject = ['slots'];
      function apply(ctx) {
        ctx.effect(ensureStyles, 'dsh-file-drop-eac: file preview styles');
        ctx.effect(attachDropHandlers, 'dsh-file-drop-eac: composer drop handlers');
        ctx.slots.inject('conversation.input.overlay', function () {
          return ctx.slots.register(
            { name: 'conversation.input.overlay', id: 'file-drop-eac-capture', order: 93 },
            FileDropCapture
          );
        });
      }
      var module = { exports: {} };
      module.exports = { inject: inject, apply: apply };
      return module.exports;
    },
  });
})();
