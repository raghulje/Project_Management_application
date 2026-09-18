import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useDebounced } from '../lib/useDebounced'
import { StatusPill } from './WorkspaceKit'
import { Alert } from './AdminKit'
import { FrHeader, FrPage, FrPager, FrPanel } from './FormReference'

type Channel = 'email' | 'activity'

type EmailLog = {
  id: number
  email_type: string
  status: string
  project_code?: string | null
  task_code?: string | null
  to_addresses?: string
  cc_addresses?: string | null
  subject?: string
  error_message?: string | null
  created_at?: string
  sent_at?: string | null
  message_id?: string | null
  meta_json?: unknown
}

type ActivityLog = {
  id: number
  userId?: number | null
  userEmail: string
  userName: string
  action: string
  itemType: string
  itemId?: number | null
  note: string
  ipAddress: string
  userAgent: string
  resource: string
  method: string
  meta?: Record<string, unknown> | null
  createdAt?: string
}

const PAGE_SIZE = 40

const EMAIL_TYPE_LABELS: Record<string, string> = {
  'project.created': 'Project created',
  'project.updated': 'Project updated',
  'project.deleted': 'Project deleted',
  'project.reopened': 'Project reopened',
  'task.created': 'Task created',
  'task.updated': 'Task updated',
  'task.deleted': 'Task deleted',
  'task.overdue': 'Task overdue',
  'task.reopened': 'Task reopened',
  'subtask.created': 'Subtask created',
  'subtask.updated': 'Subtask updated',
  'subtask.deleted': 'Subtask deleted',
  'subtask.overdue': 'Subtask overdue',
  'subtask.reopened': 'Subtask reopened',
  smtp_test: 'SMTP test',
  generic: 'Other',
}

const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  login: 'Login',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  reopen: 'Re-open',
  password_reset: 'Password reset',
  password_reset_request: 'Reset requested',
}

function typeLabel(code: string) {
  return EMAIL_TYPE_LABELS[code] || code.replace(/[._]/g, ' ')
}

function actionLabel(code: string) {
  return ACTIVITY_ACTION_LABELS[code] || code.replace(/[._]/g, ' ')
}

function when(value?: string | null) {
  if (!value) return '—'
  return String(value).replace('T', ' ').slice(0, 19)
}

function itemHref(itemType?: string | null, itemId?: number | null) {
  if (!itemType || !itemId) return ''
  if (itemType === 'project') return `/projects/${itemId}`
  if (itemType === 'task') return `/tasks/${itemId}`
  if (itemType === 'subtask') return `/subtasks/${itemId}`
  if (itemType === 'employee') return `/employees/${itemId}`
  if (itemType === 'user') return `/users`
  return ''
}

