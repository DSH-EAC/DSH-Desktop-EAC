/**
 * The EAC pack installer page.
 *
 * It mounts into the official settings shell through the `settings.section`
 * slot — the shell owns the navigation, the page frame and the styling tokens;
 * this file only fills the page. The wordmark in the header is a small text
 * element (`EAC_WORDMARK`), because M5 does no asset-collection work.
 *
 * Deliberate boundary: sign-in is *not* reimplemented here. The result panel
 * ends at a step that points the user at the official DeepSeek account page, so
 * a signed-in account carries model use with no API key and the plugin never
 * sees a credential. The confirmation UI is this plugin's own minimal panel;
 * swapping it for the official primitives is an adapter-boundary task that
 * waits on the pinned source and licence audit.
 *
 * @module client/section
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import type { CatalogResult, InstallProgress, InstallResultView, OfficialHostSeam, PackView } from '../protocol.ts'
import { createSelection, toggleComponent, toInstallRequest, type SelectionState } from '../core/selection.ts'
import { buildPackCard, installStateLabel, packCardSubtitle, type ComponentRowView, type PackCardView } from './view-model.ts'
import type { MessageKey } from './messages.ts'

/** Translator the section renders with. */
export type Translate = (key: MessageKey | string, parameters?: Record<string, unknown>) => string

/** Remote result envelope, as the client Remote layer returns it. */
export type RemoteResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

/** The installer's Remote namespace, as the section calls it. */
export interface InstallerRemote {
  catalog(): Promise<RemoteResult<CatalogResult>>
  install(request: unknown): Promise<RemoteResult<{ requestId: string }>>
  progress(requestId: string): Promise<RemoteResult<InstallProgress>>
  result(requestId: string): Promise<RemoteResult<InstallResultView>>
  cancel(requestId: string): Promise<RemoteResult<{ status: string }>>
  hostSeam(): Promise<RemoteResult<OfficialHostSeam>>
}

/** Props the wiring passes to the section. */
export interface SectionProps {
  readonly remote: InstallerRemote
  readonly t: Translate
}

const BADGE_COLORS: Record<string, string> = {
  L1: 'var(--dsw-alias-state-success-primary, #4caf7d)',
  L2: 'var(--dsw-alias-state-warning-primary, #d9a441)',
  L3: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.7))'
}

const CSS_ID = '@dsh-eac/pack-installer/section.css'

function ensureStyles(): void {
  if (typeof document === 'undefined' || document.querySelector(`style[data-plugin-css="${CSS_ID}"]`) !== null) return
  const style = document.createElement('style')
  style.dataset.plugin = '@dsh-eac/pack-installer'
  style.dataset.pluginCss = CSS_ID
  style.textContent = `
.eacpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
@media (width <= 680px) { .eacpi-grid { grid-template-columns: minmax(0, 1fr); } }
.eacpi-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
.eacpi-row[data-selectable="false"] { cursor: default; opacity: .75; }
.eacpi-row:hover[data-selectable="true"] { background: color-mix(in srgb, currentColor 6%, transparent); }
.eacpi-row input { margin: 0; flex: none; }
.eacpi-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eacpi-meta { font-size: 11px; opacity: .7; flex: none; }
.eacpi-actions { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
`
  document.head.appendChild(style)
}

function Badge({ text, color }: { text: string; color: string }): React.ReactElement {
  return (
    <span
      style={{
        fontSize: 11,
        padding: '1px 8px',
        borderRadius: 8,
        border: '1px solid currentColor',
        color,
        whiteSpace: 'nowrap',
        flex: 'none'
      }}
    >
      {text}
    </span>
  )
}

const STEP_STATE_LABEL: Record<string, string> = {
  pending: '待安装',
  installing: '安装中',
  installed: '已安装',
  enabled: '已启用',
  disabled: '已安装·未启用',
  skipped: '已跳过',
  failed: '失败'
}

