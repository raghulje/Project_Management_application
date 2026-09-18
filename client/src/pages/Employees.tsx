import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { dashboardApi, employeesApi } from '../api/client'
import { OwnerAvatar, StatusPill } from './WorkspaceKit'
import { Alert } from './AdminKit'
import { FrAcc, FrChips, FrField, FrGrid, FrHeader, FrKpi, FrPage, FrPager, FrPanel, FrSection, FrUpload, FrValue } from './FormReference'

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
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [insights, setInsights] = useState({ employees: 0, employees_active: 0, employees_inactive: 0 })
  const pageSize = 20

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
      offset: (page - 1) * pageSize,
      active: active === '1' ? '1' : active === '0' ? '0' : undefined,
    }).then((r) => {
      setRows(r.rows)
      setTotal(r.total)
      setErr('')
    }).catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false))
  }

  useEffect(() => { loadCounts() }, [])
  useEffect(() => { setPage(1) }, [active, search])
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
  const chipValue = active === '1' ? 'Active' : active === '0' ? 'Inactive' : 'All'

  return (
    <FrPage>
      <FrHeader
        crumbs={[{ to: '/admin', label: 'Admin' }, { label: 'Employees' }]}
        title="Employees"
        count={loading ? 'Loading...' : `${total} total records`}
      >
        <input className="fr-search" placeholder="Search records..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="ws-btn ghost" type="button" disabled={syncing} onClick={() => void employeesApi.syncMasters().then(() => setMsg('Masters rebuilt'))}>
          Rebuild masters
        </button>
        <button className="ws-btn ghost" type="button" disabled={syncing} onClick={() => void sync()}>
          <i className={syncing ? 'ri-loader-4-line' : 'ri-refresh-line'} />
          {syncing ? 'Syncing...' : 'Sync from HRMS'}
        </button>
        <Link className="ws-btn ghost" to="/employees/import"><i className="ri-file-upload-line" />Import</Link>
        <Link className="ws-btn" to="/employees/new"><i className="ri-add-line" />Create</Link>
      </FrHeader>
      {err ? <Alert kind="err">{err}</Alert> : null}
      {msg ? <Alert kind="ok">{msg}</Alert> : null}
      <FrChips
        items={[
          { label: 'All', count: insights.employees || total, value: 'All' },
          { label: 'Active', count: insights.employees_active, value: 'Active' },
          { label: 'Inactive', count: insights.employees_inactive, value: 'Inactive' },
        ]}
        value={chipValue}
        onChange={(v) => {
          if (v === 'Active') setParams({ active: '1' })
          else if (v === 'Inactive') setParams({ active: '0' })
          else setParams({})
        }}
      />
      <FrPanel>
        <div className="fr-table-wrap is-cards">
          <table className="fr-table">
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
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="fr-empty">{loading ? 'Loading...' : 'No records found'}</td></tr>
              ) : rows.map((r) => (
                <tr key={String(r.id)} className="is-clickable" onClick={() => nav(`/employees/${r.id}`)}>
                  <td data-label="Employee ID"><Link to={`/employees/${r.id}`}>{fmt(r.employee_code)}</Link></td>
                  <td data-label="Name">
                    <span className="fr-owner-row">
                      <OwnerAvatar name={r.name} />
                      <span className="fr-name-cell">
                        <Link to={`/employees/${r.id}`} className="fr-name">{fmt(r.name)}</Link>
                        <span className="fr-sub">{fmt(r.email)}</span>
                      </span>
                    </span>
                  </td>
                  <td data-label="Email">{fmt(r.email)}</td>
                  <td data-label="Department">
                    <span className="fr-name-cell"><span className="fr-name">{fmt(r.department_name)}</span></span>
                  </td>
                  <td data-label="Designation">
                    <span className="fr-name-cell"><span className="fr-name">{fmt(r.designation)}</span></span>
                  </td>
                  <td data-label="Company">
                    <span className="fr-name-cell"><span className="fr-name">{fmt(r.refex_company_name)}</span></span>
                  </td>
                  <td data-label="Location">
                    <span className="fr-name-cell"><span className="fr-name">{fmt(r.refex_location)}</span></span>
                  </td>
                  <td data-label="Status">
                    <StatusPill value={r.employment_status_description || (isActive(r) ? 'Active' : 'Inactive')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <FrPager page={page} pages={pages} total={total} pageSize={pageSize} onPage={setPage} />
      </FrPanel>
    </FrPage>
  )
}

export function EmployeeDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [row, setRow] = useState<Row | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!id) return
    employeesApi.get(id).then(setRow).catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
  }, [id])

  if (err) return <FrPage><FrHeader crumbs={[{ to: '/admin', label: 'Admin' }, { to: '/employees', label: 'Employees' }, { label: 'Employee' }]} title="Employee" /><Alert kind="err">{err}</Alert></FrPage>
  if (!row) return <FrPage><FrHeader crumbs={[{ to: '/admin', label: 'Admin' }, { to: '/employees', label: 'Employees' }, { label: 'Employee' }]} title="Employee" count="Loading..." /></FrPage>

  return (
    <FrPage>
      <FrHeader
        crumbs={[{ to: '/admin', label: 'Admin' }, { to: '/employees', label: 'Employees' }, { label: fmt(row.name) }]}
        title={fmt(row.name)}
        badge={<StatusPill value={row.employment_status_description} />}
      >
        <Link className="ws-btn ghost" to={`/employees/${row.id}/edit`}><i className="ri-pencil-line" />Edit</Link>
        <button className="ws-btn danger" type="button" onClick={async () => {
          if (!confirm('Delete this employee?')) return
          await employeesApi.remove(String(row.id))
          nav('/employees')
        }}><i className="ri-delete-bin-line" />Delete</button>
      </FrHeader>
      <FrAcc>
        <FrSection label="Identity">
          <FrGrid>
            <FrValue label="Employee ID">{fmt(row.employee_code)}</FrValue>
            <FrValue label="First name">{fmt(row.first_name)}</FrValue>
            <FrValue label="Last name">{fmt(row.last_name)}</FrValue>
            <FrValue label="Title">{fmt(row.title)}</FrValue>
            <FrValue label="Date of birth">{fmt(row.date_of_birth)}</FrValue>
            <FrValue label="Status">{fmt(row.employment_status_description)}</FrValue>
          </FrGrid>
        </FrSection>
        <FrSection label="Contact">
          <FrGrid>
            <FrValue label="Work email">{fmt(row.email)}</FrValue>
            <FrValue label="Work mobile">{fmt(row.work_mobile)}</FrValue>
            <FrValue label="Personal email">{fmt(row.personal_email)}</FrValue>
            <FrValue label="Mobile">{fmt(row.mobile)}</FrValue>
          </FrGrid>
        </FrSection>
        <FrSection label="Organization">
          <FrGrid>
            <FrValue label="Company">{fmt(row.refex_company_name)}</FrValue>
            <FrValue label="Department">{fmt(row.department_name)}</FrValue>
            <FrValue label="Location">{fmt(row.refex_location)}</FrValue>
            <FrValue label="Designation">{fmt(row.designation)}</FrValue>
          </FrGrid>
        </FrSection>
        <FrSection label="Employment">
          <FrGrid>
            <FrValue label="Joining date">{fmt(row.joining_date)}</FrValue>
            <FrValue label="Exit date">{fmt(row.date_of_exit)}</FrValue>
            <FrValue label="Grade">{fmt(row.grade_name)}</FrValue>
            <FrValue label="Supervisor">{fmt(row.supervisor_employee_code)}</FrValue>
            <FrValue label="Last synced">{fmt(row.synced_at)}</FrValue>
          </FrGrid>
        </FrSection>
      </FrAcc>
    </FrPage>
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
    <FrPage>
      <FrHeader
        crumbs={[
          { to: '/admin', label: 'Admin' },
          { to: '/employees', label: 'Employees' },
          ...(id ? [{ to: `/employees/${id}`, label: [form.first_name, form.last_name].filter(Boolean).join(' ') || 'Employee' }] : []),
          { label: id ? 'Edit' : 'Create' },
        ]}
        title={id ? 'Edit employee' : 'Create employee'}
      >
        <button className="ws-btn ghost" type="button" onClick={() => nav(id ? `/employees/${id}` : '/employees')}>Cancel</button>
        <button className="ws-btn" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving...' : 'Save'}</button>
      </FrHeader>
      {err ? <Alert kind="err">{err}</Alert> : null}
      <FrAcc>
        <FrSection label="Identity">
          <FrGrid>
            <FrField label="Employee ID" required>
              <input value={form.employee_code} disabled={Boolean(id)} onChange={(e) => set('employee_code', e.target.value)} />
            </FrField>
            <FrField label="Email">
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </FrField>
            <FrField label="First name" required>
              <input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
            </FrField>
            <FrField label="Last name">
              <input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
            </FrField>
          </FrGrid>
        </FrSection>
        <FrSection label="Organization">
          <FrGrid>
            <FrField label="Designation">
              <input value={form.designation} onChange={(e) => set('designation', e.target.value)} />
            </FrField>
            <FrField label="Department">
              <input value={form.department_name} onChange={(e) => set('department_name', e.target.value)} />
            </FrField>
            <FrField label="Department code">
              <input value={form.department_code} onChange={(e) => set('department_code', e.target.value)} />
            </FrField>
            <FrField label="Company">
              <input value={form.refex_company_name} onChange={(e) => set('refex_company_name', e.target.value)} />
            </FrField>
            <FrField label="Location">
              <input value={form.refex_location} onChange={(e) => set('refex_location', e.target.value)} />
            </FrField>
          </FrGrid>
        </FrSection>
        <FrSection label="Contact">
          <FrGrid>
            <FrField label="Mobile">
              <input value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
            </FrField>
            <FrField label="Work mobile">
              <input value={form.work_mobile} onChange={(e) => set('work_mobile', e.target.value)} />
            </FrField>
            <FrField label="Status">
              <select value={form.employment_status_description} onChange={(e) => {
                const v = e.target.value
                set('employment_status_description', v)
                set('employment_status', v === 'Active' ? '1' : '0')
              }}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </FrField>
            <FrField label="Notes" span={4}>
              <textarea rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </FrField>
          </FrGrid>
        </FrSection>
      </FrAcc>
    </FrPage>
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
    <FrPage>
      <FrHeader
        crumbs={[{ to: '/admin', label: 'Admin' }, { to: '/employees', label: 'Employees' }, { label: 'Import' }]}
        title="Import employees"
        count="Adrenalin Live API or Excel / CSV"
      >
        <button className="ws-btn ghost" type="button" onClick={() => nav('/employees')}>Discard</button>
        <button className="ws-btn" type="button" disabled={!file || busy} onClick={async () => {
          if (!file) return
          setBusy(true); setErr(''); setSummary(null)
          try { setSummary((await employeesApi.importFile(file)).payload) } catch (e) { setErr(e instanceof Error ? e.message : 'Import failed') }
          finally { setBusy(false) }
        }}>{busy ? 'Importing...' : 'Submit'}</button>
      </FrHeader>
      {err ? <Alert kind="err">{err}</Alert> : null}
      {summary ? (
        <FrKpi cards={[
          { label: 'Created', value: Number(summary.created || 0), tone: 'green', icon: 'ri-user-add-line' },
          { label: 'Updated', value: Number(summary.updated || 0), icon: 'ri-refresh-line' },
          { label: 'Skipped', value: Number(summary.skipped || 0), tone: 'amber', icon: 'ri-skip-forward-line' },
        ]} />
      ) : null}
      <FrAcc>
        <FrSection label="Sync from Adrenalin">
          <p className="fr-sub" style={{ margin: '0 0 14px' }}>Pulls the live directory and upserts by employee ID.</p>
          <button className="ws-btn" type="button" disabled={busy || syncing} onClick={async () => {
            setSyncing(true); setErr(''); setSummary(null)
            try { setSummary((await employeesApi.sync()).payload) } catch (e) { setErr(e instanceof Error ? e.message : 'Sync failed') }
            finally { setSyncing(false) }
          }}>{syncing ? 'Syncing...' : 'Sync from HRMS'}</button>
        </FrSection>
        <FrSection label="Upload file">
          <p className="fr-sub" style={{ margin: '0 0 14px' }}>Accepts .xlsx, .xls, or .csv using the Refex HRMS export columns.</p>
          <FrGrid>
            <FrField label="Spreadsheet" span={2}>
              <FrUpload file={file} accept=".xlsx,.xls,.csv" hint="Excel or CSV" onPick={setFile} onClear={() => setFile(null)} />
            </FrField>
          </FrGrid>
        </FrSection>
      </FrAcc>
      {summary ? (
        <p className="fr-sub" style={{ marginTop: 8 }}>
          <Link to="/employees">View employees</Link>
        </p>
      ) : null}
    </FrPage>
  )
}
