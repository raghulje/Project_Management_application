import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../api/AuthContext'
import { Alert, Insights, PageHead } from './AdminKit'

type Snapshot = {
  smtp_configured: boolean
  smtp_hint: string
  alert_email: string | null
  config: {
    email_notifications: Record<string, boolean>
    extra_ops_emails: string
    overdue_to_assignee: boolean
    workflow_to_ops_roles: boolean
  }
  ops_users: Array<{ id: number; name: string; email: string | null }>
  resolved_ops_emails: string[]
  categories: Array<{ key: string; label: string }>
  triggers: Array<{ key: string; category: string; label: string }>
}

export function NotificationsSettings() {
  const { can } = useAuth()
  const canEdit = can('settings.edit')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [runBusy, setRunBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [alertEmail, setAlertEmail] = useState('')
  const [extra, setExtra] = useState('')
  const [cats, setCats] = useState<Record<string, boolean>>({})
  const [toOps, setToOps] = useState(true)
  const [toAssignee, setToAssignee] = useState(true)

  function apply(s: Snapshot) {
    setSnap(s)
    setAlertEmail(String(s.alert_email || ''))
    setExtra(String(s.config?.extra_ops_emails || ''))
    setCats({ ...(s.config?.email_notifications || {}) })
    setToOps(s.config?.workflow_to_ops_roles !== false)
    setToAssignee(s.config?.overdue_to_assignee !== false)
  }

  useEffect(() => {
    api<Snapshot>('/settings/notifications')
      .then(apply)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!canEdit) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const res = await api<{ payload?: Snapshot }>('/settings/notifications', {
        method: 'PUT',
        json: {
          alert_email: alertEmail.trim() || null,
          extra_ops_emails: extra,
          email_notifications: cats,
          workflow_to_ops_roles: toOps,
          overdue_to_assignee: toAssignee,
        },
      })
      if (res.payload) apply(res.payload)
      setMsg('Notification settings saved')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally { setBusy(false) }
  }

  async function runOverdue() {
    setRunBusy(true); setErr(''); setMsg('')
    try {
      const res = await api<{ messages?: string[]; payload?: { sent: number } }>('/notifications/overdue/run', { method: 'POST', json: {} })
      setMsg((res.messages || []).join(' ') || `Queued ${res.payload?.sent ?? 0} overdue alerts`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Run failed')
    } finally { setRunBusy(false) }
  }

  if (loading) return <p className="ak-boot">Loading notifications…</p>

  return (
    <div className="ak">
      <PageHead title="Notifications" subtitle="Triggers, templates, and recipients.">
        <Link className="ws-btn ghost" to="/admin/email-logs"><i className="ri-mail-send-line" />Email logs</Link>
      </PageHead>
      <Insights cards={[
        { label: 'SMTP', value: snap?.smtp_configured ? 'Ready' : 'Off', tone: snap?.smtp_configured ? 'green' : 'rose', icon: 'ri-server-line' },
        { label: 'Ops recipients', value: snap?.resolved_ops_emails?.length || 0, tone: 'blue', icon: 'ri-mail-line' },
        { label: 'Events', value: snap?.triggers?.length || 0, tone: 'amber', icon: 'ri-flashlight-line' },
      ]} />
      {err ? <Alert kind="err">{err}</Alert> : null}
      {msg ? <Alert kind="ok">{msg}</Alert> : null}

      <form className="pm-card" onSubmit={(e) => void save(e)}>
        <div className="pm-form-section">
          <h3>Delivery</h3>
          <p className="muted">{snap?.smtp_hint}</p>
          <div className="pm-form-grid" style={{ marginTop: 12 }}>
            <label className="pm-field">
              <span>Fallback alert email</span>
              <input type="email" disabled={!canEdit} value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} placeholder="ops@refex.co.in" />
            </label>
            <label className="pm-field">
              <span>Extra ops emails</span>
              <textarea disabled={!canEdit} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="one@refex.co.in, two@refex.co.in" />
            </label>
          </div>
          <label className="pm-field" style={{ marginTop: 12 }}>
            <span>
              <input type="checkbox" disabled={!canEdit} checked={toOps} onChange={(e) => setToOps(e.target.checked)} />
              {' '}Send workflow mail to Admin / Superuser / notify.ops
            </span>
          </label>
          <label className="pm-field">
            <span>
              <input type="checkbox" disabled={!canEdit} checked={toAssignee} onChange={(e) => setToAssignee(e.target.checked)} />
              {' '}Also email the assignee on overdue alerts
            </span>
          </label>
        </div>

        <div className="pm-form-section">
          <h3>Trigger categories</h3>
          {(snap?.categories || []).map((c) => (
            <label key={c.key} className="pm-field">
              <span>
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={cats[c.key] !== false}
                  onChange={(e) => setCats((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                />
                {' '}{c.label}
              </span>
            </label>
          ))}
        </div>

        <div className="pm-form-section">
          <h3>Templates / events</h3>
          <p className="muted">Branded HTML emails (project/task/subtask). Each event is logged in Email logs as sent, skipped, or failed.</p>
          <table className="pm-table">
            <thead><tr><th>Event</th><th>Category</th></tr></thead>
            <tbody>
              {(snap?.triggers || []).map((t) => (
                <tr key={t.key}><td>{t.label}</td><td>{t.category}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pm-form-actions">
          {canEdit ? <button className="ws-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button> : null}
          {canEdit ? <button className="ws-btn ghost" type="button" disabled={runBusy} onClick={() => void runOverdue()}>{runBusy ? 'Running…' : 'Run overdue alerts now'}</button> : null}
        </div>
      </form>

      <div className="pm-card" style={{ marginTop: 16, padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Resolved ops recipients</h3>
        <p className="muted">{(snap?.resolved_ops_emails || []).join(', ') || 'None yet — set alert email or grant notify.ops.'}</p>
        <p className="muted">Ops users: {(snap?.ops_users || []).map((u) => u.name).join(', ') || '—'}</p>
        <p className="muted"><Link to="/settings/roles">Manage roles</Link> to toggle “Receive ops email alerts”.</p>
      </div>
    </div>
  )
}
