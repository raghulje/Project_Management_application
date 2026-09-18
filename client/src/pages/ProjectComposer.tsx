import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { mastersApi, projectsApi, activityApi } from '../api/client'
import { useAuth } from '../api/AuthContext'
import {
  CATEGORY_OPTS, COMPANY_OPTS, FUNCTION_OPTS, GOVERNANCE_OPTS,
  PRIORITY_OPTS, PROJECT_TYPE_OPTS, RISK_OPTS, STATUS_OPTS, dateInput,
} from './RecordUi'
import {
  AccessMark, PolicyBanner, RequestAccessModal, asPolicy, canSaveRecord, fieldAccess,
  useRequestAccess, type EditPolicy,
} from './FieldAccess'
import WsSelect from './WsSelect'
import WsDate from './WsDate'
import PersonPicker from './PersonPicker'
import StatusTracker, { type StatusRevision } from './StatusTracker'
import { defaultList, fromState, pageCrumbs, stateFor } from '../lib/recordNav'
import { displayEntity, matchChoice, matchOption, profileFromUser, withChoice } from '../lib/employeeDefaults'
import { isClosedStatus, ReopenAction, ReopenBadge } from './WorkspaceKit'
import { FrAcc, FrField, FrFoot, FrGrid, FrSheet, FrSheetBody, FrSheetHead, FrSheetMain, FrSection, FrUpload, FrYesNo } from './FormReference'

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

type FlagFile = { id: number; file_name: string }

function on(v: unknown) {
  return v === true || v === 1 || v === '1' || v === 'true'
}

