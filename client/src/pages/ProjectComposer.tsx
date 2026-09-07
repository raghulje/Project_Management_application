import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { employeesApi, mastersApi, projectsApi } from '../api/client'
import { useAuth } from '../api/AuthContext'
import {
  CATEGORY_OPTS, COMPANY_OPTS, FUNCTION_OPTS, GOVERNANCE_OPTS,
  PRIORITY_OPTS, PROJECT_TYPE_OPTS, RISK_OPTS, STATUS_OPTS, dateInput,
} from './RecordUi'

const FLAGS: { key: string; label: string }[] = [
  { key: 'cb_analysis_available', label: 'CB analysis document' },
  { key: 'ai_usage', label: 'AI usage' },
  { key: 'brd_available', label: 'BRD available' },
  { key: 'process_document', label: 'Process document' },
  { key: 'support_available', label: 'Support document' },
  { key: 'reports_available', label: 'Reports available' },
  { key: 'integrated_with_tally', label: 'Integrated with Tally' },
  { key: 'integrated_with_sap', label: 'Integrated with SAP' },
  { key: 'integrated_with_power_bi', label: 'Integrated with Power BI' },
]

const EMPTY: Record<string, string> = {
  name: '',
  company_name: '',
  project_type: '',
  function_type: '',
  status: 'Open',
  priority: 'Low',
  start_date: '',
  end_date: '',
  risk: '',
  risk_mitigation_details: '',
  business_owner_name: '',
  sponsor_name: '',
  project_owner_name: '',
  project_manager_name: '',
  cos_owner_name: '',
  tco_efforts: '',
  governance_frequency: '',
  vendor_name: '',
  tech_stack: '',
  assignee_name: '',
  requester_name: '',
  category: '',
  rag: '',
  project_request: 'New',
  entity: '',
  business: '',
  ai_details: '',
  objectives: '',
  developer_name: '',
  cb_analysis_available: '0',
  ai_usage: '0',
  brd_available: '0',
  process_document: '0',
  support_available: '0',
  reports_available: '0',
  integrated_with_tally: '0',
  integrated_with_sap: '0',
  integrated_with_power_bi: '0',
}

function on(v: unknown) {
  return v === true || v === 1 || v === '1' || v === 'true'
}

