/**
 * Maps MySQL projects / tasks / subtasks into the row shapes
 * ProjectDashboardPage expects (Kissflow-mapped CTO dashboard).
 */
import { all } from '../db/index.js'
import { loadRevisionIndex, type RevisionRow } from './revisions.js'

type Row = Record<string, unknown>

const RAG_AT_RISK_WINDOW_DAYS = 14
const RAG_PROGRESS_SLACK_PCT = 10

function str(v: unknown, fallback = '') {
  if (v == null) return fallback
  const t = String(v).trim()
  return t || fallback
}

function toInitials(name: string) {
  const parts = str(name).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'NA'
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'NA'
}

function parseDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const cleaned = String(value).replace(/\s+[A-Za-z_/]+$/, '').trim()
  if (!cleaned || cleaned === '—' || cleaned === '-') return null
  const ymd = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymd) {
    const local = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    return Number.isNaN(local.getTime()) ? null : local
  }
  const d = new Date(cleaned)
  return Number.isNaN(d.getTime()) ? null : d
}

function fmtDate(value: unknown): string | null {
  const d = value instanceof Date ? value : parseDate(value)
  if (!d) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toLocalDateOnly(value: unknown): Date | null {
  const parsed = value instanceof Date && !Number.isNaN(value.getTime())
    ? value
    : parseDate(value)
  if (!parsed) return null
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

function isClosedStatus(status: unknown) {
  const s = str(status).toLowerCase()
  return s.includes('complete') || s.includes('closed') || s === 'done'
}

function isTaskCompleted(status: unknown) {
  const s = str(status).toLowerCase()
  return s.includes('complete') || s.includes('closed') || s.includes('done')
}

function calendarDaysPast(endDateLike: unknown, now = new Date()) {
  const end = toLocalDateOnly(endDateLike)
  const today = toLocalDateOnly(now)
  if (!end || !today) return 0
  const diff = Math.round((today.getTime() - end.getTime()) / 86400000)
  return diff > 0 ? diff : 0
}

function computeProjectDelayDays(status: unknown, endDateLike: unknown, now = new Date()) {
  if (isClosedStatus(status)) return 0
  return calendarDaysPast(endDateLike, now)
}

function computeProjectRag(input: {
  status: unknown
  delayDays: number
  progress: number
  startDate: unknown
  endDate: unknown
  now?: Date
}) {
  const now = input.now || new Date()
  if (isClosedStatus(input.status)) return 'Green'
  const overdueDays = input.delayDays > 0 ? input.delayDays : calendarDaysPast(input.endDate, now)
  if (overdueDays > 0) return 'Red'

  const start = toLocalDateOnly(input.startDate)
  const end = toLocalDateOnly(input.endDate)
  const today = toLocalDateOnly(now)
  const progressPct = Number.isFinite(input.progress) ? Math.max(0, Math.min(100, input.progress)) : 0

  if (start && end && today && end.getTime() > start.getTime()) {
    const totalMs = end.getTime() - start.getTime()
    const elapsedMs = Math.min(Math.max(today.getTime() - start.getTime(), 0), totalMs)
    const expectedPct = (elapsedMs / totalMs) * 100
    const daysLeft = Math.round((end.getTime() - today.getTime()) / 86400000)
    const behind = progressPct < expectedPct - RAG_PROGRESS_SLACK_PCT
    if (behind && daysLeft <= RAG_AT_RISK_WINDOW_DAYS) return 'Amber'
    if (behind && expectedPct >= 50) return 'Amber'
  } else if (end && today && end.getTime() >= today.getTime()) {
    const daysLeft = Math.round((end.getTime() - today.getTime()) / 86400000)
    if (daysLeft <= RAG_AT_RISK_WINDOW_DAYS && progressPct < 70) return 'Amber'
  }
  return 'Green'
}

function mapTaskRag(status: unknown, delayDays: number) {
  const s = str(status).toLowerCase()
  if (delayDays > 0 || s.includes('overdue')) return 'Red'
  if (isTaskCompleted(s)) return 'Green'
  return 'Amber'
}

function techStackName(raw: unknown) {
  if (!raw) return ''
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (obj && typeof obj === 'object') {
      return str((obj as { Solution_Name?: string; Name?: string }).Solution_Name
        || (obj as { Name?: string }).Name)
    }
  } catch {
    return str(raw)
  }
  return str(raw)
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toTrackerRevision(row: RevisionRow, idx: number) {
  const end = row.changes.find((c) => c.field === 'end_date')
  const first = row.changes[0]
  return {
    date: fmtDate(row.created_at) || row.created_at,
    previousEndDate: end?.from ?? first?.from ?? '—',
    newEndDate: end?.to ?? first?.to ?? '—',
    reason: row.changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join(' · ') || 'Record updated',
    revisedBy: str(row.user_name, 'Someone'),
    key: `REV-${row.item_type}-${row.item_id}-${row.revision_no || idx + 1}`,
    changes: row.changes,
  }
}

export async function buildPortfolio() {
  const [projects, tasks, subtasks, timeline, revIndex] = await Promise.all([
    all<Row>(`SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY id DESC`),
    all<Row>(`
      SELECT t.*, p.kissflow_id as project_kissflow_id, p.project_code as project_code,
             p.name as project_name, p.company_name as project_company_name,
             p.entity as project_entity, p.category as project_category
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.deleted_at IS NULL
      ORDER BY t.id DESC
    `),
    all<Row>(`
      SELECT s.*, t.task_code as parent_task_code, t.kissflow_id as parent_task_kissflow_id,
             t.name as parent_task_name
      FROM subtasks s
      LEFT JOIN tasks t ON t.id = s.task_id
      WHERE s.deleted_at IS NULL
      ORDER BY s.id DESC
    `),
    all<Row>(`SELECT * FROM project_timeline_history ORDER BY id ASC`),
    loadRevisionIndex(),
  ])
  const revCount = (type: string, id: unknown) => revIndex.get(`${type}:${Number(id)}`)?.length || 0
  const revHistory = (type: string, id: unknown, fallback: unknown[] = []) => {
    const rows = revIndex.get(`${type}:${Number(id)}`) || []
    if (!rows.length) return fallback
    return rows.map((r, idx) => toTrackerRevision(r, idx))
  }

  const timelineByProject = new Map<number, Row[]>()
  for (const row of timeline) {
    const pid = Number(row.project_id)
    if (!timelineByProject.has(pid)) timelineByProject.set(pid, [])
    timelineByProject.get(pid)!.push(row)
  }

  const tasksByProjectId = new Map<number, Row[]>()
  for (const t of tasks) {
    const pid = Number(t.project_id)
    if (!Number.isFinite(pid)) continue
    if (!tasksByProjectId.has(pid)) tasksByProjectId.set(pid, [])
    tasksByProjectId.get(pid)!.push(t)
  }

  const now = new Date()

  const mappedTasks = tasks.map((t, idx) => {
    const start = parseDate(t.start_date)
    const end = parseDate(t.end_date)
    const status = str(t.status, 'Open')
    const delayDays = !isTaskCompleted(status) && end ? calendarDaysPast(end, now) : 0
    const aging = num(t.aging_days) ?? (start
      ? Math.max(0, Math.ceil((now.getTime() - start.getTime()) / 86400000))
      : 0)
    const assignedTo = str(t.assigned_to_name, 'Unassigned')
    const projectKissflowId = str(t.project_kissflow_id)
    const projectCode = str(t.project_code)
    const projectName = str(t.project_name, '—')
    const taskBusinessId = str(t.task_code) || str(t.kissflow_id) || `TASK-${idx + 1}`
    const instanceKey = str(t.kissflow_id) || taskBusinessId
    const startDate = fmtDate(start)
    const endDate = fmtDate(end)
    const row = {
      id: taskBusinessId,
      dbId: Number(t.id) || null,
      taskId: str(t.task_code),
      taskBusinessId: str(t.task_code),
      InstanceID: instanceKey,
      ActivityID: '',
      _id: instanceKey,
      _activity_instance_id: '',
      projectId: projectKissflowId,
      projectRef: projectCode,
      projectName,
      taskName: str(t.name, 'Untitled Task'),
      taskType: str(t.task_type),
      entity: str(t.entity || t.project_entity),
      functions: str(t.function_category),
      companyName: str(t.project_company_name || t.entity),
      lineOfBusiness: str(t.project_category || t.function_category),
      functionType: str(t.function_type),
      priority: str(t.priority),
      assignedTo,
      assignedToId: t.assigned_to_employee_id != null ? String(t.assigned_to_employee_id) : '',
      assignedToEmail: '',
      assigneeAvatar: toInitials(assignedTo),
      startDate,
      endDate,
      originalEndDate: endDate,
      revisedEndDate: null as string | null,
      previousEndDate: null as string | null,
      revisedCount: revCount('task', t.id),
      hasRevision: revCount('task', t.id) > 0,
      revisionHistory: revHistory('task', t.id),
      createdAt: fmtDate(t.kissflow_created_at || t.created_at),
      agingDays: aging,
      delayDays,
      status,
      raw: {
        _id: instanceKey,
        Subtaxk_id: t.task_code,
        Task_ID_Formulated: t.task_code,
        Sub_Task_Name: t.name,
        Task_Status: t.status,
        Task_Priority: t.priority,
        Start_Date: t.start_date,
        End_Date: t.end_date,
        Assigned_To: { Name: assignedTo },
        Project_ID: {
          _id: projectKissflowId,
          _item_id: projectKissflowId,
          Project_ID: projectCode,
          Project_Name: projectName,
          Name: projectName,
        },
        Project_ID_Details: projectCode,
      },
    }
    return { ...row, rag: mapTaskRag(status, delayDays) }
  })

  const mappedProjects = projects.map((p, index) => {
    const id = str(p.kissflow_id) || str(p.project_code) || `PRJ-${index + 1}`
    const displayId = str(p.project_code) || id
    const status = str(p.status, 'Open')
    const ownerName = str(p.project_owner_name, 'Unassigned')
    const businessOwner = str(p.business_owner_name)
    const startDate = parseDate(p.start_date) || parseDate(p.kissflow_created_at)
    const dueDate = parseDate(p.end_date)
    const hist = (timelineByProject.get(Number(p.id)) || []).slice()
    const sorted = hist
      .map((h) => ({
        newDate: fmtDate(h.revised_end_date),
        date: fmtDate(h.changed_on || h.created_at),
        revisedBy: str(h.created_by_name, 'System'),
        key: `REV-${p.id}-${h.id}`,
      }))
      .filter((h) => h.newDate)
    const revisedEndDate = sorted.length ? sorted[sorted.length - 1].newDate : null
    const previousEndDate = sorted.length > 1 ? sorted[sorted.length - 2].newDate : (sorted.length === 1 ? fmtDate(dueDate) : null)
    const effectiveEnd = parseDate(revisedEndDate) || dueDate
    const linked = tasksByProjectId.get(Number(p.id)) || []
    const totalTasks = linked.length
    const completedTasks = linked.filter((t) => isTaskCompleted(t.status)).length
    const progress = isClosedStatus(status)
      ? 100
      : totalTasks > 0
        ? Math.round((completedTasks / totalTasks) * 100)
        : 0
    const delayDays = computeProjectDelayDays(status, effectiveEnd, now)
    const rag = computeProjectRag({
      status,
      delayDays,
      progress,
      startDate,
      endDate: effectiveEnd,
      now,
    })

    return {
      id,
      dbId: Number(p.id) || null,
      displayId,
      name: str(p.name, `Project ${id}`),
      owner: ownerName,
      ownerId: p.project_owner_employee_id != null ? String(p.project_owner_employee_id) : '',
      ownerEmail: '',
      ownerAvatar: toInitials(ownerName),
      businessOwner,
      businessOwnerId: p.business_owner_employee_id != null ? String(p.business_owner_employee_id) : '',
      businessOwnerEmail: '',
      lineOfBusiness: str(p.category, 'Project Management'),
      functionType: str(p.function_type),
      department: str(p.function_category, 'N/A'),
      priority: str(p.priority, 'Low'),
      startDate: fmtDate(startDate),
      originalEndDate: fmtDate(dueDate),
      plannedEndDate: fmtDate(dueDate),
      previousEndDate,
      revisedEndDate,
      hasRevision: revCount('project', p.id) > 0 || sorted.length > 0,
      revisedCount: revCount('project', p.id) || sorted.length,
      progress,
      rag,
      status,
      delayDays,
      totalTasks,
      completedTasks,
      risk: str(p.risk, 'N/A'),
      riskMitigation: Boolean(p.risk_mitigation),
      riskMitigationDetails: '',
      governanceFrequency: str(p.governance_frequency, 'N/A'),
      entity: str(p.entity, 'N/A'),
      companyName: str(p.company_name),
      aiUsage: Boolean(p.ai_usage),
      aiDetails: str(p.ai_details),
      functionCategory: str(p.function_category),
      functionSubCategory: str(p.function_sub_category),
      applicationName: str(p.application_name),
      projectType: str(p.project_type),
      projectRequest: str(p.project_request),
      vendorName: str(p.vendor_name),
      techStack: techStackName(p.tech_stack),
      hours: num(p.hours),
      tcoEfforts: null as number | null,
      agingDays: num(p.aging_days),
      tatDays: num(p.tat_days),
      requester: str(p.requester_name),
      sponsor: str(p.sponsor_name),
      sponsorId: p.sponsor_employee_id != null ? String(p.sponsor_employee_id) : '',
      sponsorEmail: '',
      projectOwner: str(p.project_owner_name),
      projectOwnerId: p.project_owner_employee_id != null ? String(p.project_owner_employee_id) : '',
      projectOwnerEmail: '',
      cosOwner: str(p.cos_owner_name),
      cosOwnerId: '',
      cosOwnerEmail: '',
      developer: str(p.developer_name),
      developerId: p.developer_employee_id != null ? String(p.developer_employee_id) : '',
      developerEmail: '',
      projectManager: str(p.project_manager_name),
      reportsAvailable: Boolean(p.reports_available),
      integratedTally: Boolean(p.integrated_with_tally),
      integratedSap: Boolean(p.integrated_with_sap),
      integratedPowerBi: Boolean(p.integrated_with_power_bi),
      brdAvailable: Boolean(p.brd_available),
      processDocAvailable: Boolean(p.process_document),
      supportAvailable: Boolean(p.support_available),
      cbAnalysisAvailable: Boolean(p.cb_analysis_available),
      createdAt: fmtDate(p.kissflow_created_at || p.created_at),
      modifiedAt: fmtDate(p.kissflow_modified_at || p.updated_at),
      createdBy: str(p.requester_name),
      createdById: '',
      createdByEmail: '',
      priorityLabel: str(p.priority, 'Low'),
      subtasks: [] as unknown[],
      revisionHistory: revHistory('project', p.id, sorted.map((entry, revIdx) => ({
        date: entry.date,
        previousEndDate: revIdx > 0 ? sorted[revIdx - 1].newDate : '—',
        newEndDate: entry.newDate,
        reason: 'End date updated',
        revisedBy: entry.revisedBy,
        key: entry.key,
      }))),
      activityHistory: [] as unknown[],
    }
  })

  const mappedSubtasks = subtasks.map((s, idx) => {
    const displayName = str(s.name, 'Untitled subtask')
    const assignee = str(s.assigned_to_name, '—')
    const parentId = str(s.parent_task_code) || str(s.parent_task_kissflow_id)
    const id = str(s.kissflow_id) || `SUB-${s.id || idx + 1}`
    return {
      id,
      dbId: Number(s.id) || null,
      parentTaskBusinessId: parentId,
      taskName: displayName,
      subtaskName: displayName,
      name: displayName,
      summary: str(s.summary) || displayName,
      assignedTo: assignee,
      createdBy: str(s.created_by_name, '—'),
      assigneeAvatar: toInitials(assignee !== '—' ? assignee : str(s.created_by_name)),
      status: str(s.status, 'Open'),
      startDate: fmtDate(s.start_date) || '—',
      endDate: fmtDate(s.end_date) || '—',
      agingDays: 0,
      delayDays: !isTaskCompleted(s.status) ? calendarDaysPast(s.end_date, now) : 0,
      revisedCount: revCount('subtask', s.id),
      hasRevision: revCount('subtask', s.id) > 0,
      revisionHistory: revHistory('subtask', s.id),
      _id: id,
      _activity_instance_id: '',
      InstanceID: id,
      ActivityID: '',
      raw: s,
    }
  })

  return {
    projects: mappedProjects,
    tasks: mappedTasks,
    processSubtasks: mappedSubtasks,
  }
}
