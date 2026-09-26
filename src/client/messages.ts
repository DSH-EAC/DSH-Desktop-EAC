/**
 * Settings-section dictionaries.
 *
 * @module client/messages
 */

/** Message catalogue keyed by locale. */
export const MESSAGES = {
  en: {
    nav: 'EAC Packs',
    title: 'EAC integration packs',
    subtitle: 'Browse EAC / Mojobox packs, choose the components to install, and install them through the DSH plugin manager.',
    offline: 'Offline: using the embedded catalog snapshot',
    degraded: 'Online catalog unavailable — fell back to the embedded snapshot',
    loading: 'Loading the catalog…',
    reload: 'Reload',
    refresh: 'Refresh',
    components: 'Components',
    install: 'Install selected',
    installing: 'Installing…',
    cancel: 'Cancel',
    confirm: 'Confirm installation',
    confirmHint: 'Untick anything you do not want. Tier decides whether a component is enabled after install.',
    required: 'Required',
    notInstallable: 'Not installable yet',
    selectableHint: 'Click a row to include or exclude it',
    locked: 'Locked (Pack Lock)',
    unlocked: 'Not locked (draft / source-pending)',
    derived: 'Derived view',
    progress: 'Progress',
    result: 'Result',
    followUp: 'Next steps',
    credentials: 'Sign-in and credentials stay with the official DeepSeek account page. This plugin never asks for an API key.',
    transport: 'Install transport',
    transportManager: 'DSH plugin manager (reports enablement)',
    transportCli: 'dsh plugin CLI (cannot report enablement)',
    noCatalog: 'The catalog is empty.',
    installFailed: 'Could not start the installation'
  },
  zh: {
    nav: 'EAC 整合包',
    title: 'EAC 整合包',
    subtitle: '浏览 EAC / Mojobox 整合包，勾选要安装的组件，通过 DSH 插件管理器完成安装。',
    offline: '离线：使用内嵌目录快照',
    degraded: '在线目录不可用——已回退到内嵌快照',
    loading: '正在读取目录…',
    reload: '重新读取',
    refresh: '刷新',
    components: '组件',
    install: '安装所选',
    installing: '正在安装…',
    cancel: '取消',
    confirm: '确认安装',
    confirmHint: '取消勾选即可排除；分级决定安装后是否启用。',
    required: '必需',
    notInstallable: '暂不可安装',
    selectableHint: '点击行以勾选或取消',
    locked: '已锁定（Pack Lock）',
    unlocked: '未锁定（draft / source-pending）',
    derived: '派生视图',
    progress: '进度',
    result: '结果',
    followUp: '后续步骤',
    credentials: '登录与凭据由官方 DeepSeek 账号页面持有，本插件不会索取 API Key。',
    transport: '安装通道',
    transportManager: 'DSH 插件管理器（可回读启用状态）',
    transportCli: 'dsh plugin CLI（无法回读启用状态）',
    noCatalog: '目录为空。',
    installFailed: '无法开始安装'
  }
} as const

/** Locale namespaces this plugin owns. */
export const LOCALE_KEYS = Object.keys(MESSAGES) as readonly ('en' | 'zh')[]

/** Message keys, derived from the English catalogue. */
export type MessageKey = keyof (typeof MESSAGES)['en']
