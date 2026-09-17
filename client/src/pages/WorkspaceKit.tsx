import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { NavState } from '../lib/recordNav'

export function initials(name?: unknown) {
  const s = String(name || '').trim()
  if (!s || s === '—') return '?'
  const parts = s.split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

export function ragTone(rag: unknown) {
  const s = String(rag || '').toUpperCase()
  if (s.includes('GREEN') || s.includes('ON TRACK') || s.includes('🟢')) return 'green'
  if (s.includes('AMBER') || s.includes('YELLOW') || s.includes('AT RISK') || s.includes('🟡')) return 'amber'
  if (s.includes('RED') || s.includes('DELAY') || s.includes('🔴')) return 'red'
  return ''
}

export function ragLabel(rag: unknown) {
  const tone = ragTone(rag)
  if (tone === 'green') return 'On Track'
  if (tone === 'amber') return 'At Risk'
  if (tone === 'red') return 'Delayed'
  return ''
}

export function fmt(v: unknown) {
  if (v == null || v === '' || v === 'null') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

export function delayDays(status: unknown, end: unknown) {
  const s = String(status || '').toLowerCase()
  if (s.includes('complete') || s.includes('closed') || s.includes('done') || s.includes('cancel')) return 0
  const stamp = String(end || '')
  const m = stamp.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return 0
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((today.getTime() - due.getTime()) / 86400000)
  return diff > 0 ? diff : 0
}

export function progressPct(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 0 && n <= 1) return Math.round(n * 100)
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function fmtWhen(v: unknown) {
  const raw = String(v || '').trim()
  if (!raw || raw === '—') return '—'
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return fmt(v)
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
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
  const label = ragLabel(value)
  if (!tone || !label) return <span className="ws-muted">—</span>
  const dot = tone === 'green' ? '🟢' : tone === 'amber' ? '🟡' : '🔴'
  return (
    <span className={`ws-rag ${tone}`}>
      <span className="ws-rag-dot" aria-hidden>{dot}</span>
      {label}
    </span>
  )
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
  const label = fmt(value)
  if (label === '—') return <span className="ws-muted">—</span>
  return <span className={`ws-pri ${statusTone(value)}`}>{label}</span>
}

export function OwnerAvatar({ name }: { name?: unknown }) {
  const n = fmt(name)
  if (n === '—') return <span className="fr-ava is-empty" title="Unassigned">—</span>
  return (
    <span className="fr-owner" title={n}>
      <span className="fr-ava">{initials(n)}</span>
    </span>
  )
}

export function ProgressBar({ value }: { value: unknown }) {
  const n = progressPct(value)
  const color = n >= 70 ? '#43A047' : n >= 40 ? '#FB8C00' : '#E53935'
  return (
    <div className="fr-progress">
      <span className="fr-progress-track"><span style={{ width: `${n}%`, background: color }} /></span>
      <b style={{ color }}>{n}%</b>
    </div>
  )
}

export function RecordTrail({ crumbs }: { crumbs: { to?: string; label: string; state?: NavState }[] }) {
  const items = crumbs.filter((c) => c.label)
  if (items.length < 2) return null
  return (
    <nav className="ws-crumbs" aria-label="Record path">
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`} className="ws-crumb">
          {i > 0 ? <i className="ri-arrow-right-s-line" aria-hidden /> : null}
          {c.to && i < items.length - 1 ? <Link to={c.to} state={c.state}>{c.label}</Link> : <b>{c.label}</b>}
        </span>
      ))}
    </nav>
  )
}

export function FormShell({
  backTo, backLabel, backState, title, subtitle, children, crumbs,
}: {
  backTo: string
  backLabel: string
  backState?: NavState
  title: string
  subtitle?: string
  children: ReactNode
  crumbs?: { to?: string; label: string; state?: NavState }[]
}) {
  return (
    <div className="ws">
      <Link className="ws-back" to={backTo} state={backState}><i className="ri-arrow-left-line" />{backLabel}</Link>
      {crumbs?.length ? <RecordTrail crumbs={crumbs} /> : null}
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
  return <span className="ak-rev"><i className="ri-refresh-line" aria-hidden />{n}x</span>
}

export function RevisionLog({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) {
    return <div className="ws-empty">No revisions yet. Opening a record does not count. Changes after save appear here.</div>
  }
  return (
    <div className="ws-audit">
      {rows.map((r) => {
        const changes = Array.isArray(r.changes) ? r.changes as Array<{ label?: string; from?: string; to?: string }> : []
        const n = changes.length
        return (
          <article key={String(r.id || r.revision_no)} className="ws-audit-card">
            <header className="ws-audit-head">
              <span className="ws-audit-no">#{String(r.revision_no)}</span>
              <div className="ws-audit-who">
                <b>Updated by {fmt(r.user_name)}</b>
                <span>{fmtWhen(r.created_at)}</span>
              </div>
              <em>{n} {n === 1 ? 'change' : 'changes'}</em>
            </header>
            <div className="ws-audit-body">
              {changes.length ? changes.map((c, i) => (
                <div key={`${c.label}-${i}`} className="ws-audit-change">
                  <p>{c.label || 'Field'}</p>
                  <div className="ws-audit-vals">
                    <div>
                      <small>Previous</small>
                      <span className="from">{c.from || '—'}</span>
                    </div>
                    <i className="ri-arrow-right-line" />
                    <div>
                      <small>Updated</small>
                      <span className="to">{c.to || '—'}</span>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="ws-audit-change">
                  <p>Record</p>
                  <div className="ws-audit-vals">
                    <div><small>Previous</small><span className="from">—</span></div>
                    <i className="ri-arrow-right-line" />
                    <div><small>Updated</small><span className="to">Saved with no field diffs</span></div>
                  </div>
                </div>
              )}
            </div>
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
  backTo, backLabel, backState, kicker, code, title, subtitle, actions, people, metrics, progress, crumbs,
}: {
  backTo: string
  backLabel: string
  backState?: NavState
  kicker: string
  code?: string
  title: string
  subtitle?: string
  actions: ReactNode
  people?: ReactNode
  metrics?: { label: string; value: ReactNode; icon?: string }[]
  progress?: { label: string; pct: number }
  crumbs?: { to?: string; label: string; state?: NavState }[]
}) {
  return (
    <div className="ws-hero">
      <Link className="ws-back" to={backTo} state={backState}><i className="ri-arrow-left-line" />{backLabel}</Link>
      {crumbs?.length ? <RecordTrail crumbs={crumbs} /> : null}
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
