import { useEffect, useState } from 'react'
import { groupsApi, usersApi } from '../api/client'
import { useDebounced } from '../lib/useDebounced'
import { initials } from './WorkspaceKit'
import { Alert, EmptyState, Insights, PageHead, Pill } from './AdminKit'

const EMPTY = { first_name: '', last_name: '', username: '', email: '', password: '', role_id: '' }

export function UsersList() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [roles, setRoles] = useState<Record<string, unknown>[]>([])
  const [form, setForm] = useState(EMPTY)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    const [users, groups] = await Promise.all([
      usersApi.list({ search: q || undefined, limit: 300 }),
      groupsApi.list(),
    ])
    setRows(users.rows)
    setRoles(groups.rows)
  }
  useEffect(() => { void load().catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load')) }, [q])

  const active = rows.filter((r) => r.activated).length

  async function create() {
    if (!form.first_name.trim() || !form.username.trim()) {
      setErr('First name and username are required')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await usersApi.create({
        ...form,
        group_ids: form.role_id ? [Number(form.role_id)] : [],
      })
      setForm(EMPTY)
      setOpen(false)
      setMsg('User created')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ak">
      <PageHead title="App users" subtitle={`${rows.length} login accounts`}>
        <button className="ws-btn" type="button" onClick={() => { setOpen(true); setErr('') }}>
          <i className="ri-user-add-line" />Create user
        </button>
      </PageHead>
      <Insights cards={[
        { label: 'Users', value: rows.length, icon: 'ri-user-line', tone: 'blue' },
        { label: 'Active', value: active, icon: 'ri-checkbox-circle-line', tone: 'green' },
        { label: 'Inactive', value: rows.length - active, icon: 'ri-user-unfollow-line', tone: 'rose' },
      ]} />
      {err ? <Alert kind="err">{err}</Alert> : null}
      {msg ? <Alert kind="ok">{msg}</Alert> : null}

      {open ? (
        <div className="ak-panel">
          <div className="ak-panel-head">
            <h2>Create user</h2>
            <button className="ws-btn ghost" type="button" onClick={() => setOpen(false)}>Close</button>
          </div>
          <div className="ak-form">
            {(['first_name', 'last_name', 'username', 'email', 'password'] as const).map((k) => (
              <label key={k} className="pm-field">
                <span>{k.replaceAll('_', ' ')}</span>
                <input
                  type={k === 'password' ? 'password' : k === 'email' ? 'email' : 'text'}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </label>
            ))}
            <label className="pm-field">
              <span>Role</span>
              <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
                <option value="">Select role…</option>
                {roles.map((r) => <option key={String(r.id)} value={String(r.id)}>{String(r.name)}</option>)}
              </select>
            </label>
          </div>
          <div className="pm-form-actions">
            <button className="ws-btn" type="button" disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create user'}</button>
            <button className="ws-btn ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="pm-card">
        <div className="pm-toolbar">
          <input placeholder="Search users" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="ak-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5}><EmptyState icon="ri-user-line" title="No users match this view" /></td></tr>
              ) : rows.map((r) => (
                <tr key={String(r.id)}>
                  <td>
                    <span className="emp-name">
                      <span className="ws-ava">{initials(r.name)}</span>
                      {String(r.name || '—')}
                    </span>
                  </td>
                  <td>{String(r.email || '—')}</td>
                  <td>{String(r.username || '—')}</td>
                  <td>
                    <select
                      className="ak-role"
                      value=""
                      onChange={async (e) => {
                        const id = Number(e.target.value)
                        if (!id) return
                        await groupsApi.setUserRoles(Number(r.id), [id])
                        setMsg('Role updated')
                        await load()
                      }}
                    >
                      <option value="" disabled>{Array.isArray(r.roles) && r.roles.length ? (r.roles as string[]).join(', ') : 'Assign role'}</option>
                      {roles.map((role) => <option key={String(role.id)} value={String(role.id)}>{String(role.name)}</option>)}
                    </select>
                  </td>
                  <td><Pill tone={r.activated ? 'green' : 'rose'}>{r.activated ? 'Active' : 'Inactive'}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
