import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { projectsApi, subtasksApi, tasksApi } from '../api/client'
import ResourceTable from '../components/ResourceTable'
import { Field, PRIORITY_OPTS, STATUS_OPTS, Section, dateInput } from './RecordUi'
import { FormShell, Kv, MetaBlock, PersonChip, Rag, RecordHero, RevBadge, RevisionLog, StatusPill, Tabs, fmt } from './WorkspaceKit'
import KanbanBoard from './KanbanBoard'


export function ProjectsList() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  async function load() {
    const r = await projectsApi.list({ search: q, limit: 200 })
    setRows(r.rows); setTotal(r.total)
  }
  useEffect(() => { void load() }, [q])
  return (
    <ResourceTable
      title="Projects"
      subtitle={`${total} records`}
      createTo="/projects/new"
      createLabel="New project"
      extra={<Link className="ws-btn ghost" to="/board"><i className="ri-kanban-view" />Board</Link>}
      rows={rows}
      total={total}
      search={q}
      onSearch={setQ}
      onDeleteMany={async (ids) => {
        await Promise.all(ids.map((id) => projectsApi.remove(id)))
        await load()
      }}
      columns={[
        { key: 'kissflow_id', label: 'ID', href: (r) => `/projects/${r.id}` },
        { key: 'name', label: 'Name', href: (r) => `/projects/${r.id}` },
        { key: 'status', label: 'Status' },
        { key: 'rag', label: 'RAG' },
        { key: 'project_owner_name', label: 'Owner' },
        { key: 'end_date', label: 'End' },
        { key: 'revision_count', label: 'Revisions', kind: 'revisions' },
      ]}
    />
  )
}

