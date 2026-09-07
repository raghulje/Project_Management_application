import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { groupsApi } from '../api/client'
import { Alert, PageHead } from './AdminKit'

const GROUPS = [
  {
    label: 'People',
    tiles: [
      { to: '/settings/roles', icon: 'ri-shield-keyhole-line', title: 'Roles & permissions', desc: 'Who can see and change each module' },
      { to: '/users', icon: 'ri-user-settings-line', title: 'App users', desc: 'Login accounts and role assignment' },
      { to: '/employees', icon: 'ri-team-line', title: 'Employees / HRMS', desc: 'Directory, sync, import' },
    ],
  },
  {
    label: 'Masters',
    tiles: [
      { to: '/companies', icon: 'ri-building-line', title: 'Companies', desc: 'Legal entities for projects' },
      { to: '/departments', icon: 'ri-building-4-line', title: 'Departments', desc: 'Org units' },
      { to: '/locations', icon: 'ri-map-pin-line', title: 'Locations', desc: 'Offices and sites' },
    ],
  },
  {
    label: 'Records',
    tiles: [
      { to: '/projects', icon: 'ri-folder-3-line', title: 'Projects', desc: 'Create, edit, and archive' },
      { to: '/tasks', icon: 'ri-checkbox-multiple-line', title: 'Tasks', desc: 'Work items and owners' },
      { to: '/subtasks', icon: 'ri-split-cells-horizontal', title: 'Subtasks', desc: 'Breakdown of delivery' },
    ],
  },
  {
    label: 'Operations',
    tiles: [
      { to: '/settings/notifications', icon: 'ri-notification-3-line', title: 'Notifications', desc: 'Triggers, templates, recipients' },
      { to: '/admin/email-logs', icon: 'ri-mail-send-line', title: 'Email logs', desc: 'Sent, failed, retrigger' },
    ],
  },
]

export function AdminHub() {
  return (
    <div className="ak">
      <PageHead title="Admin console" subtitle="People, masters, records, and operational tools." />
      {GROUPS.map((g) => (
        <section key={g.label} className="ak-section">
          <p className="ak-kicker">{g.label}</p>
          <div className="ak-grid">
            {g.tiles.map((t) => (
              <Link key={t.to} to={t.to} className="ak-tile">
                <i className={t.icon} />
                <b>{t.title}</b>
                <span>{t.desc}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function RolesEditor() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [active, setActive] = useState<Record<string, unknown> | null>(null)
  const [catalog, setCatalog] = useState<Array<{ key: string; module: string; action: string; label: string }>>([])
  const [perms, setPerms] = useState<Record<string, unknown>>({})
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [list, cat] = await Promise.all([groupsApi.list(), groupsApi.catalog()])
    setRows(list.rows)
    setCatalog(cat.keys || [])
  }
  useEffect(() => { void load().catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load')) }, [])

  async function open(id: number) {
    const row = await groupsApi.get(id)
    setActive(row)
    setPerms((row.permissions as Record<string, unknown>) || {})
    setMsg('')
  }

  async function save() {
    if (!active?.id) return
    setBusy(true)
    setErr('')
    try {
      await groupsApi.update(Number(active.id), { permissions: perms })
      await load()
      await open(Number(active.id))
      setMsg('Permissions saved')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const modules = Array.from(new Set(catalog.map((k) => k.module)))
  const on = (key: string) => perms[key] === '1' || perms[key] === true

  return (
    <div className="ak">
      <PageHead title="Roles & permissions" subtitle="Toggle what each role can see and change." />
      {err ? <Alert kind="err">{err}</Alert> : null}
      {msg ? <Alert kind="ok">{msg}</Alert> : null}
      <div className="ak-roles">
        <aside className="ak-role-list">
          {rows.map((r) => (
            <button
              key={String(r.id)}
              type="button"
              className={`ak-role-item${active?.id === r.id ? ' is-on' : ''}`}
              onClick={() => void open(Number(r.id))}
            >
              <b>{String(r.name)}</b>
              <span>{String(r.users_count || 0)} users</span>
            </button>
          ))}
        </aside>
        <div className="ak-panel" style={{ margin: 0 }}>
          {!active ? <p className="muted">Select a role to edit its matrix.</p> : (
            <>
              <div className="ak-panel-head">
                <h2>{String(active.name)}</h2>
                <button className="ws-btn" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
              </div>
              {modules.map((mod) => (
                <div key={mod} className="ak-perm-mod">
                  <h3>{mod}</h3>
                  <div className="ak-perm-row">
                    {catalog.filter((k) => k.module === mod).map((k) => (
                      <label key={k.key} className={`ak-switch${on(k.key) ? ' is-on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on(k.key)}
                          onChange={(e) => setPerms((p) => ({ ...p, [k.key]: e.target.checked ? '1' : '0' }))}
                        />
                        {k.action}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <label className={`ak-switch${on('admin') ? ' is-on' : ''}`} style={{ marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={on('admin')}
                  onChange={(e) => setPerms((p) => ({ ...p, admin: e.target.checked ? '1' : '0' }))}
                />
                Admin console
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
