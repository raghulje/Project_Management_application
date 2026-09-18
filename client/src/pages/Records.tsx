import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { projectsApi, subtasksApi, tasksApi } from '../api/client'
import ResourceTable from '../components/ResourceTable'
import { isClosedStatus, ReopenBadge, ReopenDialog, RevisionLog, StatusPill, fmt } from './WorkspaceKit'
import { RecordActivity } from './RecordActivity'
import KanbanBoard from './KanbanBoard'
import { useAuth } from '../api/AuthContext'
import { crumbState, navState, pageCrumbs, smartBack } from '../lib/recordNav'
import { FrAcc, FrGrid, FrHeader, FrPage, FrSection, FrValue } from './FormReference'

function RelatedTable({
  rows,
  columns,
  empty,
}: {
  rows: Record<string, unknown>[]
  columns: { key: string; label: string; href?: (r: Record<string, unknown>) => string }[]
  empty: string
}) {
  const loc = useLocation()
  const from = navState(loc)
  const wrapKeys = new Set(['name', 'project_name', 'task_name', 'title', 'detail', 'notes'])
  return (
    <div className="fr-table-wrap is-cards">
      <table className="fr-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="fr-empty">{empty}</td></tr>
          ) : rows.map((r) => (
            <tr key={String(r.id)}>
              {columns.map((c) => {
                const href = c.href?.(r)
                const val = c.key === 'status'
                  ? <StatusPill value={r[c.key]} />
                  : wrapKeys.has(c.key)
                    ? <span className="fr-name-cell"><span className="fr-name">{fmt(r[c.key])}</span></span>
                    : fmt(r[c.key])
                return <td key={c.key} data-label={c.label}>{href ? <Link to={href} state={from}>{val}</Link> : val}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RecordReopen({
  noun, row, onDone, reopen,
}: {
  noun: string
  row: Record<string, unknown>
  onDone: () => void
  reopen: (id: string, reason: string) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!isClosedStatus(row.status)) return null
  return (
    <>
      <button className="ws-btn" type="button" onClick={() => { setErr(''); setOpen(true) }}>
        <i className="ri-restart-line" />Re-open
      </button>
      <ReopenDialog
        open={open}
        noun={noun}
        busy={busy}
        error={err}
        onClose={() => setOpen(false)}
        onSubmit={async (reason) => {
          setBusy(true)
          setErr('')
          try {
            await reopen(String(row.id), reason)
            setOpen(false)
            onDone()
          } catch (e) {
            setErr(e instanceof Error ? e.message : 'Could not re-open')
          } finally {
            setBusy(false)
          }
        }}
      />
    </>
  )
}

export function ProjectsList() {
  const loc = useLocation()
  const [params] = useSearchParams()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const view = params.get('view') === 'board' ? 'board' : 'list'
  const hereState = navState(loc)
  async function load() {
    const r = await projectsApi.list({ search: q, limit: 200 })
    setRows(r.rows); setTotal(r.total)
  }
  useEffect(() => { void load() }, [q])
  const extra = view === 'board'
    ? <Link className="ws-btn ghost" to="/projects"><i className="ri-list-check-2" />List</Link>
    : <Link className="ws-btn ghost" to="/projects?view=board"><i className="ri-kanban-view" />Board</Link>
  if (view === 'board') {
    return (
      <FrPage fill>
        <FrHeader
          crumbs={[{ to: '/projects', label: 'Projects' }, { label: 'Board' }]}
          title="Projects"
          count={`${total} total records`}
        >
          <input className="fr-search" placeholder="Search records..." value={q} onChange={(e) => setQ(e.target.value)} />
          {extra}
          <Link className="ws-btn ghost" to="/projects/import"><i className="ri-file-excel-2-line" />Import</Link>
          <Link className="ws-btn" to="/projects/new" state={hereState}><i className="ri-add-line" />Create</Link>
        </FrHeader>
        <KanbanBoard
          items={rows}
          filterKey={q}
          noun="project"
          hrefFor={(r) => `/projects/${r.id}`}
          onMove={(row, status) => projectsApi.update(String(row.id), { status })}
          onReopen={(row, reason, status) => projectsApi.reopen(String(row.id), reason, status)}
          onChanged={() => void load()}
        />
      </FrPage>
    )
  }
  return (
    <ResourceTable
      title="Projects"
      subtitle={`${total} total records`}
      createTo="/projects/new"
      createLabel="Create"
      extra={<>{extra}<Link className="ws-btn ghost" to="/projects/import"><i className="ri-file-excel-2-line" />Import</Link></>}
      rows={rows}
      total={total}
      search={q}
      onSearch={setQ}
      noun="project"
      defaultSort={{ key: 'project_code', order: 'asc' }}
      onExport={(ids) => projectsApi.exportFile(ids)}
      onBulkUpdate={async (ids, patch) => {
        const r = await projectsApi.bulkUpdate(ids, patch)
        await load()
        return r
      }}
      onDeleteMany={async (ids) => {
        await Promise.all(ids.map((id) => projectsApi.remove(id)))
        await load()
      }}
      columns={[
        { key: 'name', label: 'Project Name', kind: 'name', subKey: 'project_code', href: (r) => `/projects/${r.id}` },
        { key: 'project_owner_name', label: 'Owner', kind: 'person' },
        { key: 'start_date', label: 'Start Date', kind: 'date' },
        { key: 'end_date', label: 'End Date', kind: 'date' },
        { key: 'revision_count', label: 'Revised', kind: 'revisions' },
        { key: 'reopen_count', label: 'Re-opened', kind: 'reopen' },
        { key: 'completion', label: 'Progress', kind: 'progress' },
        { key: 'rag', label: 'RAG Status', kind: 'rag' },
        { key: 'status', label: 'Status' },
      ]}
    />
  )
}

export function ProjectDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const { isEmployee } = useAuth()
  const [row, setRow] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState('')
  async function load() {
    if (!id) return
    try { setRow(await projectsApi.get(id)) } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load') }
  }
  useEffect(() => { void load() }, [id])
  if (err) return <p className="muted">{err}</p>
  if (!row) return <p>Loading…</p>
  const recordId = String(row.id)
  const tasks = (row.tasks as Record<string, unknown>[] | undefined) || []
  const trail = smartBack({ loc, kind: 'project', isEmployee })
  const hereState = navState(loc)
  const revs = (row.revisions as Record<string, unknown>[]) || []
  const crumbs = pageCrumbs({ loc, kind: 'project', isEmployee, current: String(row.name) })

  return (
    <FrPage>
      <FrHeader
        crumbs={crumbs}
        backTo={trail.backTo}
        backLabel={trail.backLabel}
        backState={trail.backState}
        title={String(row.name)}
        badge={<>
          <StatusPill value={row.status} />
          {Number(row.reopen_count) > 0 ? <ReopenBadge count={row.reopen_count} /> : null}
        </>}
      >
        <RecordReopen noun="project" row={row} reopen={projectsApi.reopen} onDone={() => void load()} />
        <Link className="ws-btn" to={`/tasks/new?project_id=${recordId}`} state={hereState}><i className="ri-add-line" />New task</Link>
        <Link className="ws-btn ghost" to={`/projects/${recordId}/edit`} state={hereState}><i className="ri-pencil-line" />Edit</Link>
        <button className="ws-btn danger" type="button" onClick={async () => {
          if (!confirm('Delete this project?')) return
          await projectsApi.remove(recordId)
          nav(trail.backTo, { state: trail.backState })
        }}><i className="ri-delete-bin-line" />Delete</button>
      </FrHeader>
      <FrAcc>
        <FrSection label="Overview">
          <FrGrid>
            <FrValue label="Project code">{fmt(row.project_code)}</FrValue>
            {row.kissflow_id ? <FrValue label="Legacy id">{fmt(row.kissflow_id)}</FrValue> : null}
            <FrValue label="Company">{fmt(row.company_name)}</FrValue>
            <FrValue label="Project type">{fmt(row.project_type)}</FrValue>
            <FrValue label="Functions">{fmt(row.function_type)}</FrValue>
            <FrValue label="Category">{fmt(row.category)}</FrValue>
            <FrValue label="Request">{fmt(row.project_request)}</FrValue>
            <FrValue label="Priority">{fmt(row.priority)}</FrValue>
            <FrValue label="Start">{fmt(row.start_date)}</FrValue>
            <FrValue label="End / due">{fmt(row.end_date)}</FrValue>
            <FrValue label="Governance">{fmt(row.governance_frequency)}</FrValue>
            <FrValue label="RAG">{fmt(row.rag)}</FrValue>
            <FrValue label="Risk">{fmt(row.risk)}</FrValue>
            <FrValue label="TCO / Efforts">{fmt(row.tco_efforts)}</FrValue>
            <FrValue label="Risk mitigation" span={4}>{fmt(row.risk_mitigation_details)}</FrValue>
            <FrValue label="Objectives" span={4}>{fmt(row.objectives)}</FrValue>
          </FrGrid>
        </FrSection>
        <FrSection label="People">
          <FrGrid>
            <FrValue label="Assignee">{fmt(row.assignee_name)}</FrValue>
            <FrValue label="Requester">{fmt(row.requester_name)}</FrValue>
            <FrValue label="Business owner">{fmt(row.business_owner_name)}</FrValue>
            <FrValue label="Sponsor">{fmt(row.sponsor_name)}</FrValue>
            <FrValue label="Project owner">{fmt(row.project_owner_name)}</FrValue>
            <FrValue label="Project manager">{fmt(row.project_manager_name)}</FrValue>
            <FrValue label="COS owner">{fmt(row.cos_owner_name)}</FrValue>
            <FrValue label="Developer">{fmt(row.developer_name)}</FrValue>
          </FrGrid>
        </FrSection>
        <FrSection label="Organization">
          <FrGrid>
            <FrValue label="Entity">{fmt(row.entity)}</FrValue>
            <FrValue label="Business">{fmt(row.business)}</FrValue>
            <FrValue label="Vendor">{fmt(row.vendor_name)}</FrValue>
            <FrValue label="Tech stack">{fmt(row.tech_stack)}</FrValue>
          </FrGrid>
        </FrSection>
        <FrSection label="Documents & integrations">
          <FrGrid>
            <FrValue label="CB analysis">{fmt(row.cb_analysis_available)}</FrValue>
            <FrValue label="AI usage">{fmt(row.ai_usage)}</FrValue>
            <FrValue label="BRD">{fmt(row.brd_available)}</FrValue>
            <FrValue label="Process document">{fmt(row.process_document)}</FrValue>
            <FrValue label="Support document">{fmt(row.support_available)}</FrValue>
            <FrValue label="Reports">{fmt(row.reports_available)}</FrValue>
            <FrValue label="Tally">{fmt(row.integrated_with_tally)}</FrValue>
            <FrValue label="SAP">{fmt(row.integrated_with_sap)}</FrValue>
            <FrValue label="Power BI">{fmt(row.integrated_with_power_bi)}</FrValue>
            <FrValue label="AI details" span={4}>{fmt(row.ai_details)}</FrValue>
          </FrGrid>
        </FrSection>
        <FrSection label="Tasks" count={tasks.length}>
          <div className="fr-sec-tools">
            <Link className="ws-btn ghost" to={`/tasks/new?project_id=${recordId}`} state={hereState}><i className="ri-add-line" />Create</Link>
          </div>
          <RelatedTable
            rows={tasks}
            empty="No tasks yet. Create one to start the board."
            columns={[
              { key: 'name', label: 'Name', href: (t) => `/tasks/${t.id}` },
              { key: 'task_code', label: 'Code' },
              { key: 'assigned_to_name', label: 'Assignee' },
              { key: 'status', label: 'Status' },
              { key: 'end_date', label: 'End' },
            ]}
          />
        </FrSection>
        <FrSection label="Board" count={tasks.length}>
          <KanbanBoard
            items={tasks}
            noun="task"
            onMove={(row, status) => tasksApi.update(String(row.id), { status })}
            onReopen={(row, reason, status) => tasksApi.reopen(String(row.id), reason, status)}
            onChanged={() => void load()}
          />
        </FrSection>
        <FrSection label="Audit log" count={Number(row.revision_count || revs.length || 0)}>
          <RevisionLog rows={revs} />
        </FrSection>
        <RecordActivity itemType="project" itemId={recordId} />
      </FrAcc>
    </FrPage>
  )
}

export { default as ProjectForm } from './ProjectComposer'

export function TasksList() {
  const loc = useLocation()
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
      subtitle={`${total} total records`}
      createTo="/tasks/new"
      createLabel="Create"
      extra={
        <>
          <Link className="ws-btn ghost" to="/board" state={navState(loc)}><i className="ri-kanban-view" />Board</Link>
          <Link className="ws-btn ghost" to="/tasks/import"><i className="ri-file-excel-2-line" />Import</Link>
        </>
      }
      rows={rows}
      total={total}
      search={q}
      onSearch={setQ}
      noun="task"
      onExport={(ids) => tasksApi.exportFile(ids)}
      onBulkUpdate={async (ids, patch) => {
        const r = await tasksApi.bulkUpdate(ids, patch)
        await load()
        return r
      }}
      onDeleteMany={async (ids) => {
        await Promise.all(ids.map((id) => tasksApi.remove(id)))
        await load()
      }}
      columns={[
        { key: 'name', label: 'Task Name', kind: 'name', subKey: 'task_code', href: (r) => `/tasks/${r.id}` },
        { key: 'project_name', label: 'Project', kind: 'text', href: (r) => r.project_id ? `/projects/${r.project_id}` : '/projects' },
        { key: 'assigned_to_name', label: 'Assigned To', kind: 'person' },
        { key: 'start_date', label: 'Start Date', kind: 'date' },
        { key: 'end_date', label: 'End Date', kind: 'date' },
        { key: 'revision_count', label: 'Revised', kind: 'revisions' },
        { key: 'reopen_count', label: 'Re-opened', kind: 'reopen' },
        { key: 'status', label: 'Status' },
      ]}
    />
  )
}

export function TaskDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const { isEmployee } = useAuth()
  const [row, setRow] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState('')
  function load() {
    if (!id) return
    tasksApi.get(id).then(setRow).catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
  }
  useEffect(() => { load() }, [id])
  if (err) return <p className="muted">{err}</p>
  if (!row) return <p>Loading…</p>
  const recordId = String(row.id)
  const subs = (row.subtasks as Record<string, unknown>[] | undefined) || []
  const parent = row.project_id
    ? { to: `/projects/${row.project_id}?tab=tasks`, label: String(row.project_name || 'Project') }
    : null
  const trail = smartBack({ loc, kind: 'task', isEmployee, parent })
  const hereState = navState(loc)
  const revs = (row.revisions as Record<string, unknown>[]) || []
  const crumbs = pageCrumbs({
    loc,
    kind: 'task',
    isEmployee,
    current: String(row.name),
    parents: [parent],
  })

  return (
    <FrPage>
      <FrHeader
        crumbs={crumbs}
        backTo={trail.backTo}
        backLabel={trail.backLabel}
        backState={trail.backState}
        title={String(row.name)}
        badge={<>
          <StatusPill value={row.status} />
          {Number(row.reopen_count) > 0 ? <ReopenBadge count={row.reopen_count} /> : null}
        </>}
      >
        <RecordReopen noun="task" row={row} reopen={tasksApi.reopen} onDone={load} />
        <Link className="ws-btn" to={`/subtasks/new?task_id=${recordId}`} state={hereState}><i className="ri-add-line" />New subtask</Link>
        <Link className="ws-btn ghost" to={`/tasks/${recordId}/edit`} state={hereState}><i className="ri-pencil-line" />Edit</Link>
        <button className="ws-btn danger" type="button" onClick={async () => {
          if (!confirm('Delete this task?')) return
          await tasksApi.remove(recordId)
          nav(trail.backTo, { state: trail.backState })
        }}><i className="ri-delete-bin-line" />Delete</button>
      </FrHeader>
      <FrAcc>
        <FrSection label="Overview">
          <FrGrid>
            <FrValue label="Task code">{fmt(row.task_code)}</FrValue>
            <FrValue label="Project">
              {row.project_id
                ? <Link to={`/projects/${row.project_id}?tab=tasks`} state={crumbState(loc, `/projects/${row.project_id}?tab=tasks`)}>{fmt(row.project_name)}</Link>
                : fmt(row.project_name)}
            </FrValue>
            <FrValue label="Type">{fmt(row.task_type)}</FrValue>
            <FrValue label="Entity">{fmt(row.entity)}</FrValue>
            <FrValue label="Start">{fmt(row.start_date)}</FrValue>
            <FrValue label="End">{fmt(row.end_date)}</FrValue>
            <FrValue label="Status">{fmt(row.status)}</FrValue>
            <FrValue label="Priority">{fmt(row.priority)}</FrValue>
            <FrValue label="Assignee">{fmt(row.assigned_to_name)}</FrValue>
            <FrValue label="Detail" span={4}>{fmt(row.detail)}</FrValue>
          </FrGrid>
        </FrSection>
        <FrSection label="Subtasks" count={subs.length}>
          <div className="fr-sec-tools">
            <Link className="ws-btn ghost" to={`/subtasks/new?task_id=${recordId}`} state={hereState}><i className="ri-add-line" />Create</Link>
          </div>
          <RelatedTable
            rows={subs}
            empty="No subtasks yet."
            columns={[
              { key: 'name', label: 'Name', href: (s) => `/subtasks/${s.id}` },
              { key: 'assigned_to_name', label: 'Assignee' },
              { key: 'status', label: 'Status' },
              { key: 'end_date', label: 'End' },
            ]}
          />
        </FrSection>
        <FrSection label="Audit log" count={Number(row.revision_count || revs.length || 0)}>
          <RevisionLog rows={revs} />
        </FrSection>
        <RecordActivity itemType="task" itemId={recordId} />
      </FrAcc>
    </FrPage>
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
      subtitle={`${total} total records`}
      createTo="/subtasks/new"
      createLabel="Create"
      extra={<Link className="ws-btn ghost" to="/subtasks/import"><i className="ri-file-excel-2-line" />Import</Link>}
      rows={rows}
      total={total}
      search={q}
      onSearch={setQ}
      noun="subtask"
      onExport={(ids) => subtasksApi.exportFile(ids)}
      onBulkUpdate={async (ids, patch) => {
        const r = await subtasksApi.bulkUpdate(ids, patch)
        await load()
        return r
      }}
      onDeleteMany={async (ids) => {
        await Promise.all(ids.map((id) => subtasksApi.remove(id)))
        await load()
      }}
      columns={[
        { key: 'name', label: 'Subtask Name', kind: 'name', subKey: 'subtask_code', href: (r) => `/subtasks/${r.id}` },
        { key: 'task_name', label: 'Task', kind: 'text', href: (r) => r.task_id ? `/tasks/${r.task_id}` : '/tasks' },
        { key: 'project_name', label: 'Project', kind: 'text', href: (r) => r.project_id ? `/projects/${r.project_id}` : '/projects' },
        { key: 'assigned_to_name', label: 'Assigned To', kind: 'person' },
        { key: 'start_date', label: 'Start Date', kind: 'date' },
        { key: 'end_date', label: 'End Date', kind: 'date' },
        { key: 'revision_count', label: 'Revised', kind: 'revisions' },
        { key: 'reopen_count', label: 'Re-opened', kind: 'reopen' },
        { key: 'status', label: 'Status' },
      ]}
    />
  )
}

export function SubtaskDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const { isEmployee } = useAuth()
  const [row, setRow] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState('')
  function load() {
    if (!id) return
    subtasksApi.get(id).then(setRow).catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
  }
  useEffect(() => { load() }, [id])
  if (err) return <p className="muted">{err}</p>
  if (!row) return <p>Loading…</p>
  const recordId = String(row.id)
  const parent = row.task_id
    ? { to: `/tasks/${row.task_id}?tab=subtasks`, label: String(row.task_name || 'Task') }
    : null
  const trail = smartBack({ loc, kind: 'subtask', isEmployee, parent })
  const hereState = navState(loc)
  const revs = (row.revisions as Record<string, unknown>[]) || []
  const crumbs = pageCrumbs({
    loc,
    kind: 'subtask',
    isEmployee,
    current: String(row.name),
    parents: [
      row.project_id
        ? { to: `/projects/${row.project_id}?tab=tasks`, label: String(row.project_name || 'Project') }
        : null,
      parent,
    ],
  })

  return (
    <FrPage>
      <FrHeader
        crumbs={crumbs}
        backTo={trail.backTo}
        backLabel={trail.backLabel}
        backState={trail.backState}
        title={String(row.name)}
        badge={<>
          <StatusPill value={row.status} />
          {Number(row.reopen_count) > 0 ? <ReopenBadge count={row.reopen_count} /> : null}
        </>}
      >
        <RecordReopen noun="subtask" row={row} reopen={subtasksApi.reopen} onDone={load} />
        <Link className="ws-btn ghost" to={`/subtasks/${recordId}/edit`} state={hereState}><i className="ri-pencil-line" />Edit</Link>
        <button className="ws-btn danger" type="button" onClick={async () => {
          if (!confirm('Delete this subtask?')) return
          await subtasksApi.remove(recordId)
          nav(trail.backTo, { state: trail.backState })
        }}><i className="ri-delete-bin-line" />Delete</button>
      </FrHeader>
      <FrAcc>
        <FrSection label="Overview">
          <FrGrid>
            <FrValue label="Subtask code">{fmt(row.subtask_code)}</FrValue>
            <FrValue label="Parent task">
              {row.task_id
                ? <Link to={`/tasks/${row.task_id}?tab=subtasks`} state={crumbState(loc, `/tasks/${row.task_id}?tab=subtasks`)}>{fmt(row.task_name)}</Link>
                : fmt(row.task_name)}
            </FrValue>
            <FrValue label="Project">
              {row.project_id
                ? <Link to={`/projects/${row.project_id}?tab=tasks`} state={crumbState(loc, `/projects/${row.project_id}?tab=tasks`)}>{fmt(row.project_name)}</Link>
                : fmt(row.project_name)}
            </FrValue>
            <FrValue label="Start">{fmt(row.start_date)}</FrValue>
            <FrValue label="End">{fmt(row.end_date)}</FrValue>
            <FrValue label="Status">{fmt(row.status)}</FrValue>
            <FrValue label="Priority">{fmt(row.priority)}</FrValue>
            <FrValue label="Assignee">{fmt(row.assigned_to_name)}</FrValue>
            <FrValue label="Summary" span={4}>{fmt(row.summary)}</FrValue>
          </FrGrid>
        </FrSection>
        <FrSection label="Audit log" count={Number(row.revision_count || revs.length || 0)}>
          <RevisionLog rows={revs} />
        </FrSection>
        <RecordActivity itemType="subtask" itemId={recordId} />
      </FrAcc>
    </FrPage>
  )
}

export { default as SubtaskForm } from './SubtaskComposer'

export { EmployeesList as EmployeesPage } from './Employees'
export { UsersList } from './Users'
export { CompaniesPage, DepartmentsPage } from './Masters'
