import { Link } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { groupsApi, usersApi } from '../api/client'
import { useAuth } from '../api/AuthContext'
import { useDebounced } from '../lib/useDebounced'
import { initials } from './WorkspaceKit'
import { Alert } from './AdminKit'
import { FrHeader, FrPage, FrPanel } from './FormReference'

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
      { to: '/projects/import', icon: 'ri-file-excel-2-line', title: 'Import projects', desc: 'Excel or CSV' },
      { to: '/tasks', icon: 'ri-checkbox-multiple-line', title: 'Tasks', desc: 'Work items and owners' },
      { to: '/tasks/import', icon: 'ri-file-excel-2-line', title: 'Import tasks', desc: 'Excel or CSV' },
      { to: '/subtasks', icon: 'ri-split-cells-horizontal', title: 'Subtasks', desc: 'Breakdown of delivery' },
      { to: '/subtasks/import', icon: 'ri-file-excel-2-line', title: 'Import subtasks', desc: 'Excel or CSV' },
    ],
  },
  {
    label: 'Operations',
    tiles: [
      { to: '/settings/notifications', icon: 'ri-notification-3-line', title: 'Notifications', desc: 'Triggers, templates, recipients' },
      { to: '/admin/email-logs', icon: 'ri-notification-3-line', title: 'Notification logs', desc: 'Email, user activity, retrigger' },
    ],
  },
]

const AVATAR_TONES = [
  { bg: '#dcfce7', color: '#15803d' },
  { bg: '#fce7f3', color: '#be185d' },
  { bg: '#ede9fe', color: '#6d28d9' },
  { bg: '#ffedd5', color: '#c2410c' },
  { bg: '#dbeafe', color: '#1d4ed8' },
  { bg: '#e0f2fe', color: '#0369a1' },
]

