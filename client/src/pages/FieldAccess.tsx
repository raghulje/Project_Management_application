import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Alert } from './AdminKit'
import { StatusPill } from './WorkspaceKit'
import { FrChips, FrField, FrHeader, FrKpi, FrPage, FrPanel } from './FormReference'

export type EditPolicy = {
  mode: 'full' | 'assignee' | 'none'
  open_fields: string[]
  granted_fields: string[]
  requestable_fields: { key: string; label: string }[]
  can_request: boolean
  pending_request: { id: number; fields: string[]; reason: string; created_at: string } | null
  l1_email: string | null
  l1_name: string | null
  grant_expires_at: string | null
}

export type AccessRequest = {
  id: number
  item_type: string
  item_id: number
  item_name: string
  record_path: string
  fields: string[]
  field_labels: string[]
  reason: string
  status: string
  requested_by_name: string
  requested_by_email: string
  l1_name: string
  l1_email: string
  decision_note: string
  expires_at: string | null
  created_at: string
}

export function asPolicy(raw: unknown): EditPolicy | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as EditPolicy
  if (p.mode !== 'full' && p.mode !== 'assignee' && p.mode !== 'none') return null
  return p
}

export function fieldAccess(policy: EditPolicy | null | undefined, field: string) {
  if (!policy) return { locked: false, granted: false, pending: false, kind: 'full' as const }
  if (policy.mode === 'full') return { locked: false, granted: false, pending: false, kind: 'full' as const }
  const pendingSet = new Set(policy.pending_request?.fields || [])
  if (policy.mode === 'none') {
    return { locked: true, granted: false, pending: pendingSet.has(field), kind: 'none' as const }
  }
  const open = new Set(policy.open_fields || [])
  const granted = new Set(policy.granted_fields || [])
  if (open.has(field)) return { locked: false, granted: false, pending: false, kind: 'open' as const }
  if (granted.has(field)) return { locked: false, granted: true, pending: false, kind: 'granted' as const }
  return { locked: true, granted: false, pending: pendingSet.has(field), kind: 'locked' as const }
}

export const fieldAccessApi = {
  request: (body: { item_type: string; item_id: number | string; fields: string[]; reason: string }) =>
    api<{ messages: string[]; payload: { request: AccessRequest; edit_policy: EditPolicy } }>('/field-access/requests', { method: 'POST', json: body }),
  inbox: (status = 'pending') => api<{ rows: AccessRequest[]; total: number }>(`/field-access/inbox?status=${encodeURIComponent(status)}`),
  mine: () => api<{ rows: AccessRequest[]; total: number }>('/field-access/mine'),
  count: () => api<{ pending: number }>('/field-access/count'),
  grant: (id: number, note = '') =>
    api<{ messages: string[]; payload: { request: AccessRequest } }>(`/field-access/requests/${id}/grant`, { method: 'POST', json: { note } }),
  deny: (id: number, note = '') =>
    api<{ messages: string[]; payload: { request: AccessRequest } }>(`/field-access/requests/${id}/deny`, { method: 'POST', json: { note } }),
}

export function PolicyBanner({ policy }: { policy: EditPolicy | null }) {
  if (!policy || policy.mode === 'full') return null
  if (policy.mode === 'none') {
    return (
      <div className="fa-banner is-warn">
        You can view this record. Only the assignee can update permitted fields, and locked fields need L1 approval.
      </div>
    )
  }
  const until = policy.grant_expires_at
    ? new Date(String(policy.grant_expires_at).replace(' ', 'T')).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : ''
  return (
    <div className="fa-banner">
      You can update status and notes for your step. Name, dates, assignment, and similar fields stay locked unless your L1 grants access
      {policy.l1_name || policy.l1_email ? ` (${policy.l1_name || policy.l1_email})` : ''}.
      {until ? ` Granted fields stay open until ${until}.` : ''}
    </div>
  )
}

export function AccessMark({
  policy, field, onRequest,
}: {
  policy: EditPolicy | null
  field: string
  onRequest: (fields: string[]) => void
}) {
  const st = fieldAccess(policy, field)
  if (!policy || policy.mode === 'full' || st.kind === 'open') return null
  if (st.granted) return <em className="fa-chip is-grant">Unlocked</em>
  if (st.pending) return <em className="fa-chip is-wait">Pending L1</em>
  if (!policy.can_request) return <em className="fa-chip">Locked</em>
  return (
    <button type="button" className="fa-req" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRequest([field]) }}>
      <i className="ri-lock-line" /> Request
    </button>
  )
}

