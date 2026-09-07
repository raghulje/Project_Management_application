import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { dashboardApi, employeesApi } from '../api/client'
import { FormShell, initials } from './WorkspaceKit'
import { Field, Section } from './RecordUi'

type Row = Record<string, unknown>

function isActive(r: Row) {
  const d = String(r.employment_status_description || '').toLowerCase()
  return d === 'active' || r.employment_status === '1' || r.employment_status === 1
}

function fmt(v: unknown) {
  if (v == null || v === '') return '—'
  return String(v)
}

export function EmployeesList() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const active = params.get('active')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [insights, setInsights] = useState({ employees: 0, employees_active: 0, employees_inactive: 0 })
  const pageSize = 15

  function loadCounts() {
    dashboardApi.counts().then((c) => {
      setInsights({
        employees: Number(c.employees || 0),
        employees_active: Number(c.employees_active || 0),
        employees_inactive: Number(c.employees_inactive || 0),
      })
    }).catch(() => undefined)
  }

  function load() {
    setLoading(true)
    employeesApi.list({
      search: search || undefined,
      limit: pageSize,
      offset: page * pageSize,
      active: active === '1' ? '1' : active === '0' ? '0' : undefined,
    }).then((r) => {
      setRows(r.rows)
      setTotal(r.total)
      setErr('')
    }).catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false))
  }

  useEffect(() => { loadCounts() }, [])
  useEffect(() => { setPage(0) }, [active, search])
  useEffect(() => { load() }, [search, page, active])

  async function sync() {
    setSyncing(true)
    setErr('')
    setMsg('')
    try {
      const r = await employeesApi.sync()
      setMsg((r.messages || []).join(' '))
      load()
      loadCounts()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'HRMS sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const label = active === '1' ? 'active employees' : active === '0' ? 'inactive employees' : 'employees'

  return (
    <div className="emp">
      <div className="pm-page-head">
        <div>
          <h1>Employees</h1>
          <p>{loading ? 'Loading…' : `${total} ${label}`}</p>
        </div>
        <div className="ws-actions">
          <button className="ws-btn ghost" type="button" disabled={syncing} onClick={() => void employeesApi.syncMasters().then(() => setMsg('Masters rebuilt'))}>
            Rebuild masters
          </button>
          <button className="ws-btn ghost" type="button" disabled={syncing} onClick={() => void sync()}>
            <i className={syncing ? 'ri-loader-4-line' : 'ri-refresh-line'} />
            {syncing ? 'Syncing…' : 'Sync from HRMS'}
          </button>
          <Link className="ws-btn ghost" to="/employees/import"><i className="ri-file-upload-line" />Import</Link>
          <Link className="ws-btn" to="/employees/new"><i className="ri-add-line" />Create</Link>
        </div>
      </div>

      {err ? <div className="pc-alert">{err}</div> : null}
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="emp-insights">
        <button type="button" className={`emp-stat${!active ? ' is-on' : ''}`} onClick={() => setParams({})}>
          <b>{insights.employees || total}</b><span>Employees</span>
        </button>
        <button type="button" className={`emp-stat green${active === '1' ? ' is-on' : ''}`} onClick={() => setParams({ active: '1' })}>
          <b>{insights.employees_active}</b><span>Active</span>
        </button>
        <button type="button" className={`emp-stat rose${active === '0' ? ' is-on' : ''}`} onClick={() => setParams({ active: '0' })}>
          <b>{insights.employees_inactive}</b><span>Inactive</span>
        </button>
      </div>

      <div className="pm-card">
        <div className="emp-box-head">
          <div>
            <h2>Employees</h2>
            <p>{loading ? 'Loading…' : `${total} ${label}`}</p>
          </div>
          <div className="ws-actions">
            <button className="ws-btn ghost" type="button" onClick={() => { load(); loadCounts() }} title="Refresh">
              <i className="ri-refresh-line" />Refresh
            </button>
          </div>
        </div>
        <div className="pm-toolbar">
          <input placeholder="Search employees" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="emp-table-wrap">
        <table className="pm-table">
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Company</th>
              <th>Location</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="ws-empty">{loading ? 'Loading…' : 'No employees match this view.'}</td></tr>
            ) : rows.map((r) => (
              <tr key={String(r.id)} className="is-clickable" onClick={() => nav(`/employees/${r.id}`)}>
                <td><Link to={`/employees/${r.id}`}>{fmt(r.employee_code)}</Link></td>
                <td>
                  <Link className="emp-name" to={`/employees/${r.id}`}>
                    <span className="ws-ava">{initials(r.name)}</span>
                    {fmt(r.name)}
                  </Link>
                </td>
                <td>{fmt(r.email)}</td>
                <td>{fmt(r.department_name)}</td>
                <td>{fmt(r.designation)}</td>
                <td>{fmt(r.refex_company_name)}</td>
                <td>{fmt(r.refex_location)}</td>
                <td>
                  <span className={`ws-pri ${isActive(r) ? 'done' : 'hold'}`}>{fmt(r.employment_status_description || (isActive(r) ? 'Active' : 'Inactive'))}</span>
                </td>
                <td className="emp-actions" onClick={(e) => e.stopPropagation()}>
                  <Link className="emp-act view" to={`/employees/${r.id}`} title="View"><i className="ri-eye-line" /></Link>
                  <Link className="emp-act edit" to={`/employees/${r.id}/edit`} title="Edit"><i className="ri-pencil-line" /></Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="emp-pager">
          <button type="button" className="ws-btn ghost" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" className="ws-btn ghost" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  )
}

export function EmployeeDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [row, setRow] = useState<Row | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<'overview' | 'hrms'>('overview')

  useEffect(() => {
    if (!id) return
    employeesApi.get(id).then(setRow).catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
  }, [id])

  if (err) return <p className="muted">{err}</p>
  if (!row) return <p>Loading…</p>
  const active = isActive(row)

  return (
    <div className="emp">
      <Link className="ws-back" to="/employees"><i className="ri-arrow-left-line" />All employees</Link>
      <div className="emp-hero">
        <span className="emp-ava">{initials(row.name)}</span>
        <div>
          <div className="ws-kicker">Employee <span className="ws-code">{fmt(row.employee_code)}</span></div>
          <h1 className="ws-title">{fmt(row.name)}</h1>
          <p className="ws-sub">{fmt(row.designation)} · {fmt(row.department_name)}</p>
          <div className="ws-people">
            <span className={`ws-pri ${active ? 'done' : 'hold'}`}>{active ? 'Active' : fmt(row.employment_status_description)}</span>
            <span className="ws-chip">{fmt(row.refex_company_name)}</span>
            <span className="ws-chip">{fmt(row.refex_location)}</span>
          </div>
        </div>
        <div className="ws-actions">
          <Link className="ws-btn ghost" to={`/employees/${row.id}/edit`}><i className="ri-pencil-line" />Edit</Link>
          <button className="ws-btn danger" type="button" onClick={async () => {
            if (!confirm('Delete this employee?')) return
            await employeesApi.remove(String(row.id))
            nav('/employees')
          }}><i className="ri-delete-bin-line" />Delete</button>
        </div>
      </div>
      <div className="ws-tabs">
        <button type="button" className={`ws-tab${tab === 'overview' ? ' is-on' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button type="button" className={`ws-tab${tab === 'hrms' ? ' is-on' : ''}`} onClick={() => setTab('hrms')}>HRMS profile</button>
      </div>
      <div className="ws-panel">
        {tab === 'overview' ? (
          <>
            <div className="ws-block">
              <h3>Contact</h3>
              <div className="ws-grid">
                <Kv label="Work email">{fmt(row.email)}</Kv>
                <Kv label="Work mobile">{fmt(row.work_mobile)}</Kv>
                <Kv label="Personal email">{fmt(row.personal_email)}</Kv>
                <Kv label="Mobile">{fmt(row.mobile)}</Kv>
              </div>
            </div>
            <div className="ws-block">
              <h3>Organization</h3>
              <div className="ws-grid">
                <Kv label="Company">{fmt(row.refex_company_name)}</Kv>
                <Kv label="Department">{fmt(row.department_name)}</Kv>
                <Kv label="Location">{fmt(row.refex_location)}</Kv>
                <Kv label="Designation">{fmt(row.designation)}</Kv>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="ws-block">
              <h3>Identity</h3>
              <div className="ws-grid">
                <Kv label="Employee ID">{fmt(row.employee_code)}</Kv>
                <Kv label="First name">{fmt(row.first_name)}</Kv>
                <Kv label="Last name">{fmt(row.last_name)}</Kv>
                <Kv label="Title">{fmt(row.title)}</Kv>
                <Kv label="Date of birth">{fmt(row.date_of_birth)}</Kv>
              </div>
            </div>
            <div className="ws-block">
              <h3>Employment</h3>
              <div className="ws-grid">
                <Kv label="Joining date">{fmt(row.joining_date)}</Kv>
                <Kv label="Exit date">{fmt(row.date_of_exit)}</Kv>
                <Kv label="Grade">{fmt(row.grade_name)}</Kv>
                <Kv label="Status">{fmt(row.employment_status_description)}</Kv>
                <Kv label="Supervisor">{fmt(row.supervisor_employee_code)}</Kv>
                <Kv label="Last synced">{fmt(row.synced_at)}</Kv>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Kv({ label, children }: { label: string; children: string }) {
  return (
    <div className="ws-kv">
      <span>{label}</span>
      <b>{children}</b>
    </div>
  )
}

const EMPTY = {
  employee_code: '', first_name: '', last_name: '', email: '', designation: '',
  department_name: '', department_code: '', refex_company_name: '', refex_location: '',
  mobile: '', work_mobile: '', employment_status: '1', employment_status_description: 'Active', notes: '',
}

export function EmployeeForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  function set(k: keyof typeof EMPTY, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!id) return
    employeesApi.get(id).then((e) => setForm({
      employee_code: String(e.employee_code || ''),
      first_name: String(e.first_name || ''),
      last_name: String(e.last_name || ''),
      email: String(e.email || ''),
      designation: String(e.designation || ''),
      department_name: String(e.department_name || ''),
      department_code: String(e.department_code || ''),
      refex_company_name: String(e.refex_company_name || ''),
      refex_location: String(e.refex_location || ''),
      mobile: String(e.mobile || ''),
      work_mobile: String(e.work_mobile || ''),
      employment_status: String(e.employment_status || '1'),
      employment_status_description: String(e.employment_status_description || 'Active'),
      notes: String(e.notes || ''),
    }))
  }, [id])

  async function save() {
    if (!form.first_name.trim() || (!id && !form.employee_code.trim())) {
      setErr('Employee ID and first name are required')
      return
    }
    setBusy(true)
    setErr('')
    try {
      if (id) {
        await employeesApi.update(id, form)
        nav(`/employees/${id}`)
      } else {
        const created = await employeesApi.create(form)
        nav(`/employees/${created.payload?.id || ''}`)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormShell
      backTo={id ? `/employees/${id}` : '/employees'}
      backLabel={id ? 'Back to employee' : 'All employees'}
      title={id ? 'Edit employee' : 'Create employee'}
      subtitle="Same directory used for project and task assignment."
    >
      {err ? <div className="pc-alert" style={{ margin: '0 18px 8px' }}>{err}</div> : null}
      <Section title="Identity">
        <Field label="Employee ID" value={form.employee_code} onChange={(v) => set('employee_code', v)} disabled={Boolean(id)} />
        <Field label="First name" value={form.first_name} onChange={(v) => set('first_name', v)} />
        <Field label="Last name" value={form.last_name} onChange={(v) => set('last_name', v)} />
        <Field label="Email" type="email" value={form.email} onChange={(v) => set('email', v)} />
      </Section>
      <Section title="Organization">
        <Field label="Designation" value={form.designation} onChange={(v) => set('designation', v)} />
        <Field label="Department" value={form.department_name} onChange={(v) => set('department_name', v)} />
        <Field label="Department code" value={form.department_code} onChange={(v) => set('department_code', v)} />
        <Field label="Company" value={form.refex_company_name} onChange={(v) => set('refex_company_name', v)} />
        <Field label="Location" value={form.refex_location} onChange={(v) => set('refex_location', v)} />
      </Section>
      <Section title="Contact">
        <Field label="Mobile" value={form.mobile} onChange={(v) => set('mobile', v)} />
        <Field label="Work mobile" value={form.work_mobile} onChange={(v) => set('work_mobile', v)} />
        <Field label="Status" value={form.employment_status_description} onChange={(v) => {
          set('employment_status_description', v)
          set('employment_status', v === 'Active' ? '1' : '0')
        }} options={['Active', 'Inactive']} />
        <Field label="Notes" type="textarea" full value={form.notes} onChange={(v) => set('notes', v)} />
      </Section>
      <div className="pm-form-actions">
        <button className="ws-btn" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="ws-btn ghost" type="button" onClick={() => nav(id ? `/employees/${id}` : '/employees')}>Cancel</button>
      </div>
    </FormShell>
  )
}

export function EmployeeImport() {
  const nav = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [err, setErr] = useState('')
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)

  return (
    <div className="emp">
      <Link className="ws-back" to="/employees"><i className="ri-arrow-left-line" />All employees</Link>
      <h1 className="ws-title">Import employees</h1>
      <p className="ws-sub">Adrenalin Live API or Excel / CSV.</p>
      {err ? <div className="pc-alert">{err}</div> : null}
      <div className="pc-card" style={{ marginTop: 16 }}>
        <h2>Sync from Adrenalin</h2>
        <p className="ws-sub">Pulls the live directory and upserts by employee ID.</p>
        <button className="ws-btn" type="button" disabled={busy || syncing} onClick={async () => {
          setSyncing(true); setErr(''); setSummary(null)
          try { setSummary((await employeesApi.sync()).payload) } catch (e) { setErr(e instanceof Error ? e.message : 'Sync failed') }
          finally { setSyncing(false) }
        }}>{syncing ? 'Syncing…' : 'Sync from HRMS'}</button>
      </div>
      <div className="pc-card" style={{ marginTop: 12 }}>
        <h2>Upload file</h2>
        <p className="ws-sub">Accepts .xlsx, .xls, or .csv using the Refex HRMS export columns.</p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <div className="ws-actions" style={{ marginTop: 12 }}>
          <button className="ws-btn" type="button" disabled={!file || busy} onClick={async () => {
            if (!file) return
            setBusy(true); setErr(''); setSummary(null)
            try { setSummary((await employeesApi.importFile(file)).payload) } catch (e) { setErr(e instanceof Error ? e.message : 'Import failed') }
            finally { setBusy(false) }
          }}>{busy ? 'Importing…' : 'Import'}</button>
          <button className="ws-btn ghost" type="button" onClick={() => nav('/employees')}>Cancel</button>
        </div>
      </div>
      {summary ? (
        <div className="pc-card" style={{ marginTop: 12 }}>
          <h2>Result</h2>
          <p className="ws-sub">Created {String(summary.created || 0)} · Updated {String(summary.updated || 0)} · Skipped {String(summary.skipped || 0)}</p>
          <Link className="ws-btn" to="/employees">View employees</Link>
        </div>
      ) : null}
    </div>
  )
}
