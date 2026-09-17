import { useEffect, useState } from 'react'
import { groupsApi, usersApi } from '../api/client'
import { useDebounced } from '../lib/useDebounced'
import { initials } from './WorkspaceKit'
import { Alert } from './AdminKit'
import WsSelect from './WsSelect'
import { FrAcc, FrChips, FrField, FrGrid, FrHeader, FrPage, FrPanel, FrSection } from './FormReference'

const EMPTY = { first_name: '', last_name: '', username: '', email: '', password: '', role_id: '' }

export function UsersList() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [roles, setRoles] = useState<Record<string, unknown>[]>([])
  const [form, setForm] = useState(EMPTY)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
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
  const shown = statusFilter === 'Active'
    ? rows.filter((r) => r.activated)
    : statusFilter === 'Inactive'
      ? rows.filter((r) => !r.activated)
      : rows

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
    <FrPage>
      <FrHeader title="App users" count={`${rows.length} total records`}>
        <input className="fr-search" placeholder="Search records..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="ws-btn" type="button" onClick={() => { setOpen(true); setErr('') }}>
          <i className="ri-user-add-line" />Create
        </button>
      </FrHeader>
      <FrChips
        items={[
          { label: 'All', count: rows.length, value: 'All' },
          { label: 'Active', count: active, value: 'Active' },
          { label: 'Inactive', count: rows.length - active, value: 'Inactive' },
        ]}
        value={statusFilter || 'All'}
        onChange={setStatusFilter}
      />
      {err ? <Alert kind="err">{err}</Alert> : null}
      {msg ? <Alert kind="ok">{msg}</Alert> : null}

      {open ? (
        <FrAcc>
          <FrSection label="Create user">
            <div className="fr-sec-tools">
              <button className="ws-btn ghost" type="button" onClick={() => setOpen(false)}>Discard</button>
              <button className="ws-btn" type="button" disabled={busy} onClick={() => void create()}>{busy ? 'Saving…' : 'Submit'}</button>
            </div>
            <FrGrid>
              <FrField label="First name" required>
                <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </FrField>
              <FrField label="Last name">
                <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </FrField>
              <FrField label="Username" required>
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </FrField>
              <FrField label="Email">
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </FrField>
              <FrField label="Password">
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </FrField>
              <FrField label="Role">
                <WsSelect
                  value={form.role_id}
                  placeholder="Select role..."
                  options={[{ value: '', label: 'Select role...' }, ...roles.map((r) => ({ value: String(r.id), label: String(r.name) }))]}
                  onChange={(v) => setForm({ ...form, role_id: v })}
                />
              </FrField>
            </FrGrid>
          </FrSection>
        </FrAcc>
      ) : null}

      <FrPanel>
        <div className="fr-table-wrap">
          <table className="fr-table">
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
              {shown.length === 0 ? (
                <tr><td colSpan={5} className="fr-empty">No records found</td></tr>
              ) : shown.map((r) => (
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
                    <WsSelect
                      size="sm"
                      value=""
                      placeholder={Array.isArray(r.roles) && r.roles.length ? (r.roles as string[]).join(', ') : 'Assign role'}
                      options={roles.map((role) => ({ value: String(role.id), label: String(role.name) }))}
                      onChange={async (v) => {
                        const id = Number(v)
                        if (!id) return
                        await groupsApi.setUserRoles(Number(r.id), [id])
                        setMsg('Role updated')
                        await load()
                      }}
                    />
                  </td>
                  <td><span className={`ws-pri ${r.activated ? 'done' : 'hold'}`}>{r.activated ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FrPanel>
    </FrPage>
  )
}