export function ProjectDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [row, setRow] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('overview')
  async function load() {
    if (!id) return
    try { setRow(await projectsApi.get(id)) } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load') }
  }
  useEffect(() => { void load() }, [id])
  if (err) return <p className="muted">{err}</p>
  if (!row) return <p>Loading…</p>
  const recordId = String(row.id)
  const tasks = (row.tasks as Record<string, unknown>[] | undefined) || []
  const counts = (row.task_counts as { open_tasks?: number; done_tasks?: number } | undefined) || {}
  const done = Number(counts.done_tasks || 0)
  const open = Number(counts.open_tasks || 0)
  const total = done + open || tasks.length
  const pct = total ? Math.round((done / total) * 100) : 0

  return (
    <div className="ws">
      <RecordHero
        backTo="/projects"
        backLabel="All projects"
        kicker="Project"
        code={String(row.project_code || row.kissflow_id || '')}
        title={String(row.name)}
        subtitle={[row.company_name, row.category, row.project_type].filter(Boolean).map(String).join(' · ')}
        people={(
          <>
            <PersonChip label="Owner" name={row.project_owner_name} />
            <PersonChip label="PM" name={row.project_manager_name} />
            <PersonChip label="Sponsor" name={row.sponsor_name} />
            <PersonChip label="Requester" name={row.requester_name} />
          </>
        )}
        actions={(
          <>
            <Link className="ws-btn" to={`/tasks/new?project_id=${recordId}`}><i className="ri-add-line" />New task</Link>
            <Link className="ws-btn ghost" to={`/projects/${recordId}/edit`}><i className="ri-pencil-line" />Edit</Link>
            <button className="ws-btn danger" type="button" onClick={async () => {
              if (!confirm('Delete this project?')) return
              await projectsApi.remove(recordId)
              nav('/projects')
            }}><i className="ri-delete-bin-line" />Delete</button>
          </>
        )}
        metrics={[
          { label: 'Status', value: <StatusPill value={row.status} />, icon: 'ri-flag-line' },
          { label: 'RAG', value: <Rag value={row.rag} />, icon: 'ri-pulse-line' },
          { label: 'Owner', value: fmt(row.project_owner_name), icon: 'ri-user-star-line' },
          { label: 'End date', value: fmt(row.end_date), icon: 'ri-calendar-line' },
          { label: 'Revisions', value: <RevBadge count={row.revision_count} />, icon: 'ri-history-line' },
        ]}
        progress={{ label: `${done} of ${total || 0} tasks complete`, pct }}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'board', label: `Board (${tasks.length})` },
          { id: 'tasks', label: 'Task list' },
          { id: 'revisions', label: `Revisions (${Number(row.revision_count || (row.revisions as unknown[] | undefined)?.length || 0)})` },
        ]}
      />
      {tab === 'overview' ? (
        <div className="ws-panel">
          <MetaBlock title="Identity">
            <Kv label="Kissflow id">{fmt(row.kissflow_id)}</Kv>
            <Kv label="Project code">{fmt(row.project_code)}</Kv>
            <Kv label="Company">{fmt(row.company_name)}</Kv>
            <Kv label="Project type">{fmt(row.project_type)}</Kv>
            <Kv label="Functions">{fmt(row.function_type)}</Kv>
            <Kv label="Category">{fmt(row.category)}</Kv>
            <Kv label="Request">{fmt(row.project_request)}</Kv>
            <Kv label="Priority">{fmt(row.priority)}</Kv>
          </MetaBlock>
          <MetaBlock title="Schedule">
            <Kv label="Start">{fmt(row.start_date)}</Kv>
            <Kv label="End / due">{fmt(row.end_date)}</Kv>
            <Kv label="Governance">{fmt(row.governance_frequency)}</Kv>
            <Kv label="Risk">{fmt(row.risk)}</Kv>
            <Kv label="Risk mitigation">{fmt(row.risk_mitigation_details)}</Kv>
            <Kv label="TCO / Efforts">{fmt(row.tco_efforts)}</Kv>
          </MetaBlock>
          <MetaBlock title="Organization">
            <Kv label="Entity">{fmt(row.entity)}</Kv>
            <Kv label="Business">{fmt(row.business)}</Kv>
            <Kv label="Vendor">{fmt(row.vendor_name)}</Kv>
            <Kv label="Tech stack">{fmt(row.tech_stack)}</Kv>
          </MetaBlock>
          <MetaBlock title="Documents & integrations">
            <Kv label="CB analysis">{fmt(row.cb_analysis_available)}</Kv>
            <Kv label="AI usage">{fmt(row.ai_usage)}</Kv>
            <Kv label="AI details">{fmt(row.ai_details)}</Kv>
            <Kv label="BRD">{fmt(row.brd_available)}</Kv>
            <Kv label="Process document">{fmt(row.process_document)}</Kv>
            <Kv label="Support document">{fmt(row.support_available)}</Kv>
            <Kv label="Reports">{fmt(row.reports_available)}</Kv>
            <Kv label="Tally">{fmt(row.integrated_with_tally)}</Kv>
            <Kv label="SAP">{fmt(row.integrated_with_sap)}</Kv>
            <Kv label="Power BI">{fmt(row.integrated_with_power_bi)}</Kv>
          </MetaBlock>
          <MetaBlock title="People">
            <Kv label="Assignee">{fmt(row.assignee_name)}</Kv>
            <Kv label="Requester">{fmt(row.requester_name)}</Kv>
            <Kv label="Business owner">{fmt(row.business_owner_name)}</Kv>
            <Kv label="Sponsor">{fmt(row.sponsor_name)}</Kv>
            <Kv label="Project owner">{fmt(row.project_owner_name)}</Kv>
            <Kv label="Project manager">{fmt(row.project_manager_name)}</Kv>
            <Kv label="COS owner">{fmt(row.cos_owner_name)}</Kv>
            <Kv label="Developer">{fmt(row.developer_name)}</Kv>
          </MetaBlock>
          {row.objectives ? (
            <div className="ws-block">
              <h3>Objectives</h3>
              <p className="ws-sub">{String(row.objectives)}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {tab === 'board' ? (
        <div className="ws-panel" style={{ padding: 14 }}>
          <KanbanBoard items={tasks} onChanged={() => void load()} />
        </div>
      ) : null}
      {tab === 'tasks' ? (
        <div className="ws-panel" style={{ padding: 14 }}>
          {tasks.length === 0 ? <div className="ws-empty">No tasks yet. Create one to start the board.</div> : tasks.map((t) => (
            <Link key={String(t.id)} className="ws-item" to={`/tasks/${t.id}`}>
              <div>
                <b>{String(t.name)}</b>
                <p className="ws-sub">{String(t.task_code || '')} · {fmt(t.assigned_to_name)}</p>
              </div>
              <StatusPill value={t.status} />
            </Link>
          ))}
        </div>
      ) : null}
      {tab === 'revisions' ? (
        <div className="ws-panel" style={{ padding: 18 }}>
          <RevisionLog rows={(row.revisions as Record<string, unknown>[]) || []} />
        </div>
      ) : null}
    </div>
  )
}

export { default as ProjectForm } from './ProjectComposer'

export function TasksList() {
  const [params] = useSearchParams()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  async function load() {
    const r = await tasksApi.list({ search: q, limit: 200, project_id: params.get('project_id') || undefined })
    setRows(r.rows); setTotal(r.total)
  }
  useEffect(() => { void load() }, [q, params])
  return (
    <ResourceTable
      title="Tasks"
      subtitle={`${total} records`}
      createTo="/tasks/new"
      createLabel="New task"
      extra={<Link className="ws-btn ghost" to="/board"><i className="ri-kanban-view" />Board</Link>}
      rows={rows}
      total={total}
      search={q}
      onSearch={setQ}
      onDeleteMany={async (ids) => {
        await Promise.all(ids.map((id) => tasksApi.remove(id)))
        await load()
      }}
      columns={[
        { key: 'task_code', label: 'Code', href: (r) => `/tasks/${r.id}` },
        { key: 'name', label: 'Name', href: (r) => `/tasks/${r.id}` },
        { key: 'project_name', label: 'Project', href: (r) => r.project_id ? `/projects/${r.project_id}` : '/projects' },
        { key: 'status', label: 'Status' },
        { key: 'assigned_to_name', label: 'Assignee' },
        { key: 'end_date', label: 'End' },
        { key: 'revision_count', label: 'Revisions', kind: 'revisions' },
      ]}
    />
  )
}

export function TaskDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [row, setRow] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('overview')
  useEffect(() => {
    if (!id) return
    tasksApi.get(id).then(setRow).catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
  }, [id])
  if (err) return <p className="muted">{err}</p>
  if (!row) return <p>Loading…</p>
  const recordId = String(row.id)
  const subs = (row.subtasks as Record<string, unknown>[] | undefined) || []
  return (
    <div className="ws">
      <RecordHero
        backTo={row.project_id ? `/projects/${row.project_id}` : '/tasks'}
        backLabel={row.project_name ? String(row.project_name) : 'All tasks'}
        kicker="Task"
        code={String(row.task_code || '')}
        title={String(row.name)}
        subtitle={row.detail ? String(row.detail) : undefined}
        people={<PersonChip label="Assignee" name={row.assigned_to_name} />}
        actions={(
          <>
            <Link className="ws-btn" to={`/subtasks/new?task_id=${recordId}`}><i className="ri-add-line" />New subtask</Link>
            <Link className="ws-btn ghost" to={`/tasks/${recordId}/edit`}><i className="ri-pencil-line" />Edit</Link>
            <button className="ws-btn danger" type="button" onClick={async () => {
              if (!confirm('Delete this task?')) return
              await tasksApi.remove(recordId)
              nav('/tasks')
            }}><i className="ri-delete-bin-line" />Delete</button>
          </>
        )}
        metrics={[
          { label: 'Status', value: <StatusPill value={row.status} />, icon: 'ri-checkbox-circle-line' },
          { label: 'Priority', value: <StatusPill value={row.priority} />, icon: 'ri-flashlight-line' },
          { label: 'Assignee', value: fmt(row.assigned_to_name), icon: 'ri-user-line' },
          { label: 'End date', value: fmt(row.end_date), icon: 'ri-calendar-check-line' },
          { label: 'Revisions', value: <RevBadge count={row.revision_count} />, icon: 'ri-history-line' },
        ]}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'subtasks', label: `Subtasks (${subs.length})` },
          { id: 'revisions', label: `Revisions (${Number(row.revision_count || (row.revisions as unknown[] | undefined)?.length || 0)})` },
        ]}
      />
      {tab === 'overview' ? (
        <div className="ws-panel">
          <MetaBlock title="Work">
            <Kv label="Task code">{fmt(row.task_code)}</Kv>
            <Kv label="Project">{row.project_id ? <Link to={`/projects/${row.project_id}`}>{fmt(row.project_name)}</Link> : fmt(row.project_name)}</Kv>
            <Kv label="Type">{fmt(row.task_type)}</Kv>
            <Kv label="Entity">{fmt(row.entity)}</Kv>
          </MetaBlock>
          <MetaBlock title="Schedule">
            <Kv label="Start">{fmt(row.start_date)}</Kv>
            <Kv label="End">{fmt(row.end_date)}</Kv>
            <Kv label="Status">{fmt(row.status)}</Kv>
            <Kv label="Priority">{fmt(row.priority)}</Kv>
          </MetaBlock>
        </div>
      ) : null}
      {tab === 'subtasks' ? (
        <div className="ws-panel" style={{ padding: 14 }}>
          {subs.length === 0 ? <div className="ws-empty">No subtasks yet.</div> : subs.map((s) => (
            <Link key={String(s.id)} className="ws-item" to={`/subtasks/${s.id}`}>
              <div>
                <b>{String(s.name)}</b>
                <p className="ws-sub">{fmt(s.assigned_to_name)}</p>
              </div>
              <StatusPill value={s.status} />
            </Link>
          ))}
        </div>
      ) : null}
      {tab === 'revisions' ? (
        <div className="ws-panel" style={{ padding: 18 }}>
          <RevisionLog rows={(row.revisions as Record<string, unknown>[]) || []} />
        </div>
      ) : null}
    </div>
  )
}

