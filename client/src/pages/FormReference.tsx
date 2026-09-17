import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { originLabel, type Crumb } from '../lib/recordNav'
import { RecordTrail } from './WorkspaceKit'

function withHome(crumbs: Crumb[]): Crumb[] {
  const items = crumbs.filter((c) => c.label)
  if (!items.length) return items
  if (items.some((c) => c.to === '/' || c.label === 'Home')) return items
  return [{ to: '/', label: 'Home' }, ...items]
}

function BackLink({ to, state, label }: { to?: string; state?: unknown; label?: string }) {
  if (!to) return null
  return (
    <Link className="ws-back" to={to} state={state}>
      <i className="ri-arrow-left-line" />
      {label || originLabel(to, 'Back')}
    </Link>
  )
}

export function FrPage({ children, fill }: { children: ReactNode; fill?: boolean }) {
  return <div className={`fr${fill ? ' fr-board' : ''}`}>{children}</div>
}

export function FrSheet({ children, min }: { children: ReactNode; min?: boolean }) {
  return <div className={`fr fr-sheet${min ? ' is-min' : ''}`}>{children}</div>
}

export function FrSheetHead({
  title,
  closeTo,
  closeState,
  crumbs,
  children,
}: {
  title: string
  closeTo?: string
  closeState?: unknown
  crumbs?: Crumb[]
  children?: ReactNode
}) {
  const trail = withHome(crumbs?.length ? crumbs : [{ label: title }])
  return (
    <header className="fr-sheet-head">
      <div className="fr-sheet-head-left">
        <BackLink to={closeTo} state={closeState} />
        <RecordTrail crumbs={trail} />
        <h1>{title}</h1>
      </div>
      <div className="fr-sheet-head-tools">
        {children}
        {closeTo ? (
          <Link to={closeTo} state={closeState} className="fr-close" aria-label="Close">
            <i className="ri-close-line" />
          </Link>
        ) : null}
      </div>
    </header>
  )
}

export function FrSheetBody({ children }: { children: ReactNode }) {
  return <div className="fr-sheet-work">{children}</div>
}

export function FrSheetMain({ children }: { children: ReactNode }) {
  return <div className="fr-sheet-main">{children}</div>
}

export function FrFoot({ children }: { children: ReactNode }) {
  return <footer className="fr-foot">{children}</footer>
}

export function FrHeader({
  kicker,
  kickerTo,
  kickerState,
  title,
  count,
  badge,
  crumbs,
  backTo,
  backLabel,
  backState,
  children,
}: {
  kicker?: string
  kickerTo?: string
  kickerState?: unknown
  title: string
  count?: string
  badge?: ReactNode
  crumbs?: Crumb[]
  backTo?: string
  backLabel?: string
  backState?: unknown
  children?: ReactNode
}) {
  const trail = withHome(
    crumbs?.length
      ? crumbs
      : kicker
        ? [{ to: kickerTo, label: kicker, state: kickerState }, { label: title }]
        : [{ label: title }],
  )
  return (
    <header className="fr-head">
      <div>
        <BackLink to={backTo || kickerTo} state={backState || kickerState} label={backLabel} />
        <RecordTrail crumbs={trail} />
        <h1>{title}</h1>
        {badge ? <div className="fr-badge">{badge}</div> : null}
        {count ? (
          <div className="fr-count">
            <i />
            {count}
          </div>
        ) : null}
      </div>
      <div className="fr-toolbar">{children}</div>
    </header>
  )
}

export function FrAcc({ children }: { children: ReactNode }) {
  return <div className="fr-acc">{children}</div>
}

export function FrSection({
  label,
  count,
  children,
}: {
  label: string
  count?: number | string
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <section className={`fr-acc-item${open ? ' is-open' : ''}`}>
      <button type="button" className="fr-acc-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="fr-acc-title">
          <i className="ri-menu-line" aria-hidden />
          {label}
          {count != null ? <em className="fr-acc-count">{count}</em> : null}
        </span>
        <i className={`ri-arrow-down-s-line fr-acc-chevron${open ? ' is-open' : ''}`} aria-hidden />
      </button>
      {open ? <div className="fr-acc-body">{children}</div> : null}
    </section>
  )
}

export function FrGrid({ cols = 4, children }: { cols?: 1 | 2 | 3 | 4; children: ReactNode }) {
  return <div className={`fr-grid fr-cols-${cols}`}>{children}</div>
}