export function EmailLogsPage() {
  const [channel, setChannel] = useState<Channel>('email')
  const [emailRows, setEmailRows] = useState<EmailLog[]>([])
  const [activityRows, setActivityRows] = useState<ActivityLog[]>([])
  const [emailTypes, setEmailTypes] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const search = useDebounced(q)
  const [status, setStatus] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [retriggerRow, setRetriggerRow] = useState<EmailLog | null>(null)
  const [extraTo, setExtraTo] = useState('')
  const [retriggering, setRetriggering] = useState(false)

  async function load() {
    try {
      if (channel === 'email') {
        const r = await api<{ rows: EmailLog[]; total: number; types?: string[] }>(
          `/admin/email-logs?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&emailType=${encodeURIComponent(typeFilter)}&page=${page}&limit=${PAGE_SIZE}`,
        )
        setEmailRows(r.rows || [])
        setActivityRows([])
        setTotal(r.total || 0)
        if (r.types?.length) setEmailTypes(r.types)
      } else {
        const r = await api<{ rows: ActivityLog[]; total: number }>(
          `/admin/activity-logs?search=${encodeURIComponent(search)}&action=${encodeURIComponent(typeFilter)}&page=${page}&limit=${PAGE_SIZE}`,
        )
        setActivityRows(r.rows || [])
        setEmailRows([])
        setTotal(r.total || 0)
      }
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load logs')
      setEmailRows([])
      setActivityRows([])
      setTotal(0)
    }
  }

  useEffect(() => { void load() }, [search, status, typeFilter, page, channel])
  useEffect(() => { setPage(1); setOpen(null) }, [search, status, typeFilter, channel])

  async function retrigger() {
    if (!retriggerRow) return
    setRetriggering(true)
    try {
      await api(`/admin/email-logs/${retriggerRow.id}/retrigger`, { method: 'POST', json: { extraTo } })
      setMsg(`Retriggered #${retriggerRow.id}`)
      setRetriggerRow(null)
      setExtraTo('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Retrigger failed')
    } finally {
      setRetriggering(false)
    }
  }

  function switchChannel(next: Channel) {
    setChannel(next)
    setStatus('')
    setTypeFilter('')
    setQ('')
    setMsg('')
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, pages)
  const typeOptions = useMemo(() => {
    if (channel === 'activity') return ACTIVITY_ACTION_LABELS
    const out: Record<string, string> = { ...EMAIL_TYPE_LABELS }
    for (const t of emailTypes) if (!out[t]) out[t] = typeLabel(t)
    return out
  }, [channel, emailTypes])

  return (
    <FrPage>
      <FrHeader
        crumbs={[{ to: '/admin', label: 'Admin' }, { label: 'Notification logs' }]}
        title="Notification logs"
        count={`${total} ${channel === 'email' ? 'email' : 'activity'} records`}
      >
        <input
          className="fr-search"
          placeholder={channel === 'email' ? 'Subject, recipient, project…' : 'User, action, path…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Link className="ws-btn ghost" to="/settings/notifications"><i className="ri-notification-3-line" />Notifications</Link>
      </FrHeader>

      <div className="fr-tabs">
        <button type="button" className={`fr-tab${channel === 'email' ? ' is-on' : ''}`} onClick={() => switchChannel('email')}>
          Email
        </button>
        <button type="button" className={`fr-tab${channel === 'activity' ? ' is-on' : ''}`} onClick={() => switchChannel('activity')}>
          User activity
        </button>
      </div>

      <div className="fr-filter-row">
        {channel === 'email' ? (
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
              <option value="queued">Queued</option>
            </select>
          </label>
        ) : null}
        <label>
          {channel === 'email' ? 'Type' : 'Action'}
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All</option>
            {Object.entries(typeOptions).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {err ? <Alert kind="err">{err}</Alert> : null}
      {msg ? <Alert kind="ok">{msg}</Alert> : null}

      {retriggerRow ? (
        <FrPanel>
          <div className="fr-log-detail" style={{ padding: 16 }}>
            <p><b>Retrigger</b> {retriggerRow.subject || retriggerRow.email_type}</p>
            <p>Original To: {retriggerRow.to_addresses || '—'}</p>
            <label className="fr-field" style={{ display: 'block', marginTop: 8 }}>
              Extra To (comma separated)
              <input
                className="fr-search"
                style={{ width: '100%', marginTop: 6 }}
                value={extraTo}
                onChange={(e) => setExtraTo(e.target.value)}
                placeholder="optional@refex.co.in"
              />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="ws-btn" type="button" disabled={retriggering} onClick={() => void retrigger()}>
                {retriggering ? 'Sending…' : 'Send'}
              </button>
              <button className="ws-btn ghost" type="button" onClick={() => { setRetriggerRow(null); setExtraTo('') }}>
                Cancel
              </button>
            </div>
          </div>
        </FrPanel>
      ) : null}

      <FrPanel>
        <div className="fr-table-wrap is-cards">
          {channel === 'email' ? (
            <table className="fr-table">
              <thead>
                <tr><th>When</th><th>Status</th><th>Type</th><th>Project / Task</th><th>To</th><th>Subject</th><th /></tr>
              </thead>
              <tbody>
                {emailRows.length === 0 ? (
                  <tr><td colSpan={7} className="fr-empty">No records found</td></tr>
                ) : emailRows.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="is-clickable" onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <td data-label="When">{when(r.created_at)}</td>
                      <td data-label="Status"><StatusPill value={r.status} /></td>
                      <td data-label="Type">
                        <span className="fr-name-cell"><span className="fr-name">{typeLabel(r.email_type)}</span></span>
                      </td>
                      <td data-label="Project / Task">
                        <span className="fr-name-cell">
                          <span className="fr-name">{[r.project_code, r.task_code].filter(Boolean).join(' / ') || '—'}</span>
                        </span>
                      </td>
                      <td data-label="To">
                        <span className="fr-name-cell"><span className="fr-name">{r.to_addresses || '—'}</span></span>
                      </td>
                      <td data-label="Subject">
                        <span className="fr-name-cell"><span className="fr-name">{r.subject || '—'}</span></span>
                      </td>
                      <td data-label="Actions">
                        {r.status !== 'sent' ? (
                          <button className="ws-btn ghost" type="button" onClick={(e) => { e.stopPropagation(); setRetriggerRow(r) }}>
                            Retrigger
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {open === r.id ? (
                      <tr>
                        <td colSpan={7} className="fr-log-detail">
                          <p><b>To</b> {r.to_addresses || '—'}</p>
                          <p><b>Cc</b> {r.cc_addresses || '—'}</p>
                          <p><b>Message id</b> {r.message_id || '—'}</p>
                          <p><b>Sent at</b> {r.sent_at || '—'}</p>
                          <p><b>Error</b> {r.error_message || '—'}</p>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="fr-table">
              <thead>
                <tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Path</th><th>IP</th></tr>
              </thead>
              <tbody>
                {activityRows.length === 0 ? (
                  <tr><td colSpan={6} className="fr-empty">No records found</td></tr>
                ) : activityRows.map((r) => {
                  const href = itemHref(r.itemType, r.itemId)
                  return (
                    <Fragment key={r.id}>
                      <tr className="is-clickable" onClick={() => setOpen(open === r.id ? null : r.id)}>
                        <td data-label="When">{when(r.createdAt)}</td>
                        <td data-label="User">
                          <span className="fr-name-cell">
                            <span className="fr-name">{r.userName || r.userEmail || '—'}</span>
                            <span className="fr-sub">{r.userEmail || ''}</span>
                          </span>
                        </td>
                        <td data-label="Action"><StatusPill value={actionLabel(r.action)} /></td>
                        <td data-label="Record">
                          {href ? (
                            <Link to={href} onClick={(e) => e.stopPropagation()}>
                              {r.itemType} #{r.itemId}
                            </Link>
                          ) : (
                            [r.itemType, r.itemId].filter(Boolean).join(' #') || '—'
                          )}
                        </td>
                        <td data-label="Path">
                          <span className="fr-name-cell"><span className="fr-name">{r.resource || r.note || '—'}</span></span>
                        </td>
                        <td data-label="IP">{r.ipAddress || '—'}</td>
                      </tr>
                      {open === r.id ? (
                        <tr>
                          <td colSpan={6} className="fr-log-detail">
                            <p><b>User agent</b> {r.userAgent || '—'}</p>
                            <p><b>Method</b> {r.method || '—'}</p>
                            <p><b>Note</b> {r.note || '—'}</p>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <FrPager page={safePage} pages={pages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
      </FrPanel>
    </FrPage>
  )
}
