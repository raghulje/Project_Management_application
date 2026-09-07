import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function initials(name?: unknown) {
  const s = String(name || '').trim()
  if (!s || s === '—') return '?'
  const parts = s.split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

export function ragTone(rag: unknown) {
  const s = String(rag || '').toUpperCase()
  if (s.includes('GREEN')) return 'green'
  if (s.includes('AMBER') || s.includes('YELLOW')) return 'amber'
  if (s.includes('RED')) return 'red'
  return ''
}

export function fmt(v: unknown) {
  if (v == null || v === '' || v === 'null') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

export function PersonChip({ label, name }: { label: string; name?: unknown }) {
  const n = fmt(name)
  if (n === '—') return null
  return (
    <span className="ws-chip">
      <span className="ws-ava">{initials(n)}</span>
      <span><em>{label}</em> {n}</span>
    </span>
  )
}

export function Rag({ value }: { value: unknown }) {
  const tone = ragTone(value)
  return <span className={`ws-rag ${tone}`}>{fmt(value)}</span>
}

export function statusTone(status: unknown) {
  const s = String(status || '').toLowerCase()
  if (s.includes('complete') || s.includes('closed') || s.includes('done')) return 'done'
  if (s.includes('hold') || s.includes('block') || s.includes('cancel')) return 'hold'
  if (s.includes('progress') || s.includes('review') || s.includes('active')) return 'run'
  if (s.includes('open') || s.includes('todo') || s.includes('new')) return 'open'
  return ''
}

export function StatusPill({ value }: { value: unknown }) {
  return <span className={`ws-pri ${statusTone(value)} ${String(value || '')}`}>{fmt(value)}</span>
}

export function FormShell({
  backTo, backLabel, title, subtitle, children,
}: {
  backTo: string
  backLabel: string
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="ws">
      <Link className="ws-back" to={backTo}><i className="ri-arrow-left-line" />{backLabel}</Link>
      <div className="ws-hero" style={{ paddingBottom: 20, marginBottom: 14 }}>
        <div className="ws-kicker">Workspace</div>
        <h1 className="ws-title">{title}</h1>
        {subtitle ? <p className="ws-sub">{subtitle}</p> : null}
      </div>
      <div className="ws-panel">{children}</div>
    </div>
  )
}

export function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ws-kv">
      <span>{label}</span>
      <b>{children || '—'}</b>
    </div>
  )
}

export function RevBadge({ count }: { count: unknown }) {
  const n = Number(count || 0)
  if (!n) return <span className="ak-rev is-none">—</span>
  return <span className="ak-rev">{n}x</span>
}

export function RevisionLog({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) {
    return <div className="ws-empty">No revisions yet. Opening a record does not count. Changes after save appear here.</div>
  }
  return (
    <div className="ws-rev">
      {rows.map((r) => {
        const changes = Array.isArray(r.changes) ? r.changes as Array<{ label?: string; from?: string; to?: string }> : []
        return (
          <article key={String(r.id || r.revision_no)} className="ws-rev-card">
            <header>
              <b>Revision {String(r.revision_no)}</b>
              <span>{fmt(r.created_at)} · {fmt(r.user_name)}</span>
            </header>
            <ul>
              {changes.length ? changes.map((c, i) => (
                <li key={`${c.label}-${i}`}>
                  <em>{c.label || 'Field'}</em>
                  <span className="from">{c.from || '—'}</span>
                  <i className="ri-arrow-right-line" />
                  <span className="to">{c.to || '—'}</span>
                </li>
              )) : (
                <li><em>Record</em><span className="from">—</span><i className="ri-arrow-right-line" /><span className="to">Updated</span></li>
              )}
            </ul>
          </article>
        )
      })}
    </div>
  )
}

export function MetaBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ws-block">
      <h3>{title}</h3>
      <div className="ws-grid">{children}</div>
    </div>
  )
}

export function RecordHero({
  backTo, backLabel, kicker, code, title, subtitle, actions, people, metrics, progress,
}: {
  backTo: string
  backLabel: string
  kicker: string
  code?: string
  title: string
  subtitle?: string
  actions: ReactNode
  people?: ReactNode
  metrics?: { label: string; value: ReactNode; icon?: string }[]
  progress?: { label: string; pct: number }
}) {
  return (
    <div className="ws-hero">
      <Link className="ws-back" to={backTo}><i className="ri-arrow-left-line" />{backLabel}</Link>
      <div className="ws-hero-top">
        <div>
          <div className="ws-kicker">
            {kicker}
            {code ? <span className="ws-code">{code}</span> : null}
          </div>
          <h1 className="ws-title">{title}</h1>
          {subtitle ? <p className="ws-sub">{subtitle}</p> : null}
          {people ? <div className="ws-people">{people}</div> : null}
        </div>
        <div className="ws-actions">{actions}</div>
      </div>
      {metrics?.length ? (
        <div className="ws-metrics">
          {metrics.map((m) => (
            <div key={m.label} className="ws-metric">
              {m.icon ? <i className={m.icon} /> : null}
              <span>{m.label}</span>
              <b>{m.value}</b>
            </div>
          ))}
        </div>
      ) : null}
      {progress ? (
        <div className="ws-progress">
          <div className="ws-progress-top">
            <span>{progress.label}</span>
            <span>{progress.pct}%</span>
          </div>
          <div className="ws-bar"><i style={{ width: `${Math.max(0, Math.min(100, progress.pct))}%` }} /></div>
        </div>
      ) : null}
    </div>
  )
}

export function Tabs({
  tabs, value, onChange,
}: {
  tabs: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="ws-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" className={`ws-tab${value === t.id ? ' is-on' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