export { default as TaskForm } from './TaskComposer'

export function SubtasksList() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  async function load() {
    const r = await subtasksApi.list({ search: q, limit: 200 })
    setRows(r.rows); setTotal(r.total)
  }
  useEffect(() => { void load() }, [q])
  return (
    <ResourceTable
      title="Subtasks"
      subtitle={`${total} records`}
      createTo="/subtasks/new"
      createLabel="New subtask"
      rows={rows}
      total={total}
      search={q}
      onSearch={setQ}
      onDeleteMany={async (ids) => {
        await Promise.all(ids.map((id) => subtasksApi.remove(id)))
        await load()
      }}
      columns={[
        { key: 'name', label: 'Name', href: (r) => `/subtasks/${r.id}` },
        { key: 'task_name', label: 'Task' },
        { key: 'project_name', label: 'Project' },
        { key: 'status', label: 'Status' },
        { key: 'assigned_to_name', label: 'Assignee' },
        { key: 'revision_count', label: 'Revisions', kind: 'revisions' },
      ]}
    />
  )
}

export function SubtaskDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [row, setRow] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('overview')
  useEffect(() => {
    if (!id) return
    subtasksApi.get(id).then(setRow).catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
  }, [id])
  if (err) return <p className="muted">{err}</p>
  if (!row) return <p>Loading…</p>
  const recordId = String(row.id)
  return (
    <div className="ws">
      <RecordHero
        backTo={row.task_id ? `/tasks/${row.task_id}` : '/subtasks'}
        backLabel={row.task_name ? String(row.task_name) : 'All subtasks'}
        kicker="Subtask"
        title={String(row.name)}
        subtitle={[row.project_name, row.summary].filter(Boolean).map(String).join(' · ')}
        people={<PersonChip label="Assignee" name={row.assigned_to_name} />}
        actions={(
          <>
            <Link className="ws-btn ghost" to={`/subtasks/${recordId}/edit`}><i className="ri-pencil-line" />Edit</Link>
            <button className="ws-btn danger" type="button" onClick={async () => {
              if (!confirm('Delete this subtask?')) return
              await subtasksApi.remove(recordId)
              nav('/subtasks')
            }}><i className="ri-delete-bin-line" />Delete</button>
          </>
        )}
        metrics={[
          { label: 'Status', value: <StatusPill value={row.status} />, icon: 'ri-node-tree' },
          { label: 'Priority', value: <StatusPill value={row.priority} />, icon: 'ri-flashlight-line' },
          { label: 'Assignee', value: fmt(row.assigned_to_name), icon: 'ri-user-line' },
          { label: 'End date', value: fmt(row.end_date), icon: 'ri-calendar-line' },
          { label: 'Revisions', value: <RevBadge count={row.revision_count} />, icon: 'ri-history-line' },
        ]}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'revisions', label: `Revisions (${Number(row.revision_count || (row.revisions as unknown[] | undefined)?.length || 0)})` },
        ]}
      />
      {tab === 'overview' ? (
        <div className="ws-panel">
          <MetaBlock title="Context">
            <Kv label="Parent task">{row.task_id ? <Link to={`/tasks/${row.task_id}`}>{fmt(row.task_name)}</Link> : fmt(row.task_name)}</Kv>
            <Kv label="Project">{row.project_id ? <Link to={`/projects/${row.project_id}`}>{fmt(row.project_name)}</Link> : fmt(row.project_name)}</Kv>
            <Kv label="Start">{fmt(row.start_date)}</Kv>
            <Kv label="End">{fmt(row.end_date)}</Kv>
          </MetaBlock>
        </div>
      ) : (
        <div className="ws-panel" style={{ padding: 18 }}>
          <RevisionLog rows={(row.revisions as Record<string, unknown>[]) || []} />
        </div>
      )}
    </div>
  )
}