export function RequestAccessModal({
  open, itemType, itemId, policy, preset, onClose, onDone,
}: {
  open: boolean
  itemType: 'project' | 'task' | 'subtask'
  itemId: string | number
  policy: EditPolicy | null
  preset: string[]
  onClose: () => void
  onDone: (policy: EditPolicy) => void
}) {
  const options = policy?.requestable_fields || []
  const [picked, setPicked] = useState<string[]>(preset)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (open) {
      setPicked(preset.length ? preset : [])
      setReason(policy?.pending_request?.reason || '')
      setErr('')
    }
  }, [open, preset, policy?.pending_request?.reason])

  if (!open) return null

  function toggle(key: string) {
    setPicked((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
  }

  async function send() {
    setErr('')
    if (!picked.length) { setErr('Pick at least one field.'); return }
    if (reason.trim().length < 8) { setErr('Tell your L1 why you need this change.'); return }
    setBusy(true)
    try {
      const res = await fieldAccessApi.request({ item_type: itemType, item_id: itemId, fields: picked, reason: reason.trim() })
      if (res.payload?.edit_policy) onDone(res.payload.edit_policy)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the request')
    } finally { setBusy(false) }
  }

  return (
    <div className="fa-modal-back" onClick={onClose}>
      <div className="fa-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Request field access</h2>
          <p>Your L1 reviews this, then you can edit the approved fields. The reason is stored in revisions.</p>
        </header>
        {policy?.l1_name || policy?.l1_email ? (
          <p className="fa-l1">Sends to L1: <b>{policy.l1_name || policy.l1_email}</b></p>
        ) : (
          <p className="fa-l1 is-miss">No L1 is on file for this assignee yet.</p>
        )}
        <div className="fa-picks">
          {options.map((o) => (
            <label key={o.key} className={picked.includes(o.key) ? 'is-on' : ''}>
              <input type="checkbox" checked={picked.includes(o.key)} onChange={() => toggle(o.key)} />
              {o.label}
            </label>
          ))}
        </div>
        <label className="fa-reason">
          <span>Reason</span>
          <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do you need to change this? e.g. customer moved the go-live date." />
        </label>
        {err ? <div className="pc-alert">{err}</div> : null}
        <footer>
          <button className="ws-btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="ws-btn" type="button" disabled={busy} onClick={() => void send()}>{busy ? 'Sending…' : 'Send to L1'}</button>
        </footer>
      </div>
    </div>
  )
}

export function ApprovalsPage() {
  const [tab, setTab] = useState<'inbox' | 'mine'>('inbox')
  const [inbox, setInbox] = useState<AccessRequest[]>([])
  const [mine, setMine] = useState<AccessRequest[]>([])
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [note, setNote] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  async function load() {
    try {
      const [a, b] = await Promise.all([fieldAccessApi.inbox('pending'), fieldAccessApi.mine()])
      setInbox(a.rows || [])
      setMine(b.rows || [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load requests')
    }
  }

  useEffect(() => { void load() }, [])

  const pending = inbox.filter((r) => r.status === 'pending')
  const rows = tab === 'inbox' ? pending : mine

  async function decide(id: number, action: 'grant' | 'deny') {
    setBusyId(id); setErr(''); setMsg('')
    try {
      if (action === 'grant') await fieldAccessApi.grant(id, note)
      else await fieldAccessApi.deny(id, note)
      setNote('')
      setMsg(action === 'grant' ? 'Access granted for 48 hours' : 'Request denied')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update the request')
    } finally { setBusyId(null) }
  }

  return (
    <FrPage>
      <FrHeader
        crumbs={[{ to: '/admin', label: 'Admin' }, { label: 'Approvals' }]}
        title="Approvals"
        count="L1 grants for locked name, date, and assignment fields"
      />
      <FrKpi cards={[
        { label: 'Waiting on you', value: pending.length, tone: 'amber', icon: 'ri-shield-check-line' },
        { label: 'Your requests', value: mine.length, icon: 'ri-lock-unlock-line' },
      ]} />
      {err ? <Alert kind="err">{err}</Alert> : null}
      {msg ? <Alert kind="ok">{msg}</Alert> : null}
      <FrChips
        items={[
          { label: 'Inbox', count: pending.length, value: 'inbox' },
          { label: 'My requests', count: mine.length, value: 'mine' },
        ]}
        value={tab}
        onChange={(v) => setTab(v === 'mine' ? 'mine' : 'inbox')}
      />
      {tab === 'inbox' ? (
        <div style={{ maxWidth: 520, marginBottom: 12 }}>
          <FrField label="Decision note (optional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown to the requester and stored in revisions" />
          </FrField>
        </div>
      ) : null}
      <FrPanel>
        <div className="fr-table-wrap">
          <table className="fr-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Fields</th>
                <th>Requested by</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="fr-empty">
                    {tab === 'inbox' ? 'No pending requests' : 'You have not requested any field changes'}
                  </td>
                </tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="fr-name-cell">
                      <Link className="fr-name" to={r.record_path}>{r.item_name || `${r.item_type} #${r.item_id}`}</Link>
                      <span className="fr-sub">{r.reason || 'Locked fields'}</span>
                    </span>
                  </td>
                  <td>
                    <span className="fr-name-cell">
                      <span className="fr-name">{r.field_labels.join(', ') || '—'}</span>
                    </span>
                  </td>
                  <td>
                    <span className="fr-name-cell">
                      <span className="fr-name">{r.requested_by_name}</span>
                      <span className="fr-sub">{r.created_at?.slice(0, 16).replace('T', ' ')}</span>
                    </span>
                  </td>
                  <td><StatusPill value={r.status} /></td>
                  <td>
                    <span className="ak-acts">
                      <Link className="ws-btn ghost" to={r.record_path}>Open</Link>
                      {tab === 'inbox' && r.status === 'pending' ? (
                        <>
                          <button className="ws-btn" type="button" disabled={busyId === r.id} onClick={() => void decide(r.id, 'grant')}>Grant</button>
                          <button className="ws-btn danger" type="button" disabled={busyId === r.id} onClick={() => void decide(r.id, 'deny')}>Deny</button>
                        </>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FrPanel>
    </FrPage>
  )
}

export function useRequestAccess() {
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<string[]>([])
  const ask = (fields: string[] = []) => {
    setPreset(fields)
    setOpen(true)
  }
  return { open, preset, ask, close: () => setOpen(false) }
}

export function canSaveRecord(policy: EditPolicy | null | undefined) {
  if (!policy) return true
  return policy.mode !== 'none'
}
