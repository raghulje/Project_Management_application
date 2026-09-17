import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { initials } from './WorkspaceKit'

export type StatusHit = { by?: string; at?: string }
export type StatusChange = { field?: string; label?: string; to?: string }
export type StatusRevision = { user_name?: string; created_at?: string; changes?: StatusChange[] }

const PIPELINE = ['Start', 'Open', 'In Progress', 'Completed', 'Closed'] as const

function when(ts?: string) {
  if (!ts) return ''
  const d = new Date(String(ts).includes('T') ? ts : String(ts).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(ts)
  return d.toLocaleString([], { day: '2-digit', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function canon(status: string) {
  const s = String(status || '').trim().toLowerCase()
  if (!s || s === 'draft' || s === 'start') return 'Start'
  if (s.includes('progress') || s.includes('review')) return 'In Progress'
  if (s.includes('hold') || s.includes('block')) return 'On Hold'
  if (s.includes('cancel')) return 'Cancelled'
  if (s.includes('complete') || s.includes('done')) return 'Completed'
  if (s.includes('close')) return 'Closed'
  if (s.includes('open') || s.includes('todo') || s.includes('new')) return 'Open'
  return String(status || 'Open')
}

function hitsFromRevisions(revisions: StatusRevision[]) {
  const map: Record<string, StatusHit> = {}
  for (const row of [...revisions].reverse()) {
    for (const change of row.changes || []) {
      const field = String(change.field || change.label || '').toLowerCase()
      if (field !== 'status' && field !== 'workflow_status' && field !== 'workflow status') continue
      const key = canon(String(change.to || ''))
      map[key] = { by: row.user_name, at: row.created_at }
    }
  }
  return map
}

type Step = {
  key: string
  title: string
  state: 'done' | 'current' | 'todo' | 'skipped'
  badge: string
  by?: string
  at?: string
}

function buildSteps(opts: {
  status: string
  saved: boolean
  createdBy?: string
  createdAt?: string
  revisions?: StatusRevision[]
}): Step[] {
  const current = canon(opts.status)
  const hits = hitsFromRevisions(opts.revisions || [])
  const startHit: StatusHit = { by: opts.createdBy, at: opts.createdAt }
  const names = [...PIPELINE]
  if (current === 'On Hold' && !names.includes('On Hold')) names.splice(2, 0, 'On Hold')
  if (current === 'Cancelled') names.splice(Math.max(1, names.indexOf('Open') + 1), 0, 'Cancelled')

  const currentIdx = names.findIndex((n) => n === current)
  const activeIdx = opts.saved ? (currentIdx < 0 ? 1 : currentIdx) : 0

  return names.map((title, idx) => {
    let state: Step['state'] = 'todo'
    let badge = 'Not started'
    if (current === 'Cancelled' && title !== 'Start' && title !== 'Cancelled') {
      state = idx < activeIdx ? 'done' : 'skipped'
      badge = state === 'done' ? 'Completed' : 'Skipped'
    } else if (idx < activeIdx) {
      state = 'done'
      badge = 'Completed'
    } else if (idx === activeIdx) {
      state = current === 'Completed' || current === 'Closed' ? 'done' : 'current'
      badge = state === 'done' ? 'Completed' : (opts.saved ? 'In progress' : 'Not started')
      if (!opts.saved && title === 'Start') {
        state = 'current'
        badge = 'In progress'
      }
    }
    const hit = title === 'Start' ? (hits.Start || startHit) : hits[title]
    const showPeople = state === 'done' || state === 'current'
    return {
      key: title,
      title,
      state,
      badge,
      by: showPeople ? (hit?.by || (title === 'Start' || state === 'current' ? opts.createdBy : '')) : undefined,
      at: showPeople ? (hit?.at || (title === 'Start' ? opts.createdAt : '')) : undefined,
    }
  })
}

function StepIcon({ state }: { state: Step['state'] }) {
  if (state === 'done') return <i className="ri-check-line" aria-hidden />
  if (state === 'current') return <i className="ri-loader-4-line" aria-hidden />
  if (state === 'skipped') return <i className="ri-share-forward-line" aria-hidden />
  return <i className="ri-time-line" aria-hidden />
}

function Timeline({ steps, wide }: { steps: Step[]; wide?: boolean }) {
  return (
    <ol className={`st-line${wide ? ' is-wide' : ''}`}>
      {steps.map((step) => (
        <li key={step.key} className={`st-step is-${step.state}`}>
          <span className="st-dot"><StepIcon state={step.state} /></span>
          <div className="st-card">
            <div className="st-card-top">
              <b>{step.title}</b>
              <em className={`st-badge is-${step.state}`}>{step.badge}</em>
            </div>
            {step.by ? (
              <div className="st-who">
                <span className="ws-ava">{initials(step.by)}</span>
                <span>
                  {step.by}
                  {step.at ? <small>{when(step.at)}</small> : null}
                </span>
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

export default function StatusTracker({
  status,
  saved = false,
  createdBy,
  createdAt,
  revisions,
}: {
  status: string
  saved?: boolean
  createdBy?: string
  createdAt?: string
  revisions?: StatusRevision[]
}) {
  const [open, setOpen] = useState(false)
  const steps = useMemo(
    () => buildSteps({ status, saved, createdBy, createdAt, revisions }),
    [status, saved, createdBy, createdAt, revisions],
  )
  const done = steps.filter((s) => s.state === 'done').length
  const pct = Math.round((done / Math.max(1, steps.length)) * 100)

  return (
    <div className="st">
      <div className="tc-panel-h">
        <b>Status Tracker</b>
        <button type="button" className="tc-showall" onClick={() => setOpen(true)}>Show all</button>
      </div>
      <p className="st-pct">{pct}% complete</p>
      <Timeline steps={steps} />
      {open && typeof document !== 'undefined'
        ? createPortal(
          <div className="st-modal" role="dialog" aria-label="Status" onClick={() => setOpen(false)}>
            <div className="st-modal-card" onClick={(e) => e.stopPropagation()}>
              <header>
                <h2>Status</h2>
                <button type="button" className="fr-close" aria-label="Close" onClick={() => setOpen(false)}>
                  <i className="ri-close-line" />
                </button>
              </header>
              <div className="st-modal-body">
                <Timeline steps={steps} wide />
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  )
}