export default function ProjectComposer() {
  const { id } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const { user, isEmployee } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [policy, setPolicy] = useState<EditPolicy | null>(null)
  const req = useRequestAccess()
  const [companies, setCompanies] = useState<string[]>(COMPANY_OPTS)
  const [form, setForm] = useState<Record<string, string>>(() => ({
    ...EMPTY,
    requester_name: user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' '),
  }))
  const [pending, setPending] = useState<Record<string, File | null>>({})
  const [savedFiles, setSavedFiles] = useState<Record<string, FlagFile>>({})
  const [rail, setRail] = useState<'open' | 'min'>('open')
  const [createdAt, setCreatedAt] = useState('')
  const [revisions, setRevisions] = useState<StatusRevision[]>([])
  const [reopenCount, setReopenCount] = useState(0)
  const seeded = useRef(false)

  useEffect(() => {
    mastersApi.companies.list({ limit: 300 }).then((r) => {
      const names = r.rows.map((row) => String(row.name || '')).filter(Boolean)
      if (names.length) setCompanies((prev) => [...new Set([...prev, ...COMPANY_OPTS, ...names])])
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (id || seeded.current) return
    const profile = profileFromUser(user)
    if (!profile) return
    seeded.current = true
    const company = matchChoice(profile.company, [...COMPANY_OPTS, ...companies])
    const category = matchOption(profile.department, CATEGORY_OPTS)
    setForm((f) => ({
      ...f,
      company_name: f.company_name || company,
      entity: f.entity || displayEntity(profile),
      requester_name: f.requester_name || profile.name,
      assignee_name: f.assignee_name || profile.name,
      project_owner_name: f.project_owner_name || profile.name,
      category: f.category || category,
      business: f.business || profile.business_line,
    }))
    if (company) setCompanies((prev) => withChoice(prev, company))
  }, [id, user])

  useEffect(() => {
    if (!id) return
    projectsApi.get(id).then((r) => {
      setPolicy(asPolicy(r.edit_policy))
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
      setCreatedAt(String(r.created_at || r.kissflow_created_at || ''))
      setRevisions((r.revisions as StatusRevision[]) || [])
      setReopenCount(Number(r.reopen_count || 0))
    })
    activityApi.bundle('project', id).then((b) => {
      const next: Record<string, FlagFile> = {}
      for (const f of b.files || []) {
        const kind = String(f.kind || '')
        if (kind && !next[kind]) next[kind] = { id: Number(f.id), file_name: String(f.file_name || '') }
      }
      setSavedFiles(next)
    }).catch(() => undefined)
  }, [id])

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  const missing = useMemo(() => {
    const req = ['name', 'function_type', 'start_date', 'end_date', 'business_owner_name', 'governance_frequency', 'priority']
    const keys = req.filter((k) => !String(form[k] || '').trim())
    for (const f of FLAGS) {
      if (form[f.key] !== '1') continue
      if (!pending[f.key] && !savedFiles[f.key]) keys.push(f.key)
    }
    if (form.ai_usage === '1' && !String(form.ai_details || '').trim()) keys.push('ai_details')
    return keys
  }, [form, pending, savedFiles])

  async function save(mode: 'save' | 'submit' = 'submit') {
    setErr('')
    if (missing.length) {
      setErr('Fill the required fields — including a document upload for every item marked Yes.')
      return
    }
    setBusy(true)
    try {
      const body: Record<string, unknown> = { ...form }
      for (const f of FLAGS) body[f.key] = form[f.key] === '1'
      body.tco_efforts = form.tco_efforts ? Number(form.tco_efforts) : null
      let recordId = id || ''
      if (id) {
        await projectsApi.update(id, body)
      } else {
        const created = await projectsApi.create(body)
        recordId = String(created.payload?.id || '')
      }
      if (recordId) {
        for (const f of FLAGS) {
          if (form[f.key] === '1' && pending[f.key]) {
            await activityApi.upload('project', recordId, pending[f.key] as File, f.key)
          }
          if (form[f.key] !== '1' && savedFiles[f.key]) {
            await activityApi.removeFile(savedFiles[f.key].id)
          }
        }
      }
      nav(mode === 'save' ? `/projects/${recordId}/edit` : `/projects/${recordId}`, { state: loc.state })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the project')
    } finally {
      setBusy(false)
    }
  }

  const from = fromState(loc)
  const list = defaultList('project', isEmployee)
  const back = from || (id ? `/projects/${id}` : list)
  const closed = isClosedStatus(form.status)
  const lock = (f: string) => fieldAccess(policy, f).locked || (f === 'status' && closed)
  const mark = (f: string) => <AccessMark policy={policy} field={f} onRequest={req.ask} />
  const readOnly = !canSaveRecord(policy)
  const crumbs = pageCrumbs({
    loc,
    kind: 'project',
    isEmployee,
    current: id ? 'Edit' : 'New project',
    parents: [id ? { to: `/projects/${id}`, label: form.name || 'Project' } : null],
  })

  return (
    <FrSheet min={rail === 'min'}>
      <FrSheetHead title="Project" crumbs={crumbs} closeTo={back} closeState={stateFor(back, loc)}>
        {reopenCount > 0 ? <ReopenBadge count={reopenCount} /> : null}
        {id ? (
          <ReopenAction
            noun="project"
            status={form.status}
            onSubmit={async (reason) => {
              await projectsApi.reopen(id, reason)
              const r = await projectsApi.get(id)
              set('status', String(r.status || 'Open'))
              setRevisions((r.revisions as StatusRevision[]) || [])
              setReopenCount(Number(r.reopen_count || 0))
            }}
          />
        ) : null}
        {policy?.can_request ? (
          <button className="ws-btn ghost" type="button" onClick={() => req.ask([])}>
            <i className="ri-lock-unlock-line" />Request change
          </button>
        ) : null}
      </FrSheetHead>

      {err ? <div className="pc-alert">{err}</div> : null}
      <PolicyBanner policy={policy} />
      {id ? (
        <RequestAccessModal
          open={req.open}
          itemType="project"
          itemId={id}
          policy={policy}
          preset={req.preset}
          onClose={req.close}
          onDone={setPolicy}
        />
      ) : null}

      <FrSheetBody>
        <FrSheetMain>
      <FrAcc>
        <FrSection label="Overview">
          <FrGrid>
            <FrField label="Project name" required missing={miss(form, 'name')} locked={lock('name')} mark={mark('name')} span={4}>
              <input value={form.name} disabled={lock('name')} onChange={(e) => set('name', e.target.value)} placeholder="What are we delivering?" />
            </FrField>
            <Pick label="Company name" locked={lock('company_name')} mark={mark('company_name')} value={form.company_name} onChange={(v) => set('company_name', v)} options={companies} />
            <Pick label="Project type" locked={lock('project_type')} mark={mark('project_type')} value={form.project_type} onChange={(v) => set('project_type', v)} options={PROJECT_TYPE_OPTS} />
            <Pick label="Functions" locked={lock('function_type')} mark={mark('function_type')} required missing={miss(form, 'function_type')} value={form.function_type} onChange={(v) => set('function_type', v)} options={FUNCTION_OPTS} />
            <Pick label="Category" locked={lock('category')} mark={mark('category')} value={form.category} onChange={(v) => set('category', v)} options={CATEGORY_OPTS} />
            <Pick label="Project status" locked={lock('status')} mark={mark('status')} value={form.status} onChange={(v) => set('status', v)} options={STATUS_OPTS} />
            <Pick label="Priority" locked={lock('priority')} mark={mark('priority')} required missing={miss(form, 'priority')} value={form.priority} onChange={(v) => set('priority', v)} options={PRIORITY_OPTS} />
            <Pick label="Risk" locked={lock('risk')} mark={mark('risk')} value={form.risk} onChange={(v) => set('risk', v)} options={RISK_OPTS} />
            <Pick label="Project request" locked={lock('project_request')} mark={mark('project_request')} value={form.project_request} onChange={(v) => set('project_request', v)} options={['New', 'Enhancement', 'Support']} />
          </FrGrid>
        </FrSection>

        <FrSection label="Schedule">
          <FrGrid>
            <FrField label="Start date" required missing={miss(form, 'start_date')} locked={lock('start_date')} mark={mark('start_date')}>
              <WsDate value={form.start_date} disabled={lock('start_date')} onChange={(v) => set('start_date', v)} />
            </FrField>
            <FrField label="End date" required missing={miss(form, 'end_date')} locked={lock('end_date')} mark={mark('end_date')}>
              <WsDate value={form.end_date} disabled={lock('end_date')} min={form.start_date} onChange={(v) => set('end_date', v)} />
            </FrField>
            <Pick label="Governance frequency" locked={lock('governance_frequency')} mark={mark('governance_frequency')} required missing={miss(form, 'governance_frequency')} value={form.governance_frequency} onChange={(v) => set('governance_frequency', v)} options={GOVERNANCE_OPTS} />
            <FrField label="TCO / Efforts" locked={lock('tco_efforts')} mark={mark('tco_efforts')}>
              <input type="number" min="0" step="0.5" value={form.tco_efforts} disabled={lock('tco_efforts')} onChange={(e) => set('tco_efforts', e.target.value)} placeholder="Days or hours" />
            </FrField>
            <FrField label="Risk mitigation details" span={4}>
              <textarea rows={3} value={form.risk_mitigation_details} onChange={(e) => set('risk_mitigation_details', e.target.value)} placeholder="What could slip, and how we contain it" />
            </FrField>
          </FrGrid>
        </FrSection>

        <FrSection label="People">
          <FrGrid>
            <Person label="Business owner" locked={lock('business_owner_name')} mark={mark('business_owner_name')} required missing={miss(form, 'business_owner_name')} value={form.business_owner_name} onChange={(v) => set('business_owner_name', v)} />
            <Person label="Sponsor" locked={lock('sponsor_name')} mark={mark('sponsor_name')} value={form.sponsor_name} onChange={(v) => set('sponsor_name', v)} />
            <Person label="Project owner" locked={lock('project_owner_name')} mark={mark('project_owner_name')} value={form.project_owner_name} onChange={(v) => set('project_owner_name', v)} />
            <Person label="Project manager" locked={lock('project_manager_name')} mark={mark('project_manager_name')} value={form.project_manager_name} onChange={(v) => set('project_manager_name', v)} />
            <Person label="COS owner" locked={lock('cos_owner_name')} mark={mark('cos_owner_name')} value={form.cos_owner_name} onChange={(v) => set('cos_owner_name', v)} />
            <Person label="Developer" locked={lock('developer_name')} mark={mark('developer_name')} value={form.developer_name} onChange={(v) => set('developer_name', v)} />
            <Person label="Assignee" locked={lock('assignee_name')} mark={mark('assignee_name')} value={form.assignee_name} onChange={(v) => set('assignee_name', v)} placeholder="Unassigned" />
            <Person label="Requester" locked={lock('requester_name')} mark={mark('requester_name')} value={form.requester_name} onChange={(v) => set('requester_name', v)} />
          </FrGrid>
        </FrSection>

        <FrSection label="Delivery">
          <FrGrid>
            <FrField label="Vendor name" locked={lock('vendor_name')} mark={mark('vendor_name')}>
              <input value={form.vendor_name} disabled={lock('vendor_name')} onChange={(e) => set('vendor_name', e.target.value)} />
            </FrField>
            <FrField label="Tech stack" locked={lock('tech_stack')} mark={mark('tech_stack')} span={2}>
              <input list="pc-stack" value={form.tech_stack} disabled={lock('tech_stack')} onChange={(e) => set('tech_stack', e.target.value)} placeholder="React, SAP, Power BI..." />
              <datalist id="pc-stack">
                {['React', 'SAP', 'Power BI', 'Tally', 'Python', 'Node', 'Cursor'].map((s) => <option key={s} value={s} />)}
              </datalist>
            </FrField>
            <FrField label="Entity" locked={lock('entity')} mark={mark('entity')}>
              <input value={form.entity} disabled={lock('entity')} onChange={(e) => set('entity', e.target.value)} />
            </FrField>
            <FrField label="Business" locked={lock('business')} mark={mark('business')} span={2}>
              <input value={form.business} disabled={lock('business')} onChange={(e) => set('business', e.target.value)} />
            </FrField>
            <FrField label="Objectives" span={4}>
              <textarea rows={4} value={form.objectives} onChange={(e) => set('objectives', e.target.value)} placeholder="Outcome this project must produce" />
            </FrField>
          </FrGrid>
        </FrSection>

        <FrSection label="Documents & integrations">
          <div className="doc-list">
            {FLAGS.map((f) => {
              const yes = form[f.key] === '1'
              const lockedFlag = readOnly || Boolean(policy && policy.mode !== 'full')
              return (
                <div key={f.key} className="doc-item">
                  <div className="doc-q">
                    <b>{f.label}{yes ? ' *' : ''}</b>
                    <FrYesNo
                      value={yes}
                      disabled={lockedFlag}
                      onChange={(v) => {
                        set(f.key, v ? '1' : '0')
                        if (!v) {
                          setPending((p) => ({ ...p, [f.key]: null }))
                          if (f.key === 'ai_usage') set('ai_details', '')
                        }
                      }}
                    />
                  </div>
                  {yes ? (
                    <>
                      <FrUpload
                        file={pending[f.key]}
                        existingName={savedFiles[f.key]?.file_name}
                        missing={missing.includes(f.key)}
                        disabled={lockedFlag}
                        onPick={(file) => setPending((p) => ({ ...p, [f.key]: file }))}
                        onClear={() => {
                          const cur = savedFiles[f.key]
                          if (cur) {
                            void activityApi.removeFile(cur.id).then(() => {
                              setSavedFiles((s) => {
                                const next = { ...s }
                                delete next[f.key]
                                return next
                              })
                            })
                          }
                        }}
                      />
                      {f.key === 'ai_usage' ? (
                        <FrField label="AI details" required missing={missing.includes('ai_details')} span={4}>
                          <textarea rows={2} value={form.ai_details} onChange={(e) => set('ai_details', e.target.value)} placeholder="How AI is used on this project" />
                        </FrField>
                      ) : null}
                    </>
                  ) : null}
                </div>
              )
            })}
          </div>
        </FrSection>
      </FrAcc>
        </FrSheetMain>
        <aside className="tc-rail-wrap">
          <div className="tc-rail">
            <button
              type="button"
              className="tc-collapse"
              title={rail === 'min' ? 'Expand' : 'Minimize'}
              onClick={() => setRail((r) => (r === 'min' ? 'open' : 'min'))}
            >
              <i className={rail === 'min' ? 'ri-arrow-left-s-line' : 'ri-arrow-right-s-line'} />
            </button>
            {rail !== 'min' ? (
              <div className="tc-panel">
                <StatusTracker
                  status={form.status}
                  saved={Boolean(id)}
                  createdBy={form.requester_name || user?.name || ''}
                  createdAt={createdAt}
                  revisions={revisions}
                />
              </div>
            ) : (
              <div className="tc-tabs">
                <button type="button" className="is-on green" title="Status" onClick={() => setRail('open')}>
                  <i className="ri-apps-2-add-line" />
                </button>
              </div>
            )}
          </div>
        </aside>
      </FrSheetBody>
      <FrFoot>
        <button className="ws-btn ghost" type="button" disabled={busy || readOnly} onClick={() => void save('save')}>Save</button>
        <button className="ws-btn ghost" type="button" onClick={() => nav(back, { state: stateFor(back, loc) })}>Discard</button>
        <button className="ws-btn" type="button" disabled={busy || readOnly} onClick={() => void save('submit')}>{busy ? 'Saving...' : 'Submit'}</button>
      </FrFoot>
    </FrSheet>
  )
}

function miss(form: Record<string, string>, key: string) {
  return !String(form[key] || '').trim()
}

function Box({ label, required, missing, locked, mark, children }: {
  label: string; required?: boolean; missing?: boolean; locked?: boolean; mark?: ReactNode; children: ReactNode
}) {
  return (
    <FrField label={label} required={required} missing={missing} locked={locked} mark={mark}>
      {children}
    </FrField>
  )
}

function Pick({
  label, value, onChange, options, required, missing, locked, mark,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; required?: boolean; missing?: boolean; locked?: boolean; mark?: ReactNode
}) {
  return (
    <Box label={label} required={required} missing={missing} locked={locked} mark={mark}>
      <WsSelect value={value} disabled={locked} options={[{ value: '', label: 'Select...' }, ...options]} onChange={onChange} />
    </Box>
  )
}

function Person({
  label, value, onChange, required, missing, placeholder, locked, mark,
}: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; missing?: boolean; placeholder?: string; locked?: boolean; mark?: ReactNode
}) {
  return (
    <Box label={label} required={required} missing={missing} locked={locked} mark={mark}>
      <PersonPicker value={value} onChange={onChange} disabled={locked} placeholder={placeholder || 'Type a name...'} />
    </Box>
  )
}