function ComponentRow({
  row,
  onToggle
}: {
  readonly row: ComponentRowView
  readonly onToggle: (id: string) => void
}): React.ReactElement {
  return (
    <label className="eacpi-row" data-selectable={String(row.selectable)} data-tier={row.tier}>
      <input
        type="checkbox"
        checked={row.selected}
        disabled={!row.selectable}
        onChange={() => onToggle(row.id)}
        aria-label={row.name}
      />
      <span className="eacpi-name" title={`${row.name}@${row.version} — ${row.tierSourceLabel}`}>
        {row.name}
      </span>
      {row.required ? <Badge text="必需" color="var(--dsw-alias-label-tertiary, rgba(128,128,128,0.7))" /> : null}
      <Badge text={row.tierLabel} color={BADGE_COLORS[row.tier] ?? 'currentColor'} />
      {row.installable ? null : <Badge text="暂不可安装" color={BADGE_COLORS['L3'] as string} />}
      {row.state !== null ? (
        <span className="eacpi-meta">
          {STEP_STATE_LABEL[row.state] ?? row.state}
          {row.message !== null ? ` · ${row.message}` : ''}
        </span>
      ) : (
        <span className="eacpi-meta">{row.version}</span>
      )}
    </label>
  )
}

function PackCard({
  card,
  onToggle,
  onConfirm,
  busy
}: {
  readonly card: PackCardView
  readonly onToggle: (packId: string, componentId: string) => void
  readonly onConfirm: (packId: string) => void
  readonly busy: boolean
}): React.ReactElement {
  return (
    <section
      data-pack={card.id}
      style={{
        border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))',
        borderRadius: 12,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{card.name}</strong>
        <Badge text={card.categoryLabel} color="var(--dsw-alias-label-secondary, currentColor)" />
        <span className="eacpi-meta">{card.version}</span>
      </header>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{card.description}</p>
      <p className="eacpi-meta" style={{ margin: 0 }}>
        {packCardSubtitle(card)} · {card.locked ? '已锁定' : '未锁定'}
      </p>
      <div>{card.rows.map((row) => <ComponentRow key={row.id} row={row} onToggle={(id) => onToggle(card.id, id)} />)}</div>
      <div className="eacpi-actions">
        <button type="button" disabled={busy || card.summary.installable === 0} onClick={() => onConfirm(card.id)}>
          {busy ? '正在安装…' : `安装所选（${card.summary.installable}）`}
        </button>
      </div>
    </section>
  )
}

/**
 * The settings page.
 * @param props - the Remote namespace and translator supplied by the wiring.
 * @returns the page element.
 */
