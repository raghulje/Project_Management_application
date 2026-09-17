import { Fragment, useEffect, useState } from 'react'
import { api } from '../api/client'
import { useDebounced } from '../lib/useDebounced'
import { Alert } from './AdminKit'
import { FrChips, FrHeader, FrPage, FrPanel } from './FormReference'

type Log = {
  id: number
  email_type: string
  status: string
  project_code?: string | null
  task_code?: string | null
  to_addresses?: string
  subject?: string
  error_message?: string | null
  created_at?: string
  sent_at?: string | null
  message_id?: string | null
}

export function EmailLogsPage() {
  const [rows, setRows] = useState<Log[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const search = useDebounced(q)
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function load() {
    try {
      const r = await api<{ rows: Log[]; total: number }>(`/admin/email-logs?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&limit=100`)
      setRows(r.rows || [])
      setTotal(r.total || 0)
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load logs')
    }
  }
  useEffect(() => { void load() }, [search, status])

  async function retrigger(id: number) {
    const extra = window.prompt('Optional extra To addresses (comma separated)') || ''
    await api(`/admin/email-logs/${id}/retrigger`, { method: 'POST', json: { extraTo: extra } })
    setMsg(`Retriggered #${id}`)
    await load()
  }

  const sent = rows.filter((r) => r.status === 'sent').length
  const failed = rows.filter((r) => r.status === 'failed').length

  return (
    <FrPage>
      <FrHeader kicker="Notification settings" kickerTo="/settings/notifications" title="Email logs" count={`${total} total records`}>
        <input className="fr-search" placeholder="Search records..." value={q} onChange={(e) => setQ(e.target.value)} />
      </FrHeader>
      <FrChips
        items={[
          { label: 'All', count: total, value: '' },
          { label: 'Sent', count: sent, value: 'sent' },
          { label: 'Failed', count: failed, value: 'failed' },
        ]}
        value={status}
        onChange={setStatus}
      />
      {err ? <Alert kind="err">{err}</Alert> : null}
      {msg ? <Alert kind="ok">{msg}</Alert> : null}
      <FrPanel>
        <div className="fr-table-wrap">
          <table className="fr-table">
            <thead>
              <tr><th>When</th><th>Status</th><th>Type</th><th>Project / Task</th><th>To</th><th>Subject</th><th /></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="fr-empty">No records found</td></tr>
              ) : rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="is-clickable" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <td>{String(r.created_at || '').replace('T', ' ').slice(0, 19)}</td>
                    <td><span className={`ws-pri ${r.status === 'sent' ? 'done' : r.status === 'failed' ? 'hold' : 'run'}`}>{r.status}</span></td>
                    <td>{r.email_type}</td>
                    <td>{[r.project_code, r.task_code].filter(Boolean).join(' / ') || '—'}</td>
                    <td>{String(r.to_addresses || '').slice(0, 48)}</td>
                    <td>{String(r.subject || '').slice(0, 60)}</td>
                    <td>
                      {r.status !== 'sent' ? (
                        <button className="ws-btn ghost" type="button" onClick={(e) => { e.stopPropagation(); void retrigger(r.id) }}>Retrigger</button>
                      ) : null}
                    </td>
                  </tr>
                  {open === r.id ? (
                    <tr>
                      <td colSpan={7} className="ak-log-detail">
                        <p><b>To</b> {r.to_addresses || '—'}</p>
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
        </div>
      </FrPanel>
    </FrPage>
  )
}
