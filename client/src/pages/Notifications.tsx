import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../api/AuthContext'
import { Alert } from './AdminKit'
import { FrAcc, FrField, FrGrid, FrHeader, FrKpi, FrPage, FrSection, FrYesNo } from './FormReference'

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

  if (loading) {
    return (
      <FrPage>
        <FrHeader crumbs={[{ to: '/admin', label: 'Admin' }, { label: 'Notifications' }]} title="Notifications" count="Loading..." />
      </FrPage>
    )
  }

  return (
    <FrPage>
      <FrHeader
        crumbs={[{ to: '/admin', label: 'Admin' }, { label: 'Notifications' }]}
        title="Notifications"
        count="Triggers, templates, and recipients"
      >
        <Link className="ws-btn ghost" to="/admin/email-logs"><i className="ri-mail-send-line" />Email logs</Link>
        {canEdit ? (
          <button className="ws-btn ghost" type="button" disabled={runBusy} onClick={() => void runOverdue()}>
            {runBusy ? 'Running...' : 'Run overdue alerts'}
          </button>
        ) : null}
        {canEdit ? (
          <button className="ws-btn" type="submit" form="notif-form" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
        ) : null}
      </FrHeader>
      <FrKpi cards={[
        { label: 'SMTP', value: snap?.smtp_configured ? 'Ready' : 'Off', tone: snap?.smtp_configured ? 'green' : 'rose', icon: 'ri-server-line' },
        { label: 'Ops recipients', value: snap?.resolved_ops_emails?.length || 0, icon: 'ri-mail-line' },
        { label: 'Events', value: snap?.triggers?.length || 0, tone: 'amber', icon: 'ri-flashlight-line' },
      ]} />
      {err ? <Alert kind="err">{err}</Alert> : null}
      {msg ? <Alert kind="ok">{msg}</Alert> : null}

      <form id="notif-form" onSubmit={(e) => void save(e)}>
        <FrAcc>
          <FrSection label="Delivery">
            <p className="fr-sub" style={{ margin: '0 0 14px' }}>{snap?.smtp_hint}</p>
            <FrGrid>
              <FrField label="Fallback alert email" span={2}>
                <input type="email" disabled={!canEdit} value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} placeholder="ops@refex.co.in" />
              </FrField>
              <FrField label="Extra ops emails" span={2}>
                <textarea disabled={!canEdit} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="one@refex.co.in, two@refex.co.in" />
              </FrField>
              <FrField label="Workflow mail to Admin / Superuser / notify.ops">
                <FrYesNo value={toOps} onChange={setToOps} disabled={!canEdit} />
              </FrField>
              <FrField label="Email the assignee on overdue alerts">
                <FrYesNo value={toAssignee} onChange={setToAssignee} disabled={!canEdit} />
              </FrField>
            </FrGrid>
          </FrSection>
          <FrSection label="Trigger categories">
            <FrGrid>
              {(snap?.categories || []).map((c) => (
                <FrField key={c.key} label={c.label}>
                  <FrYesNo
                    value={cats[c.key] !== false}
                    onChange={(v) => setCats((prev) => ({ ...prev, [c.key]: v }))}
                    disabled={!canEdit}
                  />
                </FrField>
              ))}
            </FrGrid>
          </FrSection>
          <FrSection label="Templates / events" count={snap?.triggers?.length || 0}>
            <p className="fr-sub" style={{ margin: '0 0 12px' }}>Branded HTML emails (project/task/subtask). Each event is logged in Email logs as sent, skipped, or failed.</p>
            <div className="fr-table-wrap">
              <table className="fr-table">
                <thead><tr><th>Event</th><th>Category</th></tr></thead>
                <tbody>
                  {(snap?.triggers || []).length === 0 ? (
                    <tr><td colSpan={2} className="fr-empty">No events configured</td></tr>
                  ) : (snap?.triggers || []).map((t) => (
                    <tr key={t.key}>
                      <td>
                        <span className="fr-name-cell">
                          <span className="fr-name">{t.label}</span>
                          <span className="fr-sub">{t.key}</span>
                        </span>
                      </td>
                      <td>{t.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FrSection>
          <FrSection label="Resolved ops recipients">
            <FrGrid>
              <FrField label="Emails" span={2} view>
                {(snap?.resolved_ops_emails || []).join(', ') || 'None yet — set alert email or grant notify.ops.'}
              </FrField>
              <FrField label="Ops users" span={2} view>
                {(snap?.ops_users || []).map((u) => u.name).join(', ') || '—'}
              </FrField>
            </FrGrid>
            <p className="fr-sub" style={{ marginTop: 12 }}>
              <Link to="/settings/roles">Manage roles</Link> to toggle "Receive ops email alerts".
            </p>
          </FrSection>
        </FrAcc>
      </form>
    </FrPage>
  )
}