export default function ProjectComposer() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [people, setPeople] = useState<string[]>([])
  const [companies, setCompanies] = useState<string[]>(COMPANY_OPTS)
  const [form, setForm] = useState<Record<string, string>>(() => ({
    ...EMPTY,
    requester_name: user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' '),
  }))

  useEffect(() => {
    employeesApi.selectlist().then((r) => {
      setPeople((r.results || []).map((o) => o.text.replace(/\s+\([^)]+\)\s*$/, '')))
    }).catch(() => undefined)
    mastersApi.companies.list({ limit: 300 }).then((r) => {
      const names = r.rows.map((row) => String(row.name || '')).filter(Boolean)
      if (names.length) setCompanies([...new Set([...COMPANY_OPTS, ...names])])
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!id) return
    projectsApi.get(id).then((r) => {
      setForm({
        ...EMPTY,
        name: String(r.name || ''),
        company_name: String(r.company_name || ''),
        project_type: String(r.project_type || ''),
        function_type: String(r.function_type || ''),
        status: String(r.status || 'Open'),
        priority: String(r.priority || 'Low'),
        start_date: dateInput(r.start_date),
        end_date: dateInput(r.end_date),
        risk: String(r.risk || ''),
        risk_mitigation_details: String(r.risk_mitigation_details || ''),
        business_owner_name: String(r.business_owner_name || ''),
        sponsor_name: String(r.sponsor_name || ''),
        project_owner_name: String(r.project_owner_name || ''),
        project_manager_name: String(r.project_manager_name || ''),
        cos_owner_name: String(r.cos_owner_name || ''),
        tco_efforts: r.tco_efforts != null ? String(r.tco_efforts) : '',
        governance_frequency: String(r.governance_frequency || ''),
        vendor_name: String(r.vendor_name || ''),
        tech_stack: String(r.tech_stack || ''),
        assignee_name: String(r.assignee_name || ''),
        requester_name: String(r.requester_name || ''),
        category: String(r.category || ''),
        rag: String(r.rag || ''),
        project_request: String(r.project_request || 'New'),
        entity: String(r.entity || ''),
        business: String(r.business || ''),
        ai_details: String(r.ai_details || ''),
        objectives: String(r.objectives || ''),
        developer_name: String(r.developer_name || ''),
        cb_analysis_available: on(r.cb_analysis_available) ? '1' : '0',
        ai_usage: on(r.ai_usage) ? '1' : '0',
        brd_available: on(r.brd_available) ? '1' : '0',
        process_document: on(r.process_document) ? '1' : '0',
        support_available: on(r.support_available) ? '1' : '0',
        reports_available: on(r.reports_available) ? '1' : '0',
        integrated_with_tally: on(r.integrated_with_tally) ? '1' : '0',
        integrated_with_sap: on(r.integrated_with_sap) ? '1' : '0',
        integrated_with_power_bi: on(r.integrated_with_power_bi) ? '1' : '0',
      })
    })
  }, [id])

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  const missing = useMemo(() => {
    const req = ['name', 'function_type', 'start_date', 'end_date', 'business_owner_name', 'governance_frequency', 'priority']
    return req.filter((k) => !String(form[k] || '').trim())
  }, [form])

  async function save() {
    setErr('')
    if (missing.length) {
      setErr('Fill the required fields highlighted below.')
      return
    }
    setBusy(true)
    try {
      const body: Record<string, unknown> = { ...form }
      for (const f of FLAGS) body[f.key] = form[f.key] === '1'
      body.tco_efforts = form.tco_efforts ? Number(form.tco_efforts) : null
      if (id) {
        await projectsApi.update(id, body)
        nav(`/projects/${id}`)
        return
      }
      const created = await projectsApi.create(body)
      nav(`/projects/${created.payload?.id || ''}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the project')
    } finally {
      setBusy(false)
    }
  }

  const back = id ? `/projects/${id}` : '/projects'

  return (
    <div className="pc">
      <header className="pc-top">
        <div>
          <Link className="ws-back" to={back}><i className="ri-arrow-left-line" />{id ? 'Back to project' : 'All projects'}</Link>
          <h1>{id ? 'Edit project' : 'Create project'}</h1>
          <p>Same fields as Kissflow — laid out as a workspace, not a spreadsheet.</p>
        </div>
        <div className="pc-top-actions">
          <button className="ws-btn ghost" type="button" onClick={() => nav(back)}>Discard</button>
          <button className="ws-btn" type="button" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : id ? 'Save changes' : 'Submit'}
          </button>
        </div>
      </header>

      {err ? <div className="pc-alert">{err}</div> : null}

      <div className="pc-layout">
        <div className="pc-main">
          <section className="pc-card">
            <label className={`pc-title${miss(form, 'name') ? ' is-miss' : ''}`}>
              <span>Project name <i>*</i></span>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="What are we delivering?" />
            </label>
            <div className="pc-row pc-4">
              <Pick label="Company name" value={form.company_name} onChange={(v) => set('company_name', v)} options={companies} />
              <Pick label="Project type" value={form.project_type} onChange={(v) => set('project_type', v)} options={PROJECT_TYPE_OPTS} />
              <Pick label="Functions" required missing={miss(form, 'function_type')} value={form.function_type} onChange={(v) => set('function_type', v)} options={FUNCTION_OPTS} />
              <Pick label="Category" value={form.category} onChange={(v) => set('category', v)} options={CATEGORY_OPTS} />
            </div>
            <div className="pc-row pc-3">
              <Pick label="Project status" value={form.status} onChange={(v) => set('status', v)} options={STATUS_OPTS} />
              <Pick label="Priority" required missing={miss(form, 'priority')} value={form.priority} onChange={(v) => set('priority', v)} options={PRIORITY_OPTS} />
              <Pick label="Risk" value={form.risk} onChange={(v) => set('risk', v)} options={RISK_OPTS} />
            </div>
          </section>

          <section className="pc-card">
            <h2>Schedule</h2>
            <div className="pc-row pc-3">
              <Box label="Start date" required missing={miss(form, 'start_date')}>
                <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
              </Box>
              <Box label="End date" required missing={miss(form, 'end_date')}>
                <input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
              </Box>
              <Pick label="Governance frequency" required missing={miss(form, 'governance_frequency')} value={form.governance_frequency} onChange={(v) => set('governance_frequency', v)} options={GOVERNANCE_OPTS} />
            </div>
            <Box label="Risk mitigation details">
              <input value={form.risk_mitigation_details} onChange={(e) => set('risk_mitigation_details', e.target.value)} placeholder="What could slip, and how we contain it" />
            </Box>
          </section>

          <section className="pc-card">
            <h2>People</h2>
            <div className="pc-row pc-2">
              <Person label="Business owner" required missing={miss(form, 'business_owner_name')} value={form.business_owner_name} onChange={(v) => set('business_owner_name', v)} people={people} />
              <Person label="Sponsor" value={form.sponsor_name} onChange={(v) => set('sponsor_name', v)} people={people} />
              <Person label="Project owner" value={form.project_owner_name} onChange={(v) => set('project_owner_name', v)} people={people} />
              <Person label="Project manager" value={form.project_manager_name} onChange={(v) => set('project_manager_name', v)} people={people} />
              <Person label="COS owner" value={form.cos_owner_name} onChange={(v) => set('cos_owner_name', v)} people={people} />
              <Person label="Developer" value={form.developer_name} onChange={(v) => set('developer_name', v)} people={people} />
            </div>
          </section>

          <section className="pc-card">
            <h2>Delivery</h2>
            <div className="pc-row pc-3">
              <Box label="TCO / Efforts">
                <input type="number" min="0" step="0.5" value={form.tco_efforts} onChange={(e) => set('tco_efforts', e.target.value)} placeholder="Days or hours" />
              </Box>
              <Box label="Vendor name">
                <input value={form.vendor_name} onChange={(e) => set('vendor_name', e.target.value)} />
              </Box>
              <Box label="Tech stack">
                <input list="pc-stack" value={form.tech_stack} onChange={(e) => set('tech_stack', e.target.value)} placeholder="React, SAP, Power BI…" />
                <datalist id="pc-stack">
                  {['React', 'SAP', 'Power BI', 'Tally', 'Python', 'Node', 'Cursor'].map((s) => <option key={s} value={s} />)}
                </datalist>
              </Box>
            </div>
            {form.ai_usage === '1' ? (
              <Box label="AI details">
                <input value={form.ai_details} onChange={(e) => set('ai_details', e.target.value)} placeholder="How AI is used" />
              </Box>
            ) : null}
            <Box label="Objectives">
              <textarea rows={3} value={form.objectives} onChange={(e) => set('objectives', e.target.value)} placeholder="Outcome this project must produce" />
            </Box>
          </section>

          <section className="pc-card">
            <h2>Documents & integrations</h2>
            <div className="pc-flags">
              {FLAGS.map((f) => (
                <div key={f.key} className={`pc-flag${form[f.key] === '1' ? ' is-on' : ''}`}>
                  <span>{f.label}</span>
                  <div className="pc-yesno">
                    <button type="button" className={form[f.key] === '0' ? 'is-on' : ''} onClick={() => set(f.key, '0')}>No</button>
                    <button type="button" className={form[f.key] === '1' ? 'is-on' : ''} onClick={() => set(f.key, '1')}>Yes</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="pc-side">
          <section className="pc-card">
            <h2>Assignment</h2>
            <Person label="Assignee" value={form.assignee_name} onChange={(v) => set('assignee_name', v)} people={people} placeholder="Unassigned" />
            <Pick label="Priority" required missing={miss(form, 'priority')} value={form.priority} onChange={(v) => set('priority', v)} options={PRIORITY_OPTS} />
            <Box label="Due date">
              <input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
            </Box>
            <Person label="Requester" value={form.requester_name} onChange={(v) => set('requester_name', v)} people={people} />
          </section>
          <section className="pc-card">
            <h2>More</h2>
            <Pick label="Project request" value={form.project_request} onChange={(v) => set('project_request', v)} options={['New', 'Enhancement', 'Support']} />
            <Box label="Entity"><input value={form.entity} onChange={(e) => set('entity', e.target.value)} /></Box>
            <Box label="Business"><input value={form.business} onChange={(e) => set('business', e.target.value)} /></Box>
          </section>
        </aside>
      </div>

      <footer className="pc-foot">
        <button className="ws-btn ghost" type="button" onClick={() => nav(back)}>Discard</button>
        <button className="ws-btn" type="button" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : id ? 'Save changes' : 'Submit'}
        </button>
      </footer>
    </div>
  )
}

function miss(form: Record<string, string>, key: string) {
  return !String(form[key] || '').trim()
}

function Box({ label, required, missing, children }: { label: string; required?: boolean; missing?: boolean; children: ReactNode }) {
  return (
    <label className={`pc-field${missing ? ' is-miss' : ''}`}>
      <span>{label}{required ? <i>*</i> : null}</span>
      {children}
    </label>
  )
}

function Pick({
  label, value, onChange, options, required, missing,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; required?: boolean; missing?: boolean
}) {
  return (
    <Box label={label} required={required} missing={missing}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Box>
  )
}

function Person({
  label, value, onChange, people, required, missing, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; people: string[]; required?: boolean; missing?: boolean; placeholder?: string
}) {
  const listId = `pc-people-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <Box label={label} required={required} missing={missing}>
      <input list={listId} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>{people.map((p) => <option key={p} value={p} />)}</datalist>
    </Box>
  )
}