export function PackInstallerSection({ remote, t }: SectionProps): React.ReactElement {
  const [catalog, setCatalog] = useState<CatalogResult | null>(null)
  const [selections, setSelections] = useState<Record<string, SelectionState>>({})
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  const [result, setResult] = useState<InstallResultView | null>(null)
  const [seam, setSeam] = useState<OfficialHostSeam | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(ensureStyles, [])

  const load = useCallback(async () => {
    setError(null)
    const answer = await remote.catalog()
    if (!answer.ok) {
      setError(answer.error.message)
      return
    }
    setCatalog(answer.value)
    setSelections(Object.fromEntries(answer.value.snapshot.packs.map((pack: PackView) => [pack.id, createSelection(pack)])))
  }, [remote])

  useEffect(() => {
    void load()
    void remote.hostSeam().then((answer) => {
      if (answer.ok) setSeam(answer.value)
    })
  }, [load, remote])

  // Poll while a run is in flight; the engine is the single source of truth.
  useEffect(() => {
    if (progress === null || progress.state !== 'running') return
    const timer = setInterval(() => {
      void remote.progress(progress.requestId).then((answer) => {
        if (!answer.ok) return
        setProgress(answer.value)
        if (answer.value.state !== 'running') void remote.result(answer.value.requestId).then((settled) => {
          if (settled.ok) setResult(settled.value)
        })
      })
    }, 500)
    return () => clearInterval(timer)
  }, [progress, remote])

  const cards = useMemo(() => {
    if (catalog === null) return []
    return catalog.snapshot.packs.map((pack: PackView) => buildPackCard(pack, selections[pack.id] ?? createSelection(pack), progress))
  }, [catalog, selections, progress])

  const onToggle = useCallback(
    (packId: string, componentId: string) => {
      if (catalog === null) return
      const pack = catalog.snapshot.packs.find((candidate: PackView) => candidate.id === packId)
      if (pack === undefined) return
      setSelections((current) => ({
        ...current,
        [packId]: toggleComponent(current[packId] ?? createSelection(pack), pack, componentId)
      }))
    },
    [catalog]
  )

  const onConfirm = useCallback(
    async (packId: string) => {
      if (catalog === null) return
      const pack = catalog.snapshot.packs.find((candidate: PackView) => candidate.id === packId)
      if (pack === undefined) return
      setBusy(true)
      setError(null)
      try {
        const request = toInstallRequest(pack, selections[packId] ?? createSelection(pack))
        const accepted = await remote.install(request)
        if (!accepted.ok) {
          setError(accepted.error.message)
          return
        }
        setResult(null)
        const first = await remote.progress(accepted.value.requestId)
        if (first.ok) setProgress(first.value)
      } catch (failure) {
        setError(`${t('installFailed')}：${failure instanceof Error ? failure.message : String(failure)}`)
      } finally {
        setBusy(false)
      }
    },
    [catalog, remote, selections, t]
  )

  const state = installStateLabel(progress)

  return (
    <div data-eacpi="section" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{t('title')}</h3>
        {/* Small text wordmark: no collected asset, no official brand asset. */}
        <span
          data-eacpi="wordmark"
          style={{
            fontSize: 11,
            letterSpacing: 1,
            padding: '1px 6px',
            borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))',
            opacity: 0.85
          }}
        >
          {seam?.wordmark ?? 'DSH·EAC'}
        </span>
        <button type="button" onClick={() => void load()}>
          {t('refresh')}
        </button>
      </header>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{t('subtitle')}</p>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{t('credentials')}</p>

      {catalog === null ? <p>{t('loading')}</p> : null}
      {catalog?.source === 'snapshot' ? (
        <p data-eacpi="source" style={{ margin: 0, fontSize: 12 }}>
          {catalog.degraded ? t('degraded') : t('offline')}
          {catalog.warnings.length > 0 ? ` — ${catalog.warnings.join('; ')}` : ''}
        </p>
      ) : null}
      {error !== null ? <p style={{ margin: 0, color: 'var(--dsw-alias-state-error-primary, #d9534f)' }}>{error}</p> : null}

      <div className="eacpi-grid">
        {cards.map((card) => (
          <PackCard key={card.id} card={card} onToggle={onToggle} onConfirm={onConfirm} busy={busy} />
        ))}
      </div>

      {progress !== null ? (
        <section data-eacpi="progress" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <strong>{t('progress')}：{state.label}</strong>
          <span className="eacpi-meta">{state.detail}</span>
          <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12 }}>
            {progress.steps.map((step) => (
              <li key={step.componentId}>
                {step.name} — {STEP_STATE_LABEL[step.state] ?? step.state}
                {step.enabled === null ? '（启用状态未知）' : step.enabled ? '（已启用）' : '（未启用）'}
                {step.message !== null ? ` · ${step.message}` : ''}
              </li>
            ))}
          </ul>
          {progress.state === 'running' ? (
            <div className="eacpi-actions">
              <button type="button" onClick={() => void remote.cancel(progress.requestId)}>
                {t('cancel')}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {result !== null ? (
        <section data-eacpi="result" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <strong>{t('followUp')}</strong>
          <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12 }}>
            {result.steps.map((step) => (
              <li key={step.kind} data-surface={step.target ?? 'none'}>
                <strong>{step.label}</strong> — {step.detail}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {seam !== null ? (
        <footer className="eacpi-meta" data-eacpi="seam">
          {t('transport')}：{seam.manager === 'pluginManager' ? t('transportManager') : t('transportCli')}
          {seam.installUi === null ? '' : ' · 插件开关请在官方「插件」设置中管理'}
        </footer>
      ) : null}
    </div>
  )
}