export function FrField({
  label,
  required,
  missing,
  locked,
  mark,
  span,
  view,
  children,
}: {
  label: string
  required?: boolean
  missing?: boolean
  locked?: boolean
  mark?: ReactNode
  span?: 1 | 2 | 3 | 4
  view?: boolean
  children: ReactNode
}) {
  const Tag = view ? 'div' : 'label'
  return (
    <Tag className={`fr-field${span && span > 1 ? ` is-span-${span}` : ''}${missing ? ' is-miss' : ''}${locked ? ' is-locked' : ''}${view ? ' is-view' : ''}`}>
      <span>{label}{required ? ' *' : ''}{mark}</span>
      {view ? <div className="fr-readonly">{children ?? '—'}</div> : children}
    </Tag>
  )
}

export function FrValue({
  label, span, children,
}: {
  label: string
  span?: 1 | 2 | 3 | 4
  children?: ReactNode
}) {
  const empty = children == null || children === ''
  return (
    <FrField label={label} span={span} view>
      {empty ? '—' : children}
    </FrField>
  )
}

export function FrPanel({ children }: { children: ReactNode }) {
  return <div className="fr-panel">{children}</div>
}

export function FrChips({
  items,
  value,
  onChange,
}: {
  items: { label: string; count: number; value: string }[]
  value: string
  onChange: (v: string) => void
}) {
  if (!items.length) return null
  return (
    <div className="fr-chips">
      {items.map((s) => (
        <button
          key={s.value}
          type="button"
          className={`fr-chip${value === s.value ? ' is-on' : ''}`}
          onClick={() => onChange(value === s.value ? '' : s.value)}
        >
          {s.label} <strong>{s.count}</strong>
        </button>
      ))}
    </div>
  )
}

export function FrKpi({
  cards,
}: {
  cards: { label: string; value: string | number; tone?: string; icon?: string }[]
}) {
  return (
    <div className="fr-kpi">
      {cards.map((c) => (
        <div key={c.label} className={`fr-kpi-card ${c.tone || ''}`}>
          {c.icon ? <i className={c.icon} /> : null}
          <b>{c.value}</b>
          <span>{c.label}</span>
        </div>
      ))}
    </div>
  )
}

export function FrPager({
  page, pages, total, onPage, pageSize, unit = 'page',
}: {
  page: number
  pages: number
  total: number
  onPage: (p: number) => void
  pageSize?: number
  unit?: 'page' | 'column'
}) {
  const start = total === 0 ? 0 : (page - 1) * (pageSize || 1) + 1
  const end = pageSize ? Math.min(page * pageSize, total) : total
  const summary = unit === 'column'
    ? `${total} record${total === 1 ? '' : 's'}${pageSize && pages > 1 ? ` · ${pageSize} per column` : ''}`
    : pageSize && total > 0
      ? `Showing ${start}-${end} of ${total}${pages > 1 ? ` · ${pageSize} per page` : ''}`
      : `${total} record${total === 1 ? '' : 's'}`
  return (
    <div className="fr-pager">
      <span>{summary}</span>
      {pages > 1 ? (
        <div className="fr-toolbar">
          <button type="button" className="ws-btn ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
          <span className="fr-page-num">{page} / {pages}</span>
          <button type="button" className="ws-btn ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
        </div>
      ) : null}
    </div>
  )
}

export function FrYesNo({
  value, onChange, disabled,
}: {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="yn" role="group">
      <button type="button" disabled={disabled} className={!value ? 'is-on' : ''} onClick={() => onChange(false)}>No</button>
      <button type="button" disabled={disabled} className={value ? 'is-on is-yes' : ''} onClick={() => onChange(true)}>Yes</button>
    </div>
  )
}

export function FrUpload({
  file,
  existingName,
  missing,
  disabled,
  accept,
  hint,
  onPick,
  onClear,
}: {
  file?: File | null
  existingName?: string
  missing?: boolean
  disabled?: boolean
  accept?: string
  hint?: string
  onPick: (file: File | null) => void
  onClear?: () => void
}) {
  const name = file?.name || existingName || ''
  return (
    <div className={`fr-upload${missing ? ' is-miss' : ''}${disabled ? ' is-off' : ''}`}>
      {name ? (
        <div className="fr-upload-file">
          <i className="ri-attachment-2" />
          <b title={name}>{name}</b>
          {disabled ? null : (
            <button type="button" onClick={() => { onPick(null); onClear?.() }}>Remove</button>
          )}
        </div>
      ) : (
        <label>
          <i className="ri-upload-2-line" />
          <span>Upload document</span>
          <em>{hint || 'PDF, Excel, Word, or image'}</em>
          <input
            type="file"
            hidden
            accept={accept}
            disabled={disabled}
            onChange={(e) => onPick(e.target.files?.[0] || null)}
          />
        </label>
      )}
    </div>
  )
}
