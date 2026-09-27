/**
 * Our Free Model — browser half.
 *
 * Contributes three things to the web shell:
 *   1. a settings section (`settings.section` id `our-free-model`) holding the
 *      model roster with live availability, the usage dashboard, the OpenAI
 *      forward listener and the plugin's own switches;
 *   2. a first-run announcement (`settings.onboarding`) that is versioned, so
 *      bumping the copy re-announces once and never nags again;
 *   3. nothing else — no shadowing of the stock model picker, whose grouping by
 *      provider route is exactly the mechanism this plugin uses for its tag.
 *
 * Data is read over the plugin's own same-origin `/api/our-free-model/*` routes
 * rather than a typed Remote binding, because those routes are served by the same
 * host process on every kernel line this plugin targets.
 *
 * Hand-written ModuleLoader bundle: no build step, no dependency beyond the
 * `react` the shell already provides. All colour comes from theme variables so
 * the page survives a scheme switch.
 */
window.__ModuleLoader__.load({
  id: 'dsh-our-free-model',
  factory: require => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { createElement: h, Fragment, useState, useEffect, useMemo, useRef, useCallback } = React

    const NS = 'settings.ourFreeModel'
    const inject = ['slots', 'locale']

    // ── copy ──────────────────────────────────────────────────────────────────
    const DICT = {
      zh: {
        'meta.title': 'Our Free Model',
        'meta.description': '在 DeepSeek Harness 内直连免密免费模型：清单随上游更新、地区可用性自动探测、思考强度真实生效，并附 Token 看板与 OpenAI 兼容转发端口。',
        'ann.pitch': '你只需在 dsh 里装上这个插件，无需登录、注册、填 API Key 或任何其它操作，就能用上包括 Muse Spark 1.3、MiMo V2.6 在内的前沿模型——完全免费，不限量。',
        nav: 'Our Free Model',
        title: 'Our Free Model',
        subtitle: '免密免费模型 · 实时可用性',
        refresh: '刷新清单',
        reprobe: '重新探测可用性',
        probing: '探测中…',
        loading: '正在读取本地数据…',
        loadFailed: '无法连接插件后端',
        retry: '重试',
        'state.available': '可用',
        'state.region-blocked': '地区受限',
        'state.unavailable': '暂不可用',
        'state.throttled': '已达限额',
        'state.unknown': '未探测',
        'hint.region': '该模型按出口地区放行。开启网络代理后，插件会在下一次探测自动把它移入可用分组。',
        'hint.unknown': '尚未探测，默认保持可达。',
        'hint.hidden': '探测显示网关点名了它却不路由它，因此已从模型选择器中移除；某一次探测重新通过，它会自己回来。',
        'hint.sharedBudget': '该模型思考不可关闭：思考与可见回答共用同一份额度，档位越低留给正文的越少。',
        'group.notAdvertised': '不在选择器中',
        'tag.vision': '视觉',
        'tag.text': '纯文本',
        'tag.thinking': '可调思考',
        'tag.thinkingShared': '思考不可关',
        'tag.rung': '默认档上限',
        'tag.rungTitle': '各档位实际发出的输出上限：{ladder}。档位是思考与回答共用的额度，且不会超过上面的最长输出与设置里的单次上限。',
        'tag.context': '上下文',
        'tag.output': '最长输出',
        'tag.latency': '首字',
        'section.models': '模型清单',
        'section.modelsHint': '名称与能力来自上游清单与公开能力表，可用性由本机出口实测得出。',
        'section.dash': '用量看板',
        'section.dashHint': '数据只写入本机，不会上传。',
        'section.forward': '本地转发（OpenAI 兼容）',
        'section.forwardHint': '让其它本地工具用一个 base URL 调用这些模型。',
        'section.prefs': '插件设置',
        'section.prefsHint': '改动在下一次加载完全生效。',
        'heat.title': 'Token 热力图',
        'heat.legend': '少',
        'heat.legendMore': '多',
        'heat.empty': '还没有用量记录。用一次对话后回来看看。',
        'curve.title': '总量曲线',
        'curve.tokens': 'Token',
        'curve.requests': '请求数',
        'curve.total': '总计',
        'stat.output': '输出 Token',
        'stat.reasoning': '推理 Token',
        'col.reason': '推理',
        'col.output': '输出',
        'speed.title': '速度',
        'speed.tps': '输出速度',
        'speed.ttft': '首帧延迟',
        'speed.model': '模型',
        'speed.calls': '调用',
        'speed.failed': '失败',
        'speed.none': '暂无样本',
        'speed.note': '输出速度只统计 {n}/{total} 次可测的调用：那些没流式送出的思考 token 不计入分子，解码窗口短到测不出的也不算。',
        'unit.tokPerSec': 'tok/s',
        'unit.ms': 'ms',
        'forward.enabled': '启用转发端口',
        'forward.host': '监听地址',
        'forward.port': '端口',
        'forward.apply': '应用',
        'settings.failed': '设置未保存',
        'forward.running': '正在监听',
        'forward.stopped': '未启用',
        'forward.baseUrl': 'Base URL',
        'forward.key': 'API Key',
        'forward.show': '显示',
        'forward.hide': '隐藏',
        'forward.rotate': '重新生成',
        'forward.rotateWarn': '重新生成后，所有使用旧 Key 的工具都会失效。',
        'forward.copy': '复制',
        'forward.copied': '已复制',
        'forward.example': '调用示例',
        'forward.error': '启动失败：{message}',
        'pref.enabled': '启用免费模型',
        'pref.exposeRegion': '展示地区受限模型',
        'pref.interval': '自动探测间隔（分钟）',
        'pref.maxTokens': '单次输出上限（token）',
        'pref.egress': '当前出口',
        'pref.probedAt': '最近探测',
        'bench.run': '测一次',
        'bench.running': '测量中…',
        'bench.result': '首帧 {ttft}ms · 输出 {tps} tok/s · 推理 {reasoning} tok',
        'ann.preamble': '前言',
        'ann.models': '模型清单',
        'ann.steps': '使用步骤',
        'ann.features': '功能介绍',
        'ann.later': '稍后再说',
        'ann.page': '第 {n} / {total} 页',
        'ann.openSettings': '打开设置页',
        'ann.p1': '免密：安装即可用，不需要注册、不需要填任何 API Key。',
        'ann.p2': '清单跟随上游：模型集合、上下文长度与能力每次刷新都重新拉取。',
        'ann.p3': '诚实的能力声明：探测不出来的能力不会显示，思考强度档位是真实生效的输出预算上限。',
        'ann.s1': '在输入框的模型选择器里选 “Our Free Model” 分组下的任意模型。',
        'ann.s2': '需要更强推理时点开 Effort 档位；它是真实下发的输出预算，不是提示词。',
        'ann.s3': '想被其它本地工具调用：设置页 → 本地转发 → 启用，把 Base URL 和 Key 填进去。',
        'ann.s4': '地区受限模型会在你切换网络出口后自动重新归类，无需手动操作。',
        'ann.f1': '模型清单：可用性、上下文长度、是否支持视觉、是否可调思考。',
        'ann.f2': 'Token 热力图与总量曲线，支持总计与按模型分别查看。',
        'ann.f3': '输出速度（tok/s）与首字延迟（TTFT）逐次采样。',
        'ann.f4': 'OpenAI 兼容转发端口 + 可生成的 API Key。',
        'ann.f5': '全部数据留在本机，不上传任何遥测。',
        'ann.updates': '公告与升级',
        'ann.u1': '公告中心：仓库主人推送的新公告会实时到达，支持图文排版（HTML）。',
        'ann.u2': '系统通知：开启后，新公告与插件更新会弹出系统级通知。',
        'ann.u3': '应用内升级：新版本发布后可直接在设置页升级，无需重新安装。',
        'ann.u4': '热重载：升级与本插件的代码更新即时生效，不需要重启应用。',
        'section.news': '公告中心',
        'section.newsHint': '公告由仓库主人推送，本页实时接收。',
        'section.upgrade': '插件升级',
        'section.upgradeHint': '在应用内直接升级插件，无需重新安装或重启。',
        'news.unread': '{n} 条未读',
        'news.allRead': '全部已读',
        'news.markRead': '标记已读',
        'news.expand': '展开公告',
        'news.collapse': '收起公告',
        'news.refresh': '检查新公告',
        'news.refreshing': '检查中…',
        'news.empty': '暂无公告。仓库主人推送的新公告会出现在这里。',
        'news.emptyHint': '公告内容支持图文排版，由仓库主人在插件仓库中编辑发布。',
        'news.osEnable': '开启系统通知',
        'news.osOn': '系统通知已开启',
        'news.osOff': '系统通知未开启',
        'news.osDenied': '浏览器拒绝了通知权限；需要在系统/浏览器设置里手动恢复。',
        'news.link': '查看详情',
        'news.urgentTitle': '重要公告',
        'news.gotIt': '知道了',
        'news.lastFetch': '最近拉取',
        'news.fetchFailed': '公告源暂不可达（显示的是缓存）',
        'level.info': '通知',
        'level.update': '更新',
        'level.warn': '注意',
        'level.urgent': '紧急',
        'upgrade.current': '当前版本',
        'upgrade.latest': '最新版本',
        'upgrade.checkedAt': '上次检查',
        'upgrade.never': '从未检查',
        'upgrade.check': '检查更新',
        'upgrade.checking': '检查中…',
        'upgrade.upToDate': '已是最新版本',
        'upgrade.available': '可升级到 {version}',
        'upgrade.apply': '立即升级',
        'upgrade.applying': '升级中…',
        'upgrade.phase.download': '正在下载新版本…',
        'upgrade.phase.install': '正在安装文件…',
        'upgrade.phase.reload': '正在热重载…',
        'upgrade.done': '已升级到 {version}，插件已热重载生效。',
        'upgrade.doneRefresh': '已升级到 {version}。点击刷新页面加载新界面。',
        'upgrade.failed': '升级失败：{message}',
        'upgrade.history': '最近一次升级',
        'upgrade.from': '由 {from} 升级',
        'upgrade.notes': '更新说明',
        'upgrade.auto': '自动检查：每 {n} 小时',
        'upgrade.autoOff': '自动检查已关闭',
        'reload.now': '热重载插件',
        'reload.reloading': '重载中…',
        'reload.done': '插件已热重载（第 {n} 次）。',
        'reload.refresh': '刷新页面',
        'reload.auto': '文件变化自动热重载',
        'toast.annTitle': '新公告',
        'toast.updateTitle': '插件可升级',
        'toast.updateBody': '发现新版本 {latest}（当前 {current}），可到设置页升级。',
      },
      en: {
        'meta.title': 'Our Free Model',
        'meta.description': 'Free no-key models inside DeepSeek Harness: a roster that follows upstream, live regional availability, genuinely enforced thinking levels, a token dashboard and an OpenAI-compatible local forward port.',
        'ann.pitch': 'All you do is install this plugin in dsh — no login, no sign-up, no API key, no other step of any kind. The frontier models are simply there, Muse Spark 1.3 and MiMo V2.6 among them. Completely free, with no usage cap.',
        nav: 'Our Free Model',
        title: 'Our Free Model',
        subtitle: 'No-key free lane · live availability',
        refresh: 'Refresh roster',
        reprobe: 'Re-probe availability',
        probing: 'Probing…',
        loading: 'Reading local data…',
        loadFailed: 'Cannot reach the plugin backend',
        retry: 'Retry',
        'state.available': 'Available',
        'state.region-blocked': 'Region-limited',
        'state.unavailable': 'Unavailable',
        'state.throttled': 'Quota reached',
        'state.unknown': 'Not probed',
        'hint.region': 'This model is gated by egress country. Once a proxy changes your egress, the next probe moves it into the available group by itself.',
        'hint.unknown': 'Not probed yet, so it stays reachable.',
        'hint.hidden': 'The gateway names it but refuses to route it, so it is out of the model picker. It returns by itself as soon as a probe gets through.',
        'hint.sharedBudget': 'Thinking cannot be switched off on this model, so thinking and the visible answer share one ceiling — a lower rung leaves the answer less room.',
        'group.notAdvertised': 'Not in the picker',
        'tag.vision': 'Vision',
        'tag.text': 'Text only',
        'tag.thinking': 'Tunable thinking',
        'tag.thinkingShared': 'Thinking always on',
        'tag.rung': 'Default ceiling',
        'tag.rungTitle': 'What each rung actually sends: {ladder}. A rung is one ceiling shared by thinking and the answer, and it never exceeds the max output above or the per-call ceiling in settings.',
        'tag.context': 'Context',
        'tag.output': 'Max output',
        'tag.latency': 'First token',
        'section.models': 'Model roster',
        'section.modelsHint': 'Names and capacities come from the upstream roster and published capability tables; availability is measured from this machine.',
        'section.dash': 'Usage dashboard',
        'section.dashHint': 'Written to this machine only; nothing is uploaded.',
        'section.forward': 'Local forward (OpenAI compatible)',
        'section.forwardHint': 'Let other local tools reach these models through one base URL.',
        'section.prefs': 'Plugin settings',
        'section.prefsHint': 'Changes take full effect on the next load.',
        'heat.title': 'Token heatmap',
        'heat.legend': 'Less',
        'heat.legendMore': 'More',
        'heat.empty': 'No usage yet. Have one conversation and come back.',
        'curve.title': 'Cumulative tokens',
        'curve.tokens': 'Tokens',
        'curve.requests': 'Requests',
        'curve.total': 'Total',
        'stat.output': 'Output tokens',
        'stat.reasoning': 'Reasoning tokens',
        'col.reason': 'reason',
        'col.output': 'output',
        'speed.title': 'Speed',
        'speed.tps': 'Output speed',
        'speed.ttft': 'First frame',
        'speed.model': 'Model',
        'speed.calls': 'Calls',
        'speed.failed': 'Failed',
        'speed.none': 'No samples yet',
        'speed.note': 'Output speed covers the {n}/{total} calls it could measure: tokens never streamed out are left out of the numerator, and windows too short to time are dropped.',
        'unit.tokPerSec': 'tok/s',
        'unit.ms': 'ms',
        'forward.enabled': 'Enable the forward port',
        'forward.host': 'Bind address',
        'forward.port': 'Port',
        'forward.apply': 'Apply',
        'settings.failed': 'Settings not saved',
        'forward.running': 'Listening',
        'forward.stopped': 'Off',
        'forward.baseUrl': 'Base URL',
        'forward.key': 'API key',
        'forward.show': 'Show',
        'forward.hide': 'Hide',
        'forward.rotate': 'Regenerate',
        'forward.rotateWarn': 'Regenerating invalidates the old key for every tool using it.',
        'forward.copy': 'Copy',
        'forward.copied': 'Copied',
        'forward.example': 'Example',
        'forward.error': 'Could not start: {message}',
        'pref.enabled': 'Enable free models',
        'pref.exposeRegion': 'Show region-limited models',
        'pref.interval': 'Auto-probe interval (minutes)',
        'pref.maxTokens': 'Output ceiling per call (tokens)',
        'pref.egress': 'Current egress',
        'pref.probedAt': 'Last probe',
        'bench.run': 'Run once',
        'bench.running': 'Measuring…',
        'bench.result': 'first frame {ttft}ms · {tps} tok/s · {reasoning} reasoning tokens',
        'ann.preamble': 'Preamble',
        'ann.models': 'Model roster',
        'ann.steps': 'How to use',
        'ann.features': 'What it does',
        'ann.later': 'Later',
        'ann.page': 'Page {n} of {total}',
        'ann.openSettings': 'Open settings',
        'ann.p1': 'No credentials: install and use it — no sign-up, no API key to paste.',
        'ann.p2': 'The roster follows upstream: models, context lengths and capabilities are re-fetched on every refresh.',
        'ann.p3': 'Honest capability claims: anything a probe cannot confirm stays hidden, and each effort level is a real output budget.',
        'ann.s1': 'Pick any model under the “Our Free Model” group in the composer’s model selector.',
        'ann.s2': 'For harder reasoning, open the Effort menu — it sends a real budget, not a prompt hint.',
        'ann.s3': 'To serve other local tools: Settings → Local forward → enable, then copy the base URL and key.',
        'ann.s4': 'Region-limited models reclassify themselves once your network egress changes.',
        'ann.f1': 'Model roster: availability, context length, vision, tunable thinking.',
        'ann.f2': 'Token heatmap and cumulative curve, per total or per model.',
        'ann.f3': 'Per-call samples of output speed (tok/s) and time to first token.',
        'ann.f4': 'OpenAI-compatible forward port with a generated API key.',
        'ann.f5': 'Everything stays on this machine — no telemetry.',
        'ann.updates': 'News & upgrades',
        'ann.u1': 'Announcement center: pushes from the repository owner arrive live, with rich (HTML) layout.',
        'ann.u2': 'OS notifications: once enabled, new announcements and plugin updates raise system-level toasts.',
        'ann.u3': 'In-app upgrades: install new releases straight from the settings page, no reinstall needed.',
        'ann.u4': 'Hot reload: upgrades and code changes take effect immediately, without restarting the app.',
        'section.news': 'Announcement center',
        'section.newsHint': 'Published by the repository owner; this page receives them live.',
        'section.upgrade': 'Plugin upgrade',
        'section.upgradeHint': 'Upgrade in-app — no reinstall, no restart.',
        'news.unread': '{n} unread',
        'news.allRead': 'Mark all read',
        'news.markRead': 'Mark read',
        'news.expand': 'Show announcements',
        'news.collapse': 'Hide announcements',
        'news.refresh': 'Check for new announcements',
        'news.refreshing': 'Checking…',
        'news.empty': 'No announcements yet. Anything the owner pushes will appear here.',
        'news.emptyHint': 'Announcements support rich layout and are published by editing the plugin repository.',
        'news.osEnable': 'Enable OS notifications',
        'news.osOn': 'OS notifications on',
        'news.osOff': 'OS notifications off',
        'news.osDenied': 'Notification permission was denied; restore it in your system or browser settings.',
        'news.link': 'Read more',
        'news.urgentTitle': 'Important announcement',
        'news.gotIt': 'Got it',
        'news.lastFetch': 'Last fetch',
        'news.fetchFailed': 'Feed unreachable right now (showing the cached copy)',
        'level.info': 'Notice',
        'level.update': 'Update',
        'level.warn': 'Heads-up',
        'level.urgent': 'Urgent',
        'upgrade.current': 'Installed',
        'upgrade.latest': 'Latest',
        'upgrade.checkedAt': 'Last check',
        'upgrade.never': 'never',
        'upgrade.check': 'Check for updates',
        'upgrade.checking': 'Checking…',
        'upgrade.upToDate': 'Up to date',
        'upgrade.available': 'Upgrade to {version} available',
        'upgrade.apply': 'Upgrade now',
        'upgrade.applying': 'Upgrading…',
        'upgrade.phase.download': 'Downloading the new version…',
        'upgrade.phase.install': 'Installing files…',
        'upgrade.phase.reload': 'Hot-reloading…',
        'upgrade.done': 'Upgraded to {version}; the plugin hot-reloaded into place.',
        'upgrade.doneRefresh': 'Upgraded to {version}. Reload the page to load the new UI.',
        'upgrade.failed': 'Upgrade failed: {message}',
        'upgrade.history': 'Last upgrade',
        'upgrade.from': 'from {from}',
        'upgrade.notes': 'Release notes',
        'upgrade.auto': 'Auto-check: every {n} h',
        'upgrade.autoOff': 'Auto-check off',
        'reload.now': 'Hot-reload plugin',
        'reload.reloading': 'Reloading…',
        'reload.done': 'Plugin hot-reloaded (#{n}).',
        'reload.refresh': 'Reload page',
        'reload.auto': 'Hot-reload on file change',
        'toast.annTitle': 'New announcement',
        'toast.updateTitle': 'Plugin update available',
        'toast.updateBody': 'Version {latest} is out (installed {current}). Upgrade from the settings page.',
      },
    }

    // ── styles ────────────────────────────────────────────────────────────────
    const CSS = `
.ofm_root{--gap:14px;display:flex;flex-direction:column;gap:calc(var(--gap)*1.4);max-width:1080px;font-size:13px;line-height:1.55;color:var(--dsw-alias-label-primary)}
.ofm_root *{box-sizing:border-box}
.ofm_hero{display:flex;flex-direction:column;gap:10px;padding:18px 20px;border-radius:16px;border:1px solid var(--dsw-alias-border-l2);background:linear-gradient(160deg,var(--dsw-alias-bg-layer-3),var(--dsw-alias-bg-layer-1))}
.ofm_herotop{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ofm_logotype{font-size:19px;font-weight:700;letter-spacing:-.2px}
.ofm_tagline{margin:0;color:var(--dsw-alias-label-secondary);font-size:12.5px;max-width:62ch}
.ofm_pills{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.ofm_pill{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.ofm_pill.strong{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.ofm_dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none}
.ofm_dot.ok{background:var(--dsw-alias-state-success-primary)}
.ofm_dot.warn{background:var(--dsw-alias-state-warning-primary)}
.ofm_dot.err{background:var(--dsw-alias-state-error-primary)}
.ofm_actions{display:flex;gap:8px;flex-wrap:wrap}
.ofm_sec{display:flex;flex-direction:column;gap:10px}
.ofm_sechead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding-bottom:2px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.ofm_sec_title{font-size:14px;font-weight:650}
.ofm_sec_hint{font-size:11.5px;color:var(--dsw-alias-label-tertiary);margin-left:auto}
.ofm_grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(252px,1fr));gap:10px}
.ofm_card{position:relative;display:flex;flex-direction:column;gap:8px;padding:12px 13px;border-radius:13px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);transition:border-color .16s ease,transform .16s ease}
.ofm_card:hover{border-color:var(--dsw-alias-state-business-primary)}
.ofm_card.dim{opacity:.68}
.ofm_cardhead{display:flex;align-items:center;gap:8px}
.ofm_cardname{font-size:13.5px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ofm_badge{margin-left:auto;font-size:10.5px;padding:2px 7px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);white-space:nowrap}
.ofm_badge.available{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.ofm_badge.region-blocked{color:var(--dsw-alias-state-warning-primary);border-color:var(--dsw-alias-state-warning-primary)}
.ofm_badge.throttled,.ofm_badge.unavailable{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.ofm_badge.unknown{color:var(--dsw-alias-label-tertiary)}
.ofm_id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ofm_tags{display:flex;gap:5px;flex-wrap:wrap}
.ofm_tag{font-size:10.5px;padding:2px 7px;border-radius:6px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.ofm_metrics{display:flex;gap:12px;font-size:11px;color:var(--dsw-alias-label-tertiary);flex-wrap:wrap}
.ofm_metrics b{color:var(--dsw-alias-label-secondary);font-weight:600;font-variant-numeric:tabular-nums}
.ofm_note{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.5}
.ofm_panel{padding:14px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:12px}
.ofm_paneltitle{font-size:12px;font-weight:650;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:8px}
.ofm_paneltitle .ofm_sec_hint{font-weight:400}
.ofm_row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ofm_heat{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,1fr);gap:3px;overflow-x:auto;padding:2px 0 6px}
.ofm_cell{width:12px;height:12px;border-radius:3px;background:var(--dsw-alias-bg-layer-1);outline:1px solid var(--dsw-alias-border-l1);outline-offset:-1px}
.ofm_cell.l1{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 22%,transparent);outline-color:transparent}
.ofm_cell.l2{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 42%,transparent);outline-color:transparent}
.ofm_cell.l3{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 66%,transparent);outline-color:transparent}
.ofm_cell.l4{background:var(--dsw-alias-state-business-primary);outline-color:transparent}
.ofm_scale{display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--dsw-alias-label-tertiary);margin-left:auto}
.ofm_scale .ofm_cell{width:10px;height:10px}
.ofm_seg{display:inline-flex;padding:2px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);gap:2px}
.ofm_seg button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;padding:3px 10px;border-radius:7px;cursor:pointer}
.ofm_seg button[aria-pressed="true"]{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgb(0 0 0 / 12%)}
.ofm_svg{display:block;width:100%;height:auto;overflow:visible}
.ofm_chips{display:flex;gap:5px;flex-wrap:wrap}
.ofm_chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);cursor:pointer;color:var(--dsw-alias-label-secondary)}
.ofm_chip[aria-pressed="true"]{border-color:currentColor}
.ofm_swatch{width:8px;height:8px;border-radius:2px;flex:none}
.ofm_table{width:100%;border-collapse:collapse;font-size:11.5px}
.ofm_table th{text-align:left;font-weight:500;color:var(--dsw-alias-label-tertiary);padding:0 8px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}
.ofm_table td{padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);font-variant-numeric:tabular-nums}
.ofm_table td:first-child{font-weight:600}
.ofm_table tr:last-child td{border-bottom:0}
.ofm_num{text-align:right}
.ofm_btn{font:inherit;font-size:12px;padding:5px 12px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);cursor:pointer;transition:border-color .15s ease,opacity .15s ease}
.ofm_btn:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary)}
.ofm_btn:disabled{opacity:.5;cursor:default}
.ofm_btn.primary{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-on-accent)}
.ofm_btn.ghost{background:transparent}
.ofm_field{display:flex;flex-direction:column;gap:4px;min-width:120px}
.ofm_field>span{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ofm_input{font:inherit;font-size:12px;padding:5px 9px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);min-width:0;width:100%}
.ofm_input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.ofm_switch{display:inline-flex;align-items:center;gap:9px;cursor:pointer;user-select:none}
.ofm_switch i{width:34px;height:20px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);position:relative;transition:background .16s ease,border-color .16s ease;flex:none}
.ofm_switch i::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .16s ease,background .16s ease}
.ofm_switch[aria-checked="true"] i{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.ofm_switch[aria-checked="true"] i::after{transform:translateX(14px);background:#fff}
.ofm_mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;padding:7px 10px;border-radius:9px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);overflow-x:auto;white-space:pre;color:var(--dsw-alias-label-secondary)}
.ofm_callout{display:flex;gap:9px;padding:10px 12px;border-radius:11px;border:1px solid var(--dsw-alias-state-warning-primary);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary) 10%,transparent);font-size:11.5px;line-height:1.5}
.ofm_error{border-color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.ofm_stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px}
.ofm_stat{padding:9px 11px;border-radius:11px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.ofm_stat b{display:block;font-size:16px;font-weight:680;font-variant-numeric:tabular-nums;letter-spacing:-.3px}
.ofm_stat span{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}
/* announcement */
/* The onboarding slot is mounted inside the collapsed sidebar foot of the shell,
   so a card that stays in flow inherits a 55 px-wide, overflow-hidden column. The
   scrim is therefore fixed to the viewport; the shell sets no transform, filter
   or contain on any ancestor, so nothing re-anchors it. Mask colour, blur and
   z-index mirror the Modal layer of the shell so this reads as first-party. */
.ofm_scrim{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:var(--dsw-alias-bg-mask-1, rgb(0 0 0 / 24%));backdrop-filter:var(--dsw-mask-blur, blur(2px))}
.ofm_ann{width:min(620px,92vw);max-height:min(86vh,640px);border-radius:18px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);box-shadow:0 24px 70px rgb(0 0 0 / 34%);overflow:hidden;display:flex;flex-direction:column}
.ofm_annhead{padding:18px 22px 12px;display:flex;flex-direction:column;gap:8px;background:linear-gradient(150deg,var(--dsw-alias-bg-layer-3),transparent)}
.ofm_anntitle{margin:0;font-size:18px;font-weight:700;letter-spacing:-.3px}
.ofm_annsub{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.ofm_steps{display:flex;gap:6px;padding:0 22px 14px}
.ofm_step{height:3px;flex:1;border-radius:99px;background:var(--dsw-alias-border-l2);transition:background .2s ease}
.ofm_step[data-on="true"]{background:var(--dsw-alias-state-business-primary)}
.ofm_annbody{padding:2px 22px 18px;max-height:min(48vh,420px);overflow:auto;display:flex;flex-direction:column;gap:12px}
.ofm_annbody h3{margin:0;font-size:13.5px;font-weight:660}
.ofm_annbody p,.ofm_annbody li{font-size:12.5px;line-height:1.72;color:var(--dsw-alias-label-secondary);margin:0}
.ofm_annbody ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px}
.ofm_annfoot{display:flex;align-items:center;gap:10px;padding:13px 22px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.ofm_annfoot .spacer{margin-left:auto}
.ofm_kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.ofm_kvc{padding:9px 11px;border-radius:11px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:3px}
.ofm_kvc b{font-size:12.5px}
.ofm_kvc span{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}
.ofm_two{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
/* announcement center + upgrade */
.ofm_news{display:flex;flex-direction:column;gap:10px}
.ofm_newsitem{display:flex;flex-direction:column;gap:7px;padding:12px 14px;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);position:relative}
.ofm_newsitem.unread{border-color:var(--dsw-alias-state-business-primary)}
.ofm_newsdot{position:absolute;top:14px;right:14px;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-business-primary)}
.ofm_newshead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-right:16px}
.ofm_newstitle{font-size:13px;font-weight:650}
.ofm_level{font-size:10.5px;padding:2px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.ofm_level.info{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.ofm_level.update{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.ofm_level.warn{color:var(--dsw-alias-state-warning-primary);border-color:var(--dsw-alias-state-warning-primary)}
.ofm_level.urgent{color:#fff;background:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.ofm_newsmeta{display:flex;gap:10px;font-size:11px;color:var(--dsw-alias-label-tertiary);flex-wrap:wrap}
.ofm_newsbody{font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.ofm_newsbody p{margin:0 0 6px}
.ofm_newsbody p:last-child{margin-bottom:0}
.ofm_newsbody h1,.ofm_newsbody h2,.ofm_newsbody h3,.ofm_newsbody h4{margin:6px 0 4px;font-size:13px;line-height:1.4}
.ofm_newsbody ul,.ofm_newsbody ol{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:3px}
.ofm_newsbody code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:1px 5px}
.ofm_newsbody pre{margin:4px 0;padding:8px 10px;border-radius:9px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);overflow-x:auto}
.ofm_newsbody pre code{background:transparent;border:0;padding:0}
.ofm_newsbody blockquote{margin:4px 0;padding:2px 10px;border-left:3px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}
.ofm_newsbody img{max-width:100%;border-radius:8px}
.ofm_newsbody a{color:var(--dsw-alias-state-business-primary);text-decoration:none}
.ofm_newsbody a:hover{text-decoration:underline}
.ofm_newsbody table{border-collapse:collapse;font-size:12px}
.ofm_newsbody th,.ofm_newsbody td{border:1px solid var(--dsw-alias-border-l1);padding:3px 8px}
.ofm_newsbody hr{border:0;border-top:1px solid var(--dsw-alias-border-l1);margin:8px 0}
.ofm_newsbody mark{background:color-mix(in srgb,var(--dsw-alias-state-warning-primary) 30%,transparent)}
.ofm_upgradecards{display:flex;gap:8px;flex-wrap:wrap}
.ofm_upnotes{max-height:220px;overflow:auto;padding:10px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.ofm_prog{height:4px;border-radius:99px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.ofm_prog i{display:block;height:100%;width:40%;border-radius:99px;background:var(--dsw-alias-state-business-primary);animation:ofm-prog-slide 1.1s ease-in-out infinite}
@keyframes ofm-prog-slide{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
/* toasts (vanilla DOM, appended to body so they float above every surface) */
.ofm_toasts{position:fixed;right:18px;bottom:18px;z-index:1200;display:flex;flex-direction:column;gap:10px;max-width:min(380px,calc(100vw - 36px));font-family:inherit}
.ofm_toast{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);box-shadow:0 10px 34px rgb(0 0 0 / 22%);font-size:12.5px;line-height:1.5;color:var(--dsw-alias-label-primary);animation:ofm-toast-rise .18s ease}
.ofm_toast.warn{border-color:var(--dsw-alias-state-warning-primary)}
.ofm_toast.urgent{border-color:var(--dsw-alias-state-error-primary)}
.ofm_toast .ofm_toasttitle{font-weight:650;font-size:12.5px;display:flex;align-items:center;gap:7px}
.ofm_toast .ofm_toastbody{color:var(--dsw-alias-label-secondary);max-height:180px;overflow:auto;overflow-wrap:anywhere}
.ofm_toast .ofm_toastbody p{margin:0 0 5px}
.ofm_toast .ofm_toastbody p:last-child{margin-bottom:0}
.ofm_toast .ofm_toastbody img{max-width:100%}
.ofm_toastactions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.ofm_toastclose{margin-left:auto;background:transparent;border:0;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit;font-size:13px;padding:0 2px}
.ofm_toastclose:hover{color:var(--dsw-alias-label-primary)}
@keyframes ofm-toast-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.ofm_modal{width:min(520px,92vw);max-height:min(80vh,600px);border-radius:16px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);box-shadow:0 24px 70px rgb(0 0 0 / 34%);display:flex;flex-direction:column;overflow:hidden}
.ofm_modalhead{padding:16px 20px 10px;display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700}
.ofm_modalbody{padding:4px 20px 16px;overflow:auto;font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-secondary)}
.ofm_modalbody p{margin:0 0 6px}
.ofm_modalfoot{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
@media (max-width:720px){.ofm_sec_hint{margin-left:0;width:100%}.ofm_pills{margin-left:0;width:100%}}
`

    // ── helpers ───────────────────────────────────────────────────────────────
    const API = '/api/our-free-model'
    const SEASON = ['#4C8DFF', '#3ECFA0', '#F2A65A', '#E36AA6', '#8B7BF0', '#39B8C4', '#D9743E', '#7BB24A']

    async function api(path, options) {
      // 8 秒超时兜底：后端路由未注册/挂起时 fetch 不再永久挂起——此前全部 api 调用
      // （onboarding /announcement、设置页 /announcements /update/status、面板 /summary /stats
      // /forward/key 等）无任何超时，一个不响应端点即可阻塞 settings.onboarding 协调流程
      // 并长期占用同源连接池。超时按 AbortError 抛给调用方，走各自 .catch 降级路径。
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      try {
        const response = await fetch(`${API}${path}`, { ...options, redirect: 'error', signal: ctrl.signal })
        const text = await response.text()
        let payload
        try { payload = text === '' ? {} : JSON.parse(text) } catch { payload = { error: text.slice(0, 200) } }
        if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
        return payload
      } finally {
        clearTimeout(timer)
      }
    }

    const post = (path, body) => api(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      ...body === undefined ? {} : { body: JSON.stringify(body) },
    })

    function useAsync(loader, deps) {
      const [state, setState] = useState({ status: 'loading', data: undefined, error: '' })
      const run = useCallback(() => {
        let alive = true
        setState(current => ({ ...current, status: 'loading' }))
        loader().then(data => { if (alive) setState({ status: 'ready', data, error: '' }) })
          .catch(error => { if (alive) setState({ status: 'error', data: undefined, error: String(error?.message ?? error) }) })
        return () => { alive = false }
      }, deps)
      useEffect(() => run(), [run])
      return { ...state, reload: run }
    }

    function kilo(value) {
      const n = Math.round(Number(value) || 0)
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
      if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`
      return String(n)
    }

    function ago(ts, locale) {
      if (!ts) return '—'
      const seconds = Math.max(1, Math.round((Date.now() - ts) / 1000))
      const zh = String(locale ?? '').toLowerCase().startsWith('zh')
      if (seconds < 60) return zh ? `${seconds} 秒前` : `${seconds}s ago`
      const minutes = Math.round(seconds / 60)
      if (minutes < 60) return zh ? `${minutes} 分钟前` : `${minutes}m ago`
      const hours = Math.round(minutes / 60)
      if (hours < 24) return zh ? `${hours} 小时前` : `${hours}h ago`
      return zh ? `${Math.round(hours / 24)} 天前` : `${Math.round(hours / 24)}d ago`
    }

    function copy(text, done) {
      const finish = ok => done(ok)
      if (navigator?.clipboard?.writeText !== undefined) {
        navigator.clipboard.writeText(text).then(() => finish(true), () => finish(legacy(text)))
        return
      }
      finish(legacy(text))
    }
    function legacy(text) {
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(area)
        return ok
      } catch { return false }
    }

    // ── announcement HTML: strict allowlist, no innerHTML sink ───────────────
    // The feed is authored by the repository owner, but rendering is a trust
    // boundary of its own: the feed URL can be pointed anywhere, and a
    // compromised repository must never become script execution. Nothing here
    // hands a string to the HTML engine — the tokenizer walks the text, drops
    // everything off the allowlist, and builds a virtual tree that both React
    // and plain DOM can materialize. The same parser is exercised headlessly
    // by scripts/sanitize-test.mjs.
    const ALLOWED_TAGS = new Set(['a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'])
    /** Everything these elements contain is dropped, closing tag included. */
    const DROP_CONTENT_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'textarea', 'title', 'svg', 'math', 'form', 'input', 'button', 'select', 'option', 'video', 'audio', 'canvas', 'link', 'meta', 'base'])
    const VOID_TAGS = new Set(['br', 'hr', 'img'])
    const MAX_HTML_NODES = 4000
    const ALLOWED_STYLE_PROPS = new Set(['color', 'background-color', 'text-align', 'font-weight', 'font-style', 'text-decoration'])
    const STYLE_CAMEL = { 'background-color': 'backgroundColor', 'text-align': 'textAlign', 'font-weight': 'fontWeight', 'font-style': 'fontStyle', 'text-decoration': 'textDecoration', color: 'color' }

    /** http(s), mailto and in-page fragments only; images additionally accept inline PNG/JPEG/GIF/WebP. */
    function safeUrl(raw, isImage) {
      const value = String(raw ?? '').trim()
      if (value === '' || value.length > 2000) return undefined
      const lower = value.toLowerCase()
      if (/^https?:\/\//.test(lower)) return value
      if (lower.startsWith('mailto:') && /^[^@\s]+@[^@\s]+$/.test(value.slice(7))) return value
      if (lower.startsWith('#')) return value
      if (isImage && /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value
      return undefined
    }

    function sanitizeStyle(raw) {
      const out = {}
      for (const decl of String(raw ?? '').split(';')) {
        const idx = decl.indexOf(':')
        if (idx === -1) continue
        const prop = decl.slice(0, idx).trim().toLowerCase()
        const value = decl.slice(idx + 1).trim()
        if (!ALLOWED_STYLE_PROPS.has(prop) || value === '' || value.length > 120) continue
        if (/url\(|expression|javascript:|@|<|>/.test(value.toLowerCase())) continue
        out[STYLE_CAMEL[prop]] = value
      }
      return out
    }

    function sanitizeAttrs(tag, attrText) {
      const props = {}
      const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
      let match
      while ((match = attrRe.exec(attrText ?? '')) !== null) {
        const key = match[1].toLowerCase()
        const value = match[3] ?? match[4] ?? match[5] ?? ''
        if (key === 'style') {
          const style = sanitizeStyle(value)
          if (Object.keys(style).length > 0) props.style = style
          continue
        }
        if (tag === 'a' && key === 'href') {
          const url = safeUrl(value)
          if (url !== undefined) {
            props.href = url
            props.target = '_blank'
            props.rel = 'noopener noreferrer'
          }
          continue
        }
        if (tag === 'img' && key === 'src') {
          const url = safeUrl(value, true)
          if (url !== undefined) props.src = url
          continue
        }
        if ((tag === 'img' || tag === 'a') && key === 'title') { props.title = value.slice(0, 300); continue }
        if (tag === 'img' && key === 'alt') { props.alt = value.slice(0, 300); continue }
        if ((key === 'width' || key === 'height') && /^\d{1,4}$/.test(value)) { props[key] = Number(value); continue }
      }
      return props
    }

    /**
     * Tokenize announcement HTML into a virtual tree of
     * `{type:'el', tag, props, children}` and `{type:'text', text}` nodes.
     * Disallowed elements are unwrapped (their children survive); the content
     * of raw-text elements such as `<script>` is dropped entirely.
     */
    function parseSafeHtml(html) {
      if (typeof html !== 'string' || html.trim() === '') return []
      const root = { type: 'root', children: [] }
      const stack = [root]
      const top = () => stack[stack.length - 1]
      let nodes = 0
      let skipUntil = null
      const tokenRe = /<!--[\s\S]*?-->|<\/\s*([a-zA-Z][a-zA-Z0-9-]*)\s*>|<\s*([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g
      let match
      while ((match = tokenRe.exec(html)) !== null) {
        if (nodes >= MAX_HTML_NODES) break
        if (match[0].startsWith('<!--')) continue
        if (match[4] !== undefined) {
          if (skipUntil === null) {
            const text = match[4]
            if (text.trim() !== '' || (top().children.length > 0 && typeof top().children[top().children.length - 1] !== 'string')) {
              top().children.push(text)
            }
          }
          continue
        }
        const name = (match[1] ?? match[2] ?? '').toLowerCase()
        if (name === '') continue
        if (match[1] !== undefined) {
          // closing tag
          if (skipUntil !== null) {
            if (name === skipUntil) skipUntil = null
            continue
          }
          if (!ALLOWED_TAGS.has(name)) continue
          let depth = stack.length - 1
          while (depth > 0 && stack[depth].tag !== name) depth -= 1
          if (depth === 0) continue
          while (stack.length - 1 > depth) {
            const dropped = stack.pop()
            top().children.push(...dropped.children)
          }
          const frame = stack.pop()
          top().children.push({ type: 'el', tag: frame.tag, props: frame.props, children: frame.children })
          nodes += 1
          continue
        }
        // opening tag
        if (skipUntil !== null) continue
        if (DROP_CONTENT_TAGS.has(name)) { skipUntil = name; continue }
        if (!ALLOWED_TAGS.has(name)) continue
        const props = sanitizeAttrs(name, match[3])
        if (name === 'img' && props.src === undefined) continue
        if (VOID_TAGS.has(name)) {
          top().children.push({ type: 'el', tag: name, props, children: [] })
          nodes += 1
          continue
        }
        stack.push({ tag: name, props, children: [] })
      }
      while (stack.length > 1) {
        const frame = stack.pop()
        top().children.push(...frame.children)
      }
      return root.children
    }

    /** Materialize the virtual tree as React elements (keys are positional). */
    function htmlToReact(nodes) {
      return nodes.map((node, index) => typeof node === 'string'
        ? node
        : h(node.tag, { key: index, ...node.props }, ...htmlToReact(node.children ?? [])))
    }

    /** Materialize the virtual tree as DOM nodes (for toasts and modals). */
    function htmlToDom(nodes) {
      return nodes.map(node => {
        if (typeof node === 'string') return document.createTextNode(node)
        const el = document.createElement(node.tag)
        for (const [key, value] of Object.entries(node.props ?? {})) {
          if (key === 'style') { Object.assign(el.style, value); continue }
          el.setAttribute(key, String(value))
        }
        for (const child of htmlToDom(node.children ?? [])) el.appendChild(child)
        return el
      })
    }

    // ── toasts: a vanilla-DOM host so pushes surface on every page ───────────
    // Slot content only exists where the shell mounts it; a toast that lived
    // inside the settings section would be invisible everywhere else. This
    // host attaches to document.body, outside the app root, and needs no
    // react-dom — the body renders through the same allowlist parser.
    function toastHost() {
      let host = document.querySelector('.ofm_toasts')
      if (host === null) {
        host = document.createElement('div')
        host.className = 'ofm_toasts'
        document.body.appendChild(host)
      }
      return host
    }

    function showToast({ title, body, html, tone, actions = [], holdMs = 10000 }) {
      try {
        const host = toastHost()
        const card = document.createElement('div')
        card.className = 'ofm_toast' + (tone === undefined ? '' : ` ${tone}`)
        const head = document.createElement('div')
        head.className = 'ofm_toasttitle'
        head.appendChild(document.createTextNode(title ?? ''))
        const close = document.createElement('button')
        close.type = 'button'
        close.className = 'ofm_toastclose'
        // No locale lookup in here on purpose: showToast also runs from the
        // push subscription before any `t` binding is in scope, and a throw
        // inside this try/catch would silently swallow the whole toast.
        close.setAttribute('aria-label', 'close')
        close.title = '✕'
        close.textContent = '✕'
        close.addEventListener('click', () => card.remove())
        head.appendChild(close)
        card.appendChild(head)
        if (body !== undefined && body !== '') {
          const area = document.createElement('div')
          area.className = 'ofm_toastbody'
          area.textContent = String(body)
          card.appendChild(area)
        } else if (html !== undefined) {
          const area = document.createElement('div')
          area.className = 'ofm_toastbody'
          for (const node of htmlToDom(parseSafeHtml(html))) area.appendChild(node)
          card.appendChild(area)
        }
        if (actions.length > 0) {
          const row = document.createElement('div')
          row.className = 'ofm_toastactions'
          for (const action of actions) {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = 'ofm_btn'
            btn.textContent = action.label
            btn.addEventListener('click', () => { card.remove(); action.onClick?.() })
            row.appendChild(btn)
          }
          card.appendChild(row)
        }
        host.appendChild(card)
        while (host.children.length > 4) host.firstElementChild?.remove()
        if (holdMs > 0) {
          const timer = setTimeout(() => card.remove(), holdMs)
          timer.unref?.()
        }
        return card
      } catch { /* a toast must never break its caller */ }
      return undefined
    }

    /** Modal surface for `urgent` announcements; dismiss runs the ack callback. */
    function showUrgentModal({ title, html, confirmLabel, onClose }) {
      try {
        document.querySelector('.ofm_scrim[data-ofm-urgent]')?.remove()
        const scrim = document.createElement('div')
        scrim.className = 'ofm_scrim'
        scrim.setAttribute('data-ofm-urgent', 'true')
        const modal = document.createElement('div')
        modal.className = 'ofm_modal'
        modal.setAttribute('role', 'alertdialog')
        modal.setAttribute('aria-modal', 'true')
        const head = document.createElement('div')
        head.className = 'ofm_modalhead'
        head.textContent = title ?? ''
        const body = document.createElement('div')
        body.className = 'ofm_modalbody'
        for (const node of htmlToDom(parseSafeHtml(html ?? ''))) body.appendChild(node)
        const foot = document.createElement('div')
        foot.className = 'ofm_modalfoot'
        const ok = document.createElement('button')
        ok.type = 'button'
        ok.className = 'ofm_btn primary'
        ok.textContent = confirmLabel ?? 'OK'
        ok.addEventListener('click', () => { scrim.remove(); onClose?.() })
        foot.appendChild(ok)
        modal.appendChild(head)
        modal.appendChild(body)
        modal.appendChild(foot)
        scrim.appendChild(modal)
        document.body.appendChild(scrim)
      } catch { /* a modal must never break its caller */ }
    }

    /** OS-level notification, only when the user both opted in and granted. */
    function osNotify(title, body) {
      try {
        if (typeof Notification !== 'function' || Notification.permission !== 'granted') return
        new Notification(title, { body: String(body ?? '').slice(0, 200) })
      } catch { /* the in-app toast still fires */ }
    }

    const Switch = (props) => h('button', {
      type: 'button',
      className: 'ofm_switch',
      role: 'switch',
      'aria-checked': props.checked ? 'true' : 'false',
      onClick: props.onChange,
    }, h('i'), props.label === undefined ? null : h('span', null, props.label))

    const Pill = (props) => h('span', { className: `ofm_pill${props.strong ? ' strong' : ''}` },
      props.tone === undefined ? null : h('span', { className: `ofm_dot ${props.tone}` }),
      props.children)

    const Button = props => h('button', {
      type: 'button',
      className: 'ofm_btn' + (props.kind === undefined ? '' : ' ' + props.kind),
      disabled: props.disabled,
      onClick: props.onClick,
      title: props.title,
    }, props.children)

    function Section(props) {
      return h('section', { className: 'ofm_sec' },
        h('div', { className: 'ofm_sechead' },
          h('span', { className: 'ofm_sec_title' }, props.title),
          props.hint === undefined ? null : h('span', { className: 'ofm_sec_hint' }, props.hint)),
        props.children)
    }

    function Panel(props) {
      return h('div', { className: 'ofm_panel' },
        props.title === undefined ? null : h('div', { className: 'ofm_paneltitle' }, props.title, props.hint === undefined ? null : h('span', { className: 'ofm_sec_hint' }, props.hint)),
        props.children)
    }

    // ── charts (hand-drawn SVG; the shell ships no plotting primitive) ────────
    function Heatmap(props) {
      const { days, t } = props
      const cells = useMemo(() => buildHeatCells(days), [days])
      const peak = cells.reduce((max, cell) => Math.max(max, cell.total), 0)
      if (cells.length === 0) return h('p', { className: 'ofm_note' }, t('heat.empty'))
      const level = value => value === 0 ? '' : peak === 0 ? '' : value / peak > 0.66 ? 'l4' : value / peak > 0.4 ? 'l3' : value / peak > 0.16 ? 'l2' : 'l1'
      return h(Fragment, null,
        h('div', { className: 'ofm_heat', role: 'img', 'aria-label': t('heat.title') },
          cells.map((cell, index) => h('div', {
            key: `${cell.day}-${index}`,
            className: 'ofm_cell ' + level(cell.total),
            title: `${cell.day} · ${cell.total.toLocaleString()} tokens${cell.models.length ? ` · ${cell.models.join(', ')}` : ''}`,
          }))),
        h('div', { className: 'ofm_scale' }, t('heat.legend'),
          ['l1', 'l2', 'l3', 'l4'].map(cls => h('span', { key: cls, className: `ofm_cell ${cls}` })),
          t('heat.legendMore')))
    }

    /** Column-major weeks ending today, always Sunday-aligned rows. */
    function buildHeatCells(days, span = 119) {
      const byDay = new Map(days.map(row => [row.day, row]))
      const end = new Date()
      end.setHours(0, 0, 0, 0)
      const cells = []
      const start = new Date(end)
      start.setDate(start.getDate() - (span - 1 - end.getDay()))
      for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
        const row = byDay.get(key)
        cells.push({ day: key, total: row?.total ?? 0, models: (row?.models ?? []).filter(m => m.output > 0).map(m => m.model) })
      }
      return cells
    }

    function TrendChart(props) {
      const { series, metric, mode } = props
      const width = 900
      const height = 168
      const pad = { top: 12, right: 8, bottom: 18, left: 40 }
      const rows = series.length === 0 ? [{ day: '', total: 0 }] : series
      const valueOf = row => mode === 'requests'
        ? row.models.reduce((sum, m) => sum + m.calls, 0)
        : metric === 'total' ? row.total : (row.models.find(m => m.model === metric)?.output ?? 0)
      const points = rows.map((row, index) => ({ x: rows.length === 1 ? width / 2 : pad.left + (index / (rows.length - 1)) * (width - pad.left - pad.right), y: 0, value: valueOf(row), day: row.day }))
      const peak = Math.max(1, ...points.map(p => p.value))
      for (const point of points) point.y = pad.top + (1 - point.value / peak) * (height - pad.top - pad.bottom)
      const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      const area = `${line} L${points[points.length - 1].x.toFixed(1)},${height - pad.bottom} L${points[0].x.toFixed(1)},${height - pad.bottom} Z`
      const color = metric === 'total' ? 'var(--dsw-alias-state-business-primary)' : (props.color ?? 'var(--dsw-alias-state-business-primary)')
      const ticks = [0, 0.5, 1].map(frac => ({ y: pad.top + frac * (height - pad.top - pad.bottom), label: kilo(peak * (1 - frac)) }))
      return h('svg', { className: 'ofm_svg', viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', role: 'img' },
        h('defs', null, h('linearGradient', { id: 'ofmFill', x1: '0', y1: '0', x2: '0', y2: '1' },
          h('stop', { offset: '0%', 'stop-color': color, 'stopOpacity': '0.32' }),
          h('stop', { offset: '100%', 'stop-color': color, 'stopOpacity': '0.02' }))),
        ticks.map(tick => h('g', { key: tick.y },
          h('line', { x1: pad.left, x2: width - pad.right, y1: tick.y, y2: tick.y, stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 1, strokeDasharray: tick.label === '0' ? undefined : '3 4' }),
          h('text', { x: pad.left - 6, y: tick.y + 3.5, textAnchor: 'end', fontSize: 9.5, fill: 'var(--dsw-alias-label-tertiary)' }, tick.label))),
        h('path', { d: area, fill: 'url(#ofmFill)' }),
        h('path', { d: line, fill: 'none', stroke: color, strokeWidth: 1.9, strokeLinejoin: 'round', strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke' }),
        rows.length > 1 ? [rows[0], rows[Math.floor(rows.length / 2)], rows[rows.length - 1]].map((row, i) => h('text', {
          key: `x${i}`,
          x: points[Math.min(points.length - 1, Math.round((i === 0 ? 0 : i === 1 ? (rows.length - 1) / 2 : rows.length - 1)))].x,
          y: height - 4, textAnchor: i === 0 ? 'start' : i === 2 ? 'end' : 'middle', fontSize: 9.5, fill: 'var(--dsw-alias-label-tertiary)',
        }, row.day.slice(5))) : null)
    }

    function Sparkline(props) {
      const values = props.values
      if (values.length < 2) return h('span', { className: 'ofm_note' }, props.t('speed.none'))
      const width = 150
      const height = 30
      const peak = Math.max(...values, 1)
      const floor = Math.min(...values, 0)
      const span = Math.max(1e-6, peak - floor)
      const line = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${(index / (values.length - 1) * width).toFixed(1)},${(height - ((value - floor) / span) * (height - 4) - 2).toFixed(1)}`).join(' ')
      return h('svg', { className: 'ofm_svg', viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', style: { height } },
        h('path', { d: line, fill: 'none', stroke: props.color ?? 'var(--dsw-alias-state-business-primary)', strokeWidth: 1.6, strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' }))
    }

    // ── model roster ──────────────────────────────────────────────────────────
    function ModelCard(props) {
      const { model: m, t, onBench, bench } = props
      const stateKey = `state.${m.availability}`
      const dim = m.availability !== 'available'
      const rung = (m.budgets ?? []).find(row => row.isDefault === true)
      return h('article', { className: 'ofm_card' + (dim ? ' dim' : '') },
        h('div', { className: 'ofm_cardhead' },
          h('span', { className: 'ofm_cardname', title: m.name }, m.name),
          h('span', { className: 'ofm_badge ' + m.availability }, t(stateKey))),
        h('div', { className: 'ofm_id', title: m.id }, m.id),
        h('div', { className: 'ofm_tags' },
          h('span', { className: 'ofm_tag' }, m.vision ? t('tag.vision') : t('tag.text')),
          m.reasoning ? h('span', { className: 'ofm_tag' }, m.canDisableThinking === false ? t('tag.thinkingShared') : t('tag.thinking')) : null,
          h('span', { className: 'ofm_tag' }, `${t('tag.context')} ${kilo(m.contextWindow)}`),
          h('span', { className: 'ofm_tag' }, `${t('tag.output')} ${kilo(m.maxOutput)}`),
          rung === undefined ? null : h('span', { className: 'ofm_tag', title: t('tag.rungTitle').replace('{ladder}', m.budgets.map(row => `${row.name} ${kilo(row.tokens)}`).join(' · ')) },
            `${t('tag.rung')} ${kilo(rung.tokens)}`)),
        m.availability === 'region-blocked' ? h('p', { className: 'ofm_note' }, t('hint.region'))
          : m.availability === 'unknown' ? h('p', { className: 'ofm_note' }, t('hint.unknown'))
            : m.availability === 'unavailable' ? h('p', { className: 'ofm_note', title: m.detail ?? '' }, t('hint.hidden'))
              : h('div', { className: 'ofm_metrics' },
                m.ttftMs === undefined || m.ttftMs === 0 ? null : h('span', null, t('tag.latency'), ' ', h('b', null, Math.round(m.ttftMs)), ' ms'),
                h('span', null, t('pref.probedAt'), ' ', h('b', null, ago(m.probedAt, t.locale)))),
        m.canDisableThinking === false ? h('p', { className: 'ofm_note' }, t('hint.sharedBudget')) : null,
        onBench === undefined ? null : h('div', { className: 'ofm_row' },
          h(Button, { disabled: bench?.running === true, onClick: () => onBench(m) }, bench?.running === true ? t('bench.running') : t('bench.run')),
          bench?.result === undefined ? null : h('span', { className: 'ofm_note' }, bench.result)))
    }

    function Roster(props) {
      const { summary, t, onBench, benches } = props
      const available = summary.catalog.filter(m => m.route === 'our-free-model')
      const limited = summary.catalog.filter(m => m.route === 'our-free-model-region')
      const other = summary.catalog.filter(m => m.route === null)
      const group = (title, list, hint) => list.length === 0 ? null
        : h('div', { className: 'ofm_sec', style: { gap: 8 } },
          h('div', { className: 'ofm_row' }, h('span', { className: 'ofm_sec_title', style: { fontSize: 12.5 } }, title),
            hint === undefined ? null : h('span', { className: 'ofm_sec_hint' }, hint)),
          h('div', { className: 'ofm_grid' }, list.map(m => h(ModelCard, {
            key: m.id, model: m, t, onBench, bench: { running: benches[m.id]?.running === true, ...benches[m.id]?.result === undefined ? {} : { result: benches[m.id].result } },
          }))))
      return h(Fragment, null,
        group(t('state.available'), available),
        group(t('state.region-blocked'), limited, t('hint.region')),
        group(t('group.notAdvertised'), other, t('hint.hidden')))
    }

    // ── dashboard ─────────────────────────────────────────────────────────────
    function Dashboard(props) {
      const { stats, t } = props
      const days = useMemo(() => [...stats.days].sort((a, b) => a.day.localeCompare(b.day)), [stats.days])
      const recent = [...(stats.samples ?? [])].slice(-40)
      // The host already dropped the windows it could not measure and took out of
      // the numerator the tokens it never streamed. Averaging per-call rates
      // instead let one 1 ms window publish 63 000 tok/s and carry the whole card
      // to 2 493.
      const streamed = recent.filter(sample => sample.decodeMs > 0 && sample.tps !== null)
      const streamMs = streamed.reduce((sum, sample) => sum + sample.decodeMs, 0)
      const weightedTps = streamMs > 0
        ? streamed.reduce((sum, sample) => sum + (sample.decodeTokens ?? 0), 0) / (streamMs / 1000)
        : null
      const latencies = recent.filter(sample => sample.ttftMs !== null && sample.ttftMs !== undefined)
      const models = stats.models ?? []
      const [mode, setMode] = useState('tokens')
      const [metric, setMetric] = useState('total')

      const cumulative = useMemo(() => {
        let tokenRun = 0
        let requestRun = 0
        return days.map(row => {
          tokenRun += row.total
          requestRun += row.models.reduce((sum, m) => sum + m.calls, 0)
          return { ...row, total: mode === 'requests' ? requestRun : tokenRun }
        })
      }, [days, mode])

      const active = metric === 'total' ? undefined : models.find(m => m.model === metric)
      const color = metric === 'total'
        ? 'var(--dsw-alias-state-business-primary)'
        : SEASON[Math.max(0, models.findIndex(m => m.model === metric)) % SEASON.length]

      const headline = h('div', { className: 'ofm_stats' },
        stat(kilo(stats.grand.input + stats.grand.output), t('curve.tokens')),
        stat(kilo(stats.grand.output), t('stat.output')),
        stat(kilo(stats.grand.reasoning), t('stat.reasoning')),
        stat(String(stats.requests ?? 0), t('speed.calls')),
        stat(String(stats.grand.failed ?? 0), t('speed.failed')))

      const heatmap = h(Panel, { title: t('heat.title') }, h(Heatmap, { days, t }))

      const legend = h('div', { className: 'ofm_chips' },
        chip(t('curve.total'), metric === 'total', SEASON[0], () => setMetric('total')),
        models.map((m, index) => chip(m.name, metric === m.model, SEASON[index % SEASON.length], () => setMetric(m.model))))

      const curve = h(Panel, { title: t('curve.title') },
        h('div', { className: 'ofm_row' },
          h('div', { className: 'ofm_seg' },
            segButton(t('curve.tokens'), mode === 'tokens', () => setMode('tokens')),
            segButton(t('curve.requests'), mode === 'requests', () => setMode('requests'))),
          legend),
        h(TrendChart, { series: cumulative, mode, metric, color }),
        active === undefined ? null : h('p', { className: 'ofm_note' },
          active.name, ' · ', String(active.calls), ' ', t('speed.calls'),
          active.tps === null || active.tps === undefined ? null : ' · ',
          active.tps === null || active.tps === undefined ? null : `${active.tps} ${t('unit.tokPerSec')}`))

      const speed = h(Panel, { title: t('speed.title'), hint: recent.length + ' ' + t('speed.calls') },
        recent.length === 0
          ? h('p', { className: 'ofm_note' }, t('speed.none'))
          : h(Fragment, null,
            h('div', { className: 'ofm_row', style: { gap: 24 } },
              sparkCell(t('speed.tps'), streamed.map(s => s.tps), SEASON[0], value => Math.round(value) + ' ' + t('unit.tokPerSec'), t, weightedTps),
              sparkCell(t('speed.ttft'), latencies.map(s => s.ttftMs), SEASON[2], value => Math.round(value) + ' ' + t('unit.ms'), t),
              sparkCell(t('stat.output'), recent.map(s => s.output), SEASON[1], value => kilo(value) + ' tok', t)),
            h('p', { className: 'ofm_note' }, t('speed.note')
              .replace('{n}', String(streamed.length))
              .replace('{total}', String(recent.length)))))

      const table = models.length === 0 ? null : h(Panel, { title: t('speed.model') },
        h('table', { className: 'ofm_table' },
          h('thead', null, h('tr', null,
            h('th', null, t('speed.model')),
            num(t('speed.calls')), num(t('speed.tps')), num(t('speed.ttft')),
            num(t('col.reason')), num(t('col.output')), num(t('speed.failed')))),
          h('tbody', null, [...models].sort((a, b) => b.output - a.output).map(m => h('tr', { key: m.model },
            h('td', { title: m.model }, m.name),
            numTd(m.calls),
            numTd(m.tps),
            numTd(m.avgTtftMs === null || m.avgTtftMs === undefined ? null : Math.round(m.avgTtftMs)),
            numTd(kilo(m.reasoning)),
            numTd(kilo(m.output)),
            numTd(m.failed === 0 ? '—' : m.failed))))))

      return h(Fragment, null, headline, h('div', { className: 'ofm_two' }, heatmap, curve), speed, table)
    }

    const sparkCell = (label, values, color, format, t, summary) => {
      const shown = summary !== undefined ? summary : values.length < 2 ? null : avg(values)
      return h('div', { className: 'ofm_sec', style: { gap: 2 } },
        h('span', { className: 'ofm_note' }, label),
        h(Sparkline, { values, color, t }),
        h('b', { style: { fontSize: 15 } }, shown === null ? '—' : format(shown)))
    }

    const stat = (value, label) => h('div', { className: 'ofm_stat' }, h('b', null, value), h('span', null, label))
    const num = label => h('th', { className: 'ofm_num' }, label)
    const numTd = value => h('td', { className: 'ofm_num' }, value === null || value === undefined ? '—' : value)
    const avg = list => list.length === 0 ? 0 : list.reduce((a, b) => a + b, 0) / list.length
    const segButton = (label, on, onClick) => h('button', { type: 'button', 'aria-pressed': on ? 'true' : 'false', onClick }, label)
    const chip = (label, on, color, onClick) => h('button', { type: 'button', className: 'ofm_chip', 'aria-pressed': on ? 'true' : 'false', onClick, style: on ? { color } : undefined },
      h('span', { className: 'ofm_swatch', style: { background: color } }), label)

    // ── forward listener ──────────────────────────────────────────────────────
    function Forward(props) {
      const { settings, t, onApply, busy } = props
      const [draft, setDraft] = useState(settings.forward)
      useEffect(() => setDraft(settings.forward), [settings.forward?.enabled, settings.forward?.host, settings.forward?.port])
      const [key, setKey] = useState('')
      const [shown, setShown] = useState(false)
      const [copied, setCopied] = useState('')
      useEffect(() => {
        if (draft?.running !== true) return
        let alive = true
        api('/forward/key').then(payload => { if (alive) setKey(payload.key ?? '') }).catch(() => {})
        return () => { alive = false }
      }, [draft?.running])
      const port = draft?.actualPort ?? draft?.port ?? 0
      const base = `http://${draft?.host || '127.0.0.1'}:${port}/v1`
      const doCopy = (label, value) => copy(value, ok => {
        if (!ok) return
        setCopied(label)
        setTimeout(() => setCopied(''), 1600)
      })
      const curl = `curl ${base}/chat/completions \\\n  -H "authorization: Bearer ${shown && key !== '' ? key : '<API KEY>'}" \\\n  -H "content-type: application/json" \\\n  -d '{"model":"<model id>","messages":[{"role":"user","content":"hi"}]}'`

      return h(Panel, null,
        h('div', { className: 'ofm_row' },
          h(Switch, { checked: draft?.enabled === true, label: t('forward.enabled'), onChange: () => setDraft(current => ({ ...current, enabled: !(current?.enabled === true) })) }),
          h('span', { className: 'ofm_pill' }, h('span', { className: `ofm_dot ${draft?.running === true ? 'ok' : draft?.error ? 'err' : ''}` }), draft?.running === true ? t('forward.running') : t('forward.stopped'))),
        h('div', { className: 'ofm_row' },
          field(t('forward.host'), h('input', { className: 'ofm_input', style: { maxWidth: 150 }, value: draft?.host ?? '127.0.0.1', onChange: e => setDraft(c => ({ ...c, host: e.target.value })) })),
          field(t('forward.port'), h('input', { className: 'ofm_input', style: { maxWidth: 110 }, inputMode: 'numeric', value: draft?.port ?? '', onChange: e => setDraft(c => ({ ...c, port: Number(e.target.value.replace(/\D/g, '')) || 0 })) })),
          h(Button, { kind: 'primary', disabled: busy || draft?.enabled === undefined, onClick: () => onApply({ forward: { enabled: draft.enabled === true, host: draft.host, port: draft.port } }) }, t('forward.apply'))),
        draft?.error ? h('div', { className: 'ofm_callout ofm_error' }, t('forward.error').replace('{message}', draft.error)) : null,
        draft?.running === true ? h(Fragment, null,
          h('div', { className: 'ofm_row' },
            h('span', { className: 'ofm_note' }, t('forward.baseUrl')),
            h('code', { className: 'ofm_mono', style: { padding: '4px 8px', flex: 1, minWidth: 200 } }, base),
            h(Button, { kind: 'ghost', onClick: () => doCopy('base', base) }, copied === 'base' ? t('forward.copied') : t('forward.copy'))),
          h('div', { className: 'ofm_row' },
            h('span', { className: 'ofm_note' }, t('forward.key')),
            h('code', { className: 'ofm_mono', style: { padding: '4px 8px', flex: 1, minWidth: 200, letterSpacing: shown ? 0 : 1 } }, key === '' ? '…' : shown ? key : '•'.repeat(24)),
            h(Button, { kind: 'ghost', onClick: () => setShown(value => !value) }, shown ? t('forward.hide') : t('forward.show')),
            h(Button, { kind: 'ghost', onClick: () => doCopy('key', key) }, copied === 'key' ? t('forward.copied') : t('forward.copy')),
            h(Button, { kind: 'ghost', title: t('forward.rotateWarn'), onClick: async () => { const payload = await post('/forward/rotate'); setKey(payload.key ?? ''); setShown(true) } }, t('forward.rotate'))),
          h('div', { className: 'ofm_sec', style: { gap: 4 } }, h('span', { className: 'ofm_note' }, t('forward.example')),
            h('pre', { className: 'ofm_mono' }, curl),
            h('div', null, h(Button, { kind: 'ghost', onClick: () => doCopy('curl', curl) }, copied === 'curl' ? t('forward.copied') : t('forward.copy'))))) : null)
    }

    const field = (label, control) => h('label', { className: 'ofm_field' }, h('span', null, label), control)

    // ── preferences ───────────────────────────────────────────────────────────
    function Preferences(props) {
      const { summary, t, onApply, busy } = props
      const settings = summary.settings
      const [draft, setDraft] = useState(settings)
      useEffect(() => setDraft(settings), [summary])
      return h(Panel, null,
        h('div', { className: 'ofm_row', style: { gap: 20 } },
          h(Switch, { checked: settings.enabled !== false, label: t('pref.enabled'), onChange: () => onApply({ enabled: !(settings.enabled !== false) }) }),
          h(Switch, { checked: settings.exposeRegionModels !== false, label: t('pref.exposeRegion'), onChange: () => onApply({ exposeRegionModels: !(settings.exposeRegionModels !== false) }) })),
        h('div', { className: 'ofm_row' },
          field(t('pref.interval'), h('input', { className: 'ofm_input', style: { maxWidth: 100 }, value: draft?.probeIntervalMinutes ?? 15, onChange: e => setDraft(c => ({ ...c, probeIntervalMinutes: Number(e.target.value.replace(/\D/g, '')) || 0 })) })),
          field(t('pref.maxTokens'), h('input', { className: 'ofm_input', style: { maxWidth: 120 }, value: draft?.defaultMaxTokens ?? 32768, onChange: e => setDraft(c => ({ ...c, defaultMaxTokens: Number(e.target.value.replace(/\D/g, '')) || 0 })) })),
          h(Button, { kind: 'primary', disabled: busy, onClick: () => onApply({ probeIntervalMinutes: draft.probeIntervalMinutes, defaultMaxTokens: draft.defaultMaxTokens }) }, t('forward.apply'))),
        h('div', { className: 'ofm_row', style: { gap: 8 } },
          h('span', { className: 'ofm_pill' }, `${t('pref.egress')}: ${summary.egress?.ip ?? '—'}${summary.egress?.country ? ` (${summary.egress.country})` : ''}`),
          h('span', { className: 'ofm_pill' }, `${t('pref.probedAt')}: ${ago(summary.probedAt, t.locale)}`)))
    }

    // ── announcement center ──────────────────────────────────────────────────
    const LEVEL_KEY = { info: 'level.info', update: 'level.update', warn: 'level.warn', urgent: 'level.urgent' }

    function NewsPanel(props) {
      const { t } = props
      const news = useAsync(() => api('/announcements'), [])
      const [busy, setBusy] = useState(false)
      const [osError, setOsError] = useState('')
      // Collapsed by default: the header row carries the status, and the body
      // opens only while there is something unread to read.
      const [open, setOpen] = useState(false)
      const items = news.data?.items ?? []
      const unread = news.data?.unread ?? 0
      useEffect(() => {
        if (unread > 0) setOpen(true)
      }, [unread])
      // Live refresh: the push subscription broadcasts to window on arrival.
      useEffect(() => {
        const handler = () => news.reload()
        window.addEventListener('ofm:announcements', handler)
        return () => window.removeEventListener('ofm:announcements', handler)
      }, [news.reload])
      const notifyOs = news.data?.notifyOs === true
      const ack = async payload => {
        setBusy(true)
        try { await post('/announcements/ack', payload); news.reload() } finally { setBusy(false) }
      }
      const refresh = async () => {
        setBusy(true)
        try { await post('/announcements/refresh'); news.reload() } finally { setBusy(false) }
      }
      const enableOs = async () => {
        setOsError('')
        if (typeof Notification === 'undefined') { setOsError(t('news.osDenied')); return }
        let permission = 'default'
        try { permission = await Notification.requestPermission() } catch { permission = Notification.permission }
        if (permission !== 'granted') { setOsError(t('news.osDenied')); return }
        try { await post('/settings', { notifyOs: true }) } catch { /* server state lags; permission is the gate */ }
        news.reload()
      }
      return h(Panel, null,
        h('div', { className: 'ofm_row' },
          unread > 0 ? h('span', { className: 'ofm_pill strong' }, t('news.unread').replace('{n}', String(unread))) : null,
          news.data?.error ? h('span', { className: 'ofm_pill' }, h('span', { className: 'ofm_dot warn' }), t('news.fetchFailed')) : null,
          h('span', { className: 'ofm_pill' }, `${t('news.lastFetch')}: ${ago(news.data?.fetchedAt, t.locale)}`),
          h('span', { className: 'spacer', style: { marginLeft: 'auto' } }),
          h(Button, { kind: 'ghost', onClick: () => setOpen(value => !value) }, open ? t('news.collapse') : t('news.expand')),
          h(Button, { disabled: busy || news.status !== 'ready', onClick: refresh }, busy ? t('news.refreshing') : t('news.refresh'))),
        open ? h(Fragment, null,
          h('div', { className: 'ofm_row' },
            notifyOs
              ? h('span', { className: 'ofm_pill' }, h('span', { className: 'ofm_dot ok' }), t('news.osOn'))
              : h(Button, { onClick: enableOs }, t('news.osEnable')),
            osError !== '' ? h('span', { className: 'ofm_note' }, osError)
              : notifyOs ? null : h('span', { className: 'ofm_pill' }, h('span', { className: 'ofm_dot' }), t('news.osOff')),
            unread > 0 ? h('span', { style: { marginLeft: 'auto' } }, h(Button, { kind: 'ghost', disabled: busy, onClick: () => ack({ all: true }) }, t('news.allRead'))) : null),
          news.status === 'loading' && news.data === undefined ? h('p', { className: 'ofm_note' }, t('loading')) : null,
          news.status === 'error' ? h('p', { className: 'ofm_note' }, news.error) : null,
          news.status === 'ready' && items.length === 0 ? h('p', { className: 'ofm_note' }, t('news.empty'), ' ', h('span', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, t('news.emptyHint'))) : null,
          h('div', { className: 'ofm_news' }, items.map(item => h(NewsItem, {
            key: item.id, item, t, locale: t.locale, busy,
            onAck: () => ack({ id: item.id }),
          })))) : null)
    }

    function NewsItem(props) {
      const { item, t, locale, busy, onAck } = props
      const body = useMemo(() => parseSafeHtml(item.html ?? ''), [item.html])
      const acknowledged = item.acked === true
      return h('article', { className: 'ofm_newsitem' + (acknowledged ? '' : ' unread') },
        acknowledged ? null : h('span', { className: 'ofm_newsdot', 'aria-hidden': 'true' }),
        h('div', { className: 'ofm_newshead' },
          h('span', { className: 'ofm_level ' + item.level }, t(LEVEL_KEY[item.level] ?? 'level.info')),
          h('span', { className: 'ofm_newstitle' }, item.title),
          acknowledged ? null : h(Button, { kind: 'ghost', disabled: busy, onClick: onAck }, t('news.markRead'))),
        h('div', { className: 'ofm_newsmeta' },
          h('span', null, item.createdAt > 0 ? new Date(item.createdAt).toLocaleDateString() : ''),
          h('span', null, ago(item.createdAt, locale)),
          item.pinned === true ? h('span', null, '📌') : null),
        h('div', { className: 'ofm_newsbody' }, ...htmlToReact(body)),
        item.link?.url ? h('div', null, h('a', { href: item.link.url, target: '_blank', rel: 'noopener noreferrer' }, item.link.label || t('news.link'))) : null)
    }

    // ── in-app upgrade ───────────────────────────────────────────────────────
    function UpgradePanel(props) {
      const { t, settings, onApply, busy } = props
      const status = useAsync(() => api('/update/status'), [])
      const [phase, setPhase] = useState('')
      const [message, setMessage] = useState('')
      const [error, setError] = useState('')
      useEffect(() => {
        const handler = event => {
          const version = event.detail?.version ?? ''
          setPhase('')
          setMessage(version === '' ? '' : t('upgrade.done').replace('{version}', version))
          status.reload()
        }
        window.addEventListener('ofm:upgraded', handler)
        return () => window.removeEventListener('ofm:upgraded', handler)
      }, [status.reload])
      const data = status.data
      const check = async () => {
        setPhase('checking'); setError('')
        try { await post('/update/check'); status.reload() } catch (err) { setError(String(err?.message ?? err)) } finally { setPhase('') }
      }
      const applyUpgrade = async () => {
        setPhase('applying'); setError(''); setMessage(t('upgrade.phase.download'))
        try {
          const result = await post('/update/apply', {})
          // The successor instance has already pushed `upgraded` by the time the
          // request settles; this message only covers a stream that never arrived.
          setMessage(t('upgrade.phase.install'))
          if (result?.version !== undefined) setMessage(t('upgrade.doneRefresh').replace('{version}', result.version))
          status.reload()
        } catch (err) {
          setPhase(''); setMessage('')
          setError(String(err?.message ?? err))
          status.reload()
        }
      }
      const notes = useMemo(() => parseSafeHtml(data?.notes ?? ''), [data?.notes])
      const upToDate = data !== undefined && data.latest !== '' && data.available === false
      return h(Panel, null,
        h('div', { className: 'ofm_upgradecards' },
          h('span', { className: 'ofm_pill strong' }, `${t('upgrade.current')}: ${data?.current || '…'}`),
          data?.latest !== undefined && data.latest !== '' ? h('span', { className: 'ofm_pill' }, `${t('upgrade.latest')}: ${data.latest}`) : null,
          data?.available === true ? h('span', { className: 'ofm_pill' }, h('span', { className: 'ofm_dot warn' }), t('upgrade.available').replace('{version}', data.latest)) : null,
          upToDate ? h('span', { className: 'ofm_pill' }, h('span', { className: 'ofm_dot ok' }), t('upgrade.upToDate')) : null,
          h('span', { className: 'ofm_pill' }, `${t('upgrade.checkedAt')}: ${data?.checkedAt ? ago(data.checkedAt, t.locale) : t('upgrade.never')}`)),
        h('div', { className: 'ofm_row' },
          h(Button, { disabled: phase !== '' || status.status !== 'ready', onClick: check }, phase === 'checking' ? t('upgrade.checking') : t('upgrade.check')),
          data?.available === true ? h(Button, { kind: 'primary', disabled: phase !== '' || data.applying === true, onClick: applyUpgrade }, phase === 'applying' ? t('upgrade.applying') : t('upgrade.apply')) : null),
        phase === 'applying' ? h('div', { className: 'ofm_prog' }, h('i')) : null,
        message !== '' ? h('p', { className: 'ofm_note' }, message) : null,
        error !== '' ? h('div', { className: 'ofm_callout ofm_error' }, t('upgrade.failed').replace('{message}', error)) : null,
        notes.length > 0 ? h('div', { className: 'ofm_sec', style: { gap: 4 } },
          h('span', { className: 'ofm_note' }, t('upgrade.notes')),
          h('div', { className: 'ofm_upnotes ofm_newsbody' }, ...htmlToReact(notes))) : null,
        data?.lastApplied !== undefined ? h('p', { className: 'ofm_note' },
          `${t('upgrade.history')}: ${data.lastApplied.ok === true ? '✓' : '✗'} `,
          t('upgrade.from').replace('{from}', data.lastApplied.from ?? '?'),
          ` → ${data.lastApplied.to ?? '?'} · ${ago(data.lastApplied.at, t.locale)}`,
          data.lastApplied.ok === false && data.lastApplied.error ? ` — ${data.lastApplied.error}` : '') : null,
        h('p', { className: 'ofm_note' }, (settings.updateCheckHours ?? 0) > 0 ? t('upgrade.auto').replace('{n}', String(settings.updateCheckHours)) : t('upgrade.autoOff')),
        h('div', { className: 'ofm_row' },
          h(Button, { onClick: () => { setPhase('reloading'); setMessage(t('upgrade.phase.reload')); post('/reload').catch(() => {}).then(() => { setPhase('') }) } }, phase === 'reloading' ? t('reload.reloading') : t('reload.now')),
          h(Switch, { checked: settings.autoReloadWatch === true, label: t('reload.auto'), onChange: () => onApply({ autoReloadWatch: !(settings.autoReloadWatch === true) }) }),
          h('span', { className: 'ofm_note' }, t('reload.done').replace('{n}', String(settings.reloadCount ?? 0)))))
    }

    // ── settings page ─────────────────────────────────────────────────────────
    function SettingsPage(props) {
      const tagged = props.locale === undefined ? props.t : Object.assign(x => props.t(x), { locale: props.locale })
      const t = tagged
      const [busy, setBusy] = useState(false)
      const [benches, setBenches] = useState({})
      const summary = useAsync(() => api('/summary'), [])
      const stats = useAsync(() => api('/stats'), [])

      const apply = async patch => {
        setBusy(true)
        try {
          await post('/settings', patch)
          summary.reload(); stats.reload()
        } catch (error) {
          // The route can refuse a patch — a routable forward bind, for one — and a
          // rejection nobody shows is a button that appears to do nothing.
          showToast({ title: t('settings.failed'), body: String(error?.message ?? error), tone: 'warn' })
        } finally { setBusy(false) }
      }
      const bench = async model => {
        setBenches(current => ({ ...current, [model.id]: { running: true } }))
        try {
          const result = await post('/bench', { model: model.id, effort: 'deep' })
          setBenches(current => ({ ...current, [model.id]: { running: false, result: t('bench.result').replace('{ttft}', result.ttftMs).replace('{tps}', result.tokensPerSecond ?? '—').replace('{reasoning}', result.reasoningTokens) } }))
        } catch (error) {
          setBenches(current => ({ ...current, [model.id]: { running: false, result: String(error?.message ?? error) } }))
        }
      }

      if (summary.status === 'loading' && summary.data === undefined) return h('div', { className: 'ofm_root' }, h('p', { className: 'ofm_note' }, t('loading')))
      if (summary.status === 'error') {
        return h('div', { className: 'ofm_root' },
          h('div', { className: 'ofm_callout ofm_error' }, h('div', null, h('b', null, t('loadFailed')), h('div', null, summary.error))),
          h('div', null, h(Button, { onClick: () => summary.reload() }, t('retry'))))
      }
      const data = summary.data
      const counts = data.catalog.reduce((acc, m) => ({ ...acc, [m.availability]: (acc[m.availability] ?? 0) + 1 }), {})
      return h('div', { className: 'ofm_root' },
        h('header', { className: 'ofm_hero' },
          h('div', { className: 'ofm_herotop' },
            h('span', { className: 'ofm_logotype' }, t('title')),
            h('div', { className: 'ofm_pills' },
              h(Pill, { strong: true, tone: data.settings.enabled !== false ? 'ok' : 'err' }, data.settings.enabled !== false ? t('pref.enabled') : 'off'),
              h(Pill, { tone: 'ok' }, `${counts.available ?? 0} ${t('state.available')}`),
              (counts['region-blocked'] ?? 0) > 0 ? h(Pill, { tone: 'warn' }, `${counts['region-blocked']} ${t('state.region-blocked')}`) : null,
              (counts.unavailable ?? 0) > 0 ? h(Pill, { tone: 'err' }, `${counts.unavailable} ${t('state.unavailable')}`) : null,
              h(Pill, null, `${t('pref.egress')} ${data.egress?.country ?? data.egress?.ip ?? '—'}`),
              h(Pill, null, `${t('pref.probedAt')} ${ago(data.probedAt, t.locale)}`))),
          h('p', { className: 'ofm_tagline' }, t('subtitle'), ' · ', t('meta.description')),
          h('div', { className: 'ofm_actions' },
            h(Button, { disabled: busy, onClick: async () => { setBusy(true); try { await post('/refresh'); summary.reload(); stats.reload() } finally { setBusy(false) } } }, summary.status === 'loading' ? t('probing') : t('refresh')),
            h(Button, { disabled: busy, onClick: async () => { setBusy(true); try { await post('/reprobe'); summary.reload() } finally { setBusy(false) } } }, t('reprobe')))),
        h(Section, { title: t('section.models'), hint: t('section.modelsHint') }, h(Roster, { summary: data, t: tagged, onBench: bench, benches })),
        h(Section, { title: t('section.news'), hint: t('section.newsHint') }, h(NewsPanel, { t: tagged })),
        h(Section, { title: t('section.dash'), hint: t('section.dashHint') },
          stats.status === 'ready' && stats.data !== undefined ? h(Dashboard, { stats: stats.data, summary: data, t: tagged })
            : h('p', { className: 'ofm_note' }, t('loading'))),
        h(Section, { title: t('section.forward'), hint: t('section.forwardHint') }, h(Forward, { settings: data.settings, t: tagged, onApply: apply, busy })),
        h(Section, { title: t('section.prefs'), hint: t('section.prefsHint') }, h(Preferences, { summary: data, t: tagged, onApply: apply, busy })),
        h(Section, { title: t('section.upgrade'), hint: t('section.upgradeHint') }, h(UpgradePanel, { t: tagged, settings: data.settings, onApply: apply, busy })))
    }

    // ── announcement ──────────────────────────────────────────────────────────
    const PAGES = ['ann.preamble', 'ann.models', 'ann.steps', 'ann.features', 'ann.updates']

    function Announcement(props) {
      const { t, complete, openSection, page, setPage, summary, acknowledged } = props
      useEffect(() => { if (acknowledged) complete() }, [acknowledged, complete])
      /* Not `#root.inert`, even though the shell does that for its own onboarding
         modals: those portal out of `#root`, while a slot-mounted step stays
         inside it, and inert has no opt-out for descendants. Measured with it on,
         `document.elementFromPoint` over the next-page button returned BODY — the
         dialog could not be clicked at all. The full-viewport scrim already
         swallows every pointer event aimed at the app behind it. */
      if (acknowledged) return null
      const last = page === PAGES.length - 1
      const finish = async () => {
        try { await post(`/announcement/ack?version=${encodeURIComponent(summary?.announcementVersion ?? '')}`) } catch { /* ack is best effort */ }
        complete()
      }
      return h('div', { className: 'ofm_scrim' },
        h('div', { className: 'ofm_ann', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('title') },
          h('div', { className: 'ofm_annhead' },
            h('h2', { className: 'ofm_anntitle' }, t('title')),
            h('p', { className: 'ofm_annsub' }, t(PAGES[page]))),
          h('div', { className: 'ofm_steps', 'aria-hidden': 'true' },
            PAGES.map((key, index) => h('span', { key, className: 'ofm_step', 'data-on': index <= page ? 'true' : 'false' }))),
          h('div', { className: 'ofm_annbody' }, h(PageBody, { page, t, summary })),
          h('div', { className: 'ofm_annfoot' },
            h('span', { className: 'ofm_note' }, t('ann.page').replace('{n}', page + 1).replace('{total}', PAGES.length)),
            h('span', { className: 'spacer' }),
            page === 0 ? h(Button, { kind: 'ghost', onClick: finish }, t('ann.later')) : h(Button, { kind: 'ghost', onClick: () => setPage(p => Math.max(0, p - 1)) }, '‹'),
            last
              ? h(Button, { kind: 'primary', onClick: async () => { await finish(); openSection?.('our-free-model') } }, t('ann.openSettings'))
              : h(Button, { kind: 'primary', onClick: () => setPage(p => Math.min(PAGES.length - 1, p + 1)) }, '›'))))
    }

    const list = (t, keys) => keys.map(key => h('li', { key }, t(key)))

    function PageBody(props) {
      const { page, t, summary } = props
      if (page === 0) return h(Fragment, null,
        h('h3', null, t('ann.preamble')),
        h('p', null, t('ann.pitch')),
        h('ul', null, list(t, ['ann.p1', 'ann.p2', 'ann.p3'])))
      if (page === 1) {
        // Advertised models first: this page is the tour a new user reads before
        // they pick anything, and a refused id at the top of it is a bad first
        // impression of a lane that is actually working.
        const rows = (summary?.catalog ?? []).slice().sort((a, b) => (a.route === null ? 1 : 0) - (b.route === null ? 1 : 0))
        if (rows.length === 0) return h('p', null, t('loading'))
        return h(Fragment, null,
          h('h3', null, t('ann.models')),
          h('div', { className: 'ofm_kv' }, rows.slice(0, 8).map(m => h('div', { key: m.id, className: 'ofm_kvc' },
            h('b', null, m.name),
            h('span', null, `${t(`state.${m.availability}`)} · ${m.vision ? t('tag.vision') : t('tag.text')} · ${kilo(m.contextWindow)}`)))),
          rows.some(m => m.availability === 'region-blocked') ? h('p', { className: 'ofm_note' }, t('hint.region')) : null)
      }
      if (page === 2) return h(Fragment, null,
        h('h3', null, t('ann.steps')),
        h('ul', null, list(t, ['ann.s1', 'ann.s2', 'ann.s3', 'ann.s4'])))
      if (page === 3) return h(Fragment, null,
        h('h3', null, t('ann.features')),
        h('ul', null, list(t, ['ann.f1', 'ann.f2', 'ann.f3', 'ann.f4', 'ann.f5'])))
      return h(Fragment, null,
        h('h3', null, t('ann.updates')),
        h('ul', null, list(t, ['ann.u1', 'ann.u2', 'ann.u3', 'ann.u4'])))
    }

    // ── registration ──────────────────────────────────────────────────────────
    // The shell mirrors the active language onto <html lang>, so a render-time
    // read survives a language switch without owning a subscription.
    function localeTag(ctx) {
      try {
        const snapshot = typeof ctx.locale?.getLocale === 'function' ? ctx.locale.getLocale() : ctx.locale?.getSnapshot?.()
        const value = snapshot?.active ?? ctx.locale?.locale
        return typeof value === 'string' ? value : document.documentElement.lang || 'en'
      } catch { return 'en' }
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en }), 'our-free-model: dictionaries')

      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-plugin', 'dsh-our-free-model')
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'our-free-model: styles')

      // ── push subscription ───────────────────────────────────────────────────
      // One EventSource for the whole app surface: new announcements become
      // toasts (and OS notifications when opted in), urgent ones open a modal,
      // update availability and completed upgrades broadcast onto window so
      // whichever panel is mounted can refresh itself. EventSource reconnects
      // by itself; the hot reload closes every stream server-side, so a swap
      // simply shows up as a fresh `hello` a second later.
      ctx.effect(() => {
        if (typeof EventSource !== 'function') return
        let osEnabled = false
        let disposed = false
        let source
        api('/announcements').then(payload => { osEnabled = payload?.notifyOs === true }).catch(() => {})
        const open = () => {
          if (disposed) return
          source = new EventSource(`${API}/events`)
          // 断连保护：服务端不可达时 EventSource 默认无限自动重连（持续占连接池）；
          // 连续失败达到上限 → 关闭停止重连，避免长期占用同源连接。
          let errCount = 0
          source.onopen = () => { errCount = 0 }
          source.onerror = () => {
            errCount += 1
            if (errCount >= 5) { try { source.close() } catch { /* 已关闭 */ } }
          }
          source.addEventListener('announcements', event => {
            errCount = 0
            let data
            try { data = JSON.parse(event.data) } catch { return }
            for (const item of data.items ?? []) {
              osNotify(t('toast.annTitle'), item.title)
              if (item.level === 'urgent') {
                showUrgentModal({
                  title: `${t('news.urgentTitle')} · ${item.title}`,
                  html: item.html ?? '',
                  confirmLabel: t('news.gotIt'),
                  onClose: () => { void post('/announcements/ack', { id: item.id }).catch(() => {}) },
                })
              } else {
                showToast({ title: t('toast.annTitle'), body: item.title, tone: item.level === 'warn' ? 'warn' : undefined })
              }
            }
            window.dispatchEvent(new CustomEvent('ofm:announcements', { detail: data }))
          })
          source.addEventListener('update', event => {
            let data
            try { data = JSON.parse(event.data) } catch { return }
            osNotify(t('toast.updateTitle'), t('toast.updateBody').replace('{latest}', data.latest ?? '').replace('{current}', data.current ?? ''))
            showToast({
              title: t('toast.updateTitle'),
              body: t('toast.updateBody').replace('{latest}', data.latest ?? '').replace('{current}', data.current ?? ''),
              tone: 'warn', holdMs: 14000,
            })
            window.dispatchEvent(new CustomEvent('ofm:update', { detail: data }))
          })
          source.addEventListener('upgraded', event => {
            let data
            try { data = JSON.parse(event.data) } catch { data = {} }
            window.dispatchEvent(new CustomEvent('ofm:upgraded', { detail: data }))
          })
          source.addEventListener('hello', event => {
            let data
            try { data = JSON.parse(event.data) } catch { data = {} }
            window.dispatchEvent(new CustomEvent('ofm:hello', { detail: data }))
          })
        }
        open()
        return () => {
          disposed = true
          try { source?.close() } catch { /* already closed */ }
        }
      }, 'our-free-model: push subscription')

      // A hot reload or in-app upgrade swaps this bundle while the page stays
      // open. The only durable marker across that swap is localStorage, so the
      // successor announces what happened exactly once.
      ctx.effect(() => {
        void (async () => {
          try {
            const meta = await api('/meta')
            const at = Number(meta?.reloadedAt ?? 0)
            if (at <= 0) return
            let seen = ''
            try { seen = window.localStorage?.getItem('ofm.reloadedAt') ?? '' } catch { /* storage unavailable */ }
            if (String(at) === seen) return
            try { window.localStorage?.setItem('ofm.reloadedAt', String(at)) } catch { /* ignore */ }
            showToast({
              title: meta.version !== '' ? `Our Free Model ${meta.version}` : 'Our Free Model',
              body: t('reload.done').replace('{n}', String(meta.reloadCount ?? 0)),
              actions: [{ label: t('reload.refresh'), onClick: () => { try { window.location.reload() } catch { /* top-level navigation refused */ } } }],
              holdMs: 12000,
            })
          } catch { /* backend absent */ }
        })()
        return () => {}
      }, 'our-free-model: reload notice')

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'our-free-model',
        order: 35,
        label: () => t('nav'),
        locale: NS,
      }, props => h(SettingsPage, { ...props, locale: localeTag(ctx) })))

      ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
        name: 'settings.onboarding',
        id: 'our-free-model-announcement',
        order: -50,
        locale: NS,
      }, props => h(AnnouncementGate, { ...props, t: Object.assign(x => t(x), { locale: localeTag(ctx) }) })))
    }
    /**
     * Owns the announcement's readiness.
     *
     * The onboarding coordinator mounts one ordered step at a time and waits for
     * the registrant to either show something or call `complete`. This renders
     * null until the ack state is known — a step that paints a skeleton then
     * removes it is worse than one that waits — and completes immediately when
     * the user already acknowledged the current copy version.
     */
    function AnnouncementGate(props) {
      const { t, complete, openSection, explicit } = props
      const [ack, setAck] = useState(undefined)
      const [summary, setSummary] = useState(undefined)
      const [page, setPage] = useState(0)
      useEffect(() => {
        let alive = true
        api('/announcement')
          .then(payload => { if (alive) setAck(payload) })
          .catch(() => { if (alive) setAck({ acknowledged: true, version: '' }) })
        api('/summary').then(payload => { if (alive) setSummary(payload) }).catch(() => {})
        // 超时兜底：3 秒拿不到 ack（后端挂起/超时/异常）→ 当作已 ack 主动放行——
        // 本组件是 settings.onboarding 协调器最先执行的 step（order:-50），complete 依赖 ack；
        // ack 永远 undefined 会永久卡住 onboarding 流程（连带阻塞后续 step 与主题启动画面）。
        const timer = setTimeout(() => {
          if (alive) setAck(current => current ?? { acknowledged: true, version: '' })
        }, 3000)
        return () => { alive = false; clearTimeout(timer) }
      }, [])
      const acknowledged = ack?.acknowledged === true && explicit !== true
      useEffect(() => {
        if (ack === undefined) return
        if (acknowledged) complete?.()
      }, [ack, acknowledged, complete])
      if (ack === undefined || acknowledged) return null
      return h(Announcement, { t, complete, openSection, page, setPage, summary, acknowledged: false })
    }
    exports.apply = apply
    exports.inject = inject
    exports.name = 'our-free-model'
    // Test seam for scripts/sanitize-test.mjs: the parser runs headlessly with
    // the same stub React the lint script uses.
    exports.__test = { parseSafeHtml, safeUrl, sanitizeStyle, htmlToDom }
    return module.exports
  },
})