function avatarTone(name: unknown) {
  const s = String(name || '')
  let n = 0
  for (let i = 0; i < s.length; i += 1) n = (n + s.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length
  return AVATAR_TONES[n]
}

function personName(u: Record<string, unknown>) {
  const n = String(u.name || '').trim()
  if (n) return n
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || String(u.username || u.email || 'User')
}

function PersonAva({ name }: { name: unknown }) {
  const tone = avatarTone(name)
  return (
    <span className="rl-ava" style={{ background: tone.bg, color: tone.color }}>{initials(name)}</span>
  )
}

export function AdminHub() {
  return (
    <FrPage>
      <FrHeader title="Admin console" count="People, masters, records, and operations" />
      <div className="fr-hub">
        {GROUPS.map((g) => (
          <section key={g.label}>
            <p className="fr-hub-label">{g.label}</p>
            <div className="fr-hub-grid">
              {g.tiles.map((t) => (
                <Link key={t.to} to={t.to} className="fr-hub-tile">
                  <i className={t.icon} />
                  <b>{t.title}</b>
                  <span>{t.desc}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </FrPage>
  )
}

type Member = Record<string, unknown>

export function RolesEditor() {
  const { can } = useAuth()
  const canEdit = can('settings.edit')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [catalog, setCatalog] = useState<Array<{ key: string; module: string; action: string; label: string }>>([])
  const [permRole, setPermRole] = useState<Record<string, unknown> | null>(null)
  const [memberRole, setMemberRole] = useState<Record<string, unknown> | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function load() {
    const [list, cat] = await Promise.all([groupsApi.list(), groupsApi.catalog()])
    setRows(list.rows)
    setCatalog(cat.keys || [])
  }
  useEffect(() => { void load().catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load')) }, [])

  return (
    <FrPage>
      <FrHeader
        crumbs={[{ to: '/admin', label: 'Admin' }, { label: 'Roles' }]}
        title="Roles"
        count={`${rows.length} total records`}
      />
      {err ? <Alert kind="err">{err}</Alert> : null}
      {msg ? <Alert kind="ok">{msg}</Alert> : null}
      <FrPanel>
        <div className="rl-caption">Roles ({rows.length})</div>
        <div className="fr-table-wrap is-cards">
          <table className="fr-table rl-table">
            <thead>
              <tr>
                <th className="rl-num">#</th>
                <th>Roles</th>
                <th>Description <i className="ri-filter-3-line" /></th>
                <th>Users <i className="ri-filter-3-line" /></th>
                <th>Groups <i className="ri-filter-3-line" /></th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="fr-empty">No roles found</td></tr>
              ) : rows.map((r, i) => (
                <tr key={String(r.id)}>
                  <td className="rl-num" data-label="#">{i + 1}</td>
                  <td data-label="Roles">
                    <button className="rl-role-name" type="button" onClick={() => setPermRole(r)}>
                      {String(r.name)}
                    </button>
                  </td>
                  <td className="rl-muted" data-label="Description">{String(r.description || '')}</td>
                  <td data-label="Users">{Number(r.users_count || 0)}</td>
                  <td data-label="Groups">0</td>
                  <td className="rl-act" data-label="Actions">
                    <button className="rl-manage" type="button" onClick={() => setMemberRole(r)}>
                      Manage members
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FrPanel>
      {memberRole ? (
        <MembersModal
          role={memberRole}
          canEdit={canEdit}
          onClose={() => setMemberRole(null)}
          onChanged={async () => {
            await load()
            setMsg('Members updated')
          }}
          onError={setErr}
        />
      ) : null}
      {permRole ? (
        <PermissionsModal
          role={permRole}
          catalog={catalog}
          canEdit={canEdit}
          onClose={() => setPermRole(null)}
          onSaved={async () => {
            await load()
            setMsg('Permissions saved')
          }}
          onError={setErr}
        />
      ) : null}
    </FrPage>
  )
}

function MembersModal({
  role, canEdit, onClose, onChanged, onError,
}: {
  role: Record<string, unknown>
  canEdit: boolean
  onClose: () => void
  onChanged: () => Promise<void>
  onError: (m: string) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [pending, setPending] = useState<Member[]>([])
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Member[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const search = useDebounced(q, 160)
  const taken = useMemo(() => {
    const ids = new Set(members.map((m) => Number(m.id)))
    pending.forEach((m) => ids.add(Number(m.id)))
    return ids
  }, [members, pending])

  async function loadMembers() {
    const row = await groupsApi.get(Number(role.id))
    setMembers(Array.isArray(row.members) ? row.members as Member[] : [])
  }
  useEffect(() => { void loadMembers().catch((e) => onError(e instanceof Error ? e.message : 'Failed to load members')) }, [role.id])

  useEffect(() => {
    if (!open) return undefined
    let live = true
    usersApi.list({ search: search || undefined, limit: 40 })
      .then((r) => {
        if (!live) return
        setHits((r.rows || []).filter((u) => !taken.has(Number(u.id))))
      })
      .catch(() => { if (live) setHits([]) })
    return () => { live = false }
  }, [open, search, taken])

  useEffect(() => {
    function onDoc(e: PointerEvent) {
      if (boxRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [])

  function pick(u: Member) {
    if (taken.has(Number(u.id))) return
    setPending((prev) => [...prev, u])
    setQ('')
    setHits([])
    setOpen(true)
    inputRef.current?.focus()
  }

  async function saveMembers(next: Member[]) {
    setBusy(true)
    try {
      await groupsApi.setMembers(Number(role.id), next.map((m) => Number(m.id)))
      setMembers(next)
      await onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not update members')
    } finally {
      setBusy(false)
    }
  }

  async function addPending() {
    if (!pending.length || !canEdit) return
    const next = [...members, ...pending]
    setPending([])
    await saveMembers(next)
  }

  async function removeMember(id: number) {
    if (!canEdit) return
    await saveMembers(members.filter((m) => Number(m.id) !== id))
  }

  return (
    <div className="rl-back" onClick={onClose}>
      <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
        <header className="rl-modal-head">
          <h2>Add users and groups to {String(role.name)}</h2>
          <button className="rl-x" type="button" aria-label="Close" onClick={onClose}><i className="ri-close-line" /></button>
        </header>
        <div className="rl-add">
          <div ref={boxRef} className={`rl-box${open ? ' is-on' : ''}`}>
            {pending.map((p) => (
              <span key={String(p.id)} className="rl-chip">
                <PersonAva name={personName(p)} />
                {personName(p)}
                <button type="button" aria-label="Remove" onClick={() => setPending((prev) => prev.filter((x) => x.id !== p.id))}>
                  <i className="ri-close-line" />
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              value={q}
              disabled={!canEdit || busy}
              onFocus={() => setOpen(true)}
              onChange={(e) => { setQ(e.target.value); setOpen(true) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && hits[0]) {
                  e.preventDefault()
                  pick(hits[0])
                }
                if (e.key === 'Backspace' && !q && pending.length) {
                  setPending((prev) => prev.slice(0, -1))
                }
                if (e.key === 'Escape') setOpen(false)
              }}
            />
            {open ? (
              <ul className="rl-suggest">
                {hits.length === 0 ? <li className="rl-suggest-empty">{search ? 'No matching people' : 'Type a name...'}</li> : null}
                {hits.map((u) => (
                  <li key={String(u.id)}>
                    <button type="button" onClick={() => pick(u)}>
                      <PersonAva name={personName(u)} />
                      <span>{personName(u)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            className="rl-add-btn"
            type="button"
            disabled={!canEdit || busy || pending.length === 0}
            onClick={() => void addPending()}
          >
            Add
          </button>
        </div>
        <h3 className="rl-section">Users and groups ({members.length})</h3>
        <div className="rl-members">
          {members.map((m) => (
            <article key={String(m.id)} className="rl-card">
              <PersonAva name={personName(m)} />
              <b>{personName(m)}</b>
              {canEdit ? (
                <button
                  className="rl-trash"
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${personName(m)}`}
                  onClick={() => void removeMember(Number(m.id))}
                >
                  <i className="ri-delete-bin-line" />
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function PermissionsModal({
  role, catalog, canEdit, onClose, onSaved, onError,
}: {
  role: Record<string, unknown>
  catalog: Array<{ key: string; module: string; action: string; label: string }>
  canEdit: boolean
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (m: string) => void
}) {
  const [perms, setPerms] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    groupsApi.get(Number(role.id))
      .then((row) => setPerms((row.permissions as Record<string, unknown>) || {}))
      .catch((e) => onError(e instanceof Error ? e.message : 'Failed to load permissions'))
  }, [role.id])
  const modules = Array.from(new Set(catalog.map((k) => k.module)))
  const on = (key: string) => perms[key] === '1' || perms[key] === true
  async function save() {
    if (!canEdit) return
    setBusy(true)
    try {
      await groupsApi.update(Number(role.id), { permissions: perms })
      await onSaved()
      onClose()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="rl-back" onClick={onClose}>
      <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
        <header className="rl-modal-head">
          <h2>{String(role.name)} permissions</h2>
          <div className="rl-head-tools">
            {canEdit ? <button className="ws-btn" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving...' : 'Save'}</button> : null}
            <button className="rl-x" type="button" aria-label="Close" onClick={onClose}><i className="ri-close-line" /></button>
          </div>
        </header>
        {modules.map((mod) => (
          <div key={mod} className="ak-perm-mod">
            <h3>{mod}</h3>
            <div className="ak-perm-row">
              {catalog.filter((k) => k.module === mod).map((k) => (
                <label key={k.key} className={`ak-switch${on(k.key) ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
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
            disabled={!canEdit}
            checked={on('admin')}
            onChange={(e) => setPerms((p) => ({ ...p, admin: e.target.checked ? '1' : '0' }))}
          />
          Admin console
        </label>
      </div>
    </div>
  )
}