export function SubtaskForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [tasks, setTasks] = useState<{ value: string; label: string }[]>([])
  const [form, setForm] = useState<Record<string, string>>({
    name: '', summary: '', status: 'Open', priority: 'High', task_id: params.get('task_id') || '',
    assigned_to_name: '', start_date: '', end_date: '',
  })
  useEffect(() => {
    tasksApi.selectlist().then((r) => setTasks((r.results || []).map((o) => ({ value: String(o.id), label: o.text }))))
  }, [])
  useEffect(() => {
    if (!id) return
    subtasksApi.get(id).then((r) => setForm({
      name: String(r.name || ''),
      summary: String(r.summary || ''),
      status: String(r.status || 'Open'),
      priority: String(r.priority || ''),
      task_id: r.task_id != null ? String(r.task_id) : '',
      assigned_to_name: String(r.assigned_to_name || ''),
      start_date: dateInput(r.start_date),
      end_date: dateInput(r.end_date),
    }))
  }, [id])
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }
  async function save() {
    setBusy(true)
    try {
      const body = { ...form, task_id: form.task_id ? Number(form.task_id) : null }
      if (id) {
        await subtasksApi.update(id, body)
        nav(`/subtasks/${id}`)
        return
      }
      const created = await subtasksApi.create(body)
      nav(`/subtasks/${created.payload?.id || ''}`)
    } finally { setBusy(false) }
  }
  const backTo = id ? `/subtasks/${id}` : (form.task_id ? `/tasks/${form.task_id}` : '/subtasks')
  return (
    <FormShell
      backTo={backTo}
      backLabel={id ? 'Back to subtask' : form.task_id ? 'Back to task' : 'All subtasks'}
      title={id ? 'Edit subtask' : 'New subtask'}
      subtitle="Keep work small enough to finish in one cycle."
    >
        <Section title="Overview">
          <Field label="Name" value={form.name} onChange={(v) => set('name', v)} />
          <Field label="Status" value={form.status} onChange={(v) => set('status', v)} options={STATUS_OPTS} />
          <Field label="Priority" value={form.priority} onChange={(v) => set('priority', v)} options={PRIORITY_OPTS} />
          <Field label="Parent task" value={form.task_id} onChange={(v) => set('task_id', v)} choices={tasks} />
        </Section>
        <Section title="Assignment">
          <Field label="Assignee" value={form.assigned_to_name} onChange={(v) => set('assigned_to_name', v)} />
          <Field label="Start date" type="date" value={form.start_date} onChange={(v) => set('start_date', v)} />
          <Field label="End date" type="date" value={form.end_date} onChange={(v) => set('end_date', v)} />
        </Section>
        <Section title="Summary">
          <Field label="Summary" type="textarea" full value={form.summary} onChange={(v) => set('summary', v)} />
        </Section>
        <div className="pm-form-actions">
          <button className="ws-btn" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save subtask'}</button>
          <button className="ws-btn ghost" type="button" onClick={() => nav(backTo)}>Cancel</button>
        </div>
    </FormShell>
  )
}

export { EmployeesList as EmployeesPage } from './Employees'
export { UsersList } from './Users'
export { CompaniesPage, DepartmentsPage } from './Masters'
