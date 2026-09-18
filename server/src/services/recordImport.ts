import { get, run, now } from '../db/index.js'
import type { AuthUser } from '../middleware/auth.js'
import { applyCreateDefaults } from './employeeProfile.js'
import { lifecycleFields, mergeWrite, prepareCreateBody } from './recordIdentity.js'
import { diffRecords, recordCreated, recordRevision } from './revisions.js'
import { findEmployee, resolveAssignmentMeta } from './fieldAccess.js'
import { csvTemplate, mapRowByAliases, readSpreadsheetRows } from './spreadsheet.js'
import { projectRowVisible, resolveVisibility, subtaskRowVisible, taskRowVisible } from './recordVisibility.js'

export type RecordImportKind = 'project' | 'task' | 'subtask'

export type RecordImportSummary = {
  total: number
  created: number
  updated: number
  skipped: number
  errors: Array<{ row: number; message: string }>
}

const PROJECT_ALIASES: Record<string, string> = {
  name: 'name',
  project_name: 'name',
  title: 'name',
  project_code: 'project_code',
  code: 'project_code',
  kissflow_id: 'kissflow_id',
  project_id: 'kissflow_id',
  prj_id: 'kissflow_id',
  status: 'status',
  priority: 'priority',
  rag: 'rag',
  rag_status: 'rag',
  risk: 'risk',
  category: 'category',
  function: 'category',
  project_type: 'project_type',
  project_request: 'project_request',
  function_type: 'function_type',
  function_category: 'function_category',
  function_sub_category: 'function_sub_category',
  company: 'company_name',
  company_name: 'company_name',
  entity: 'entity',
  business: 'business',
  start_date: 'start_date',
  start: 'start_date',
  end_date: 'end_date',
  end: 'end_date',
  due_date: 'end_date',
  governance_frequency: 'governance_frequency',
  governance: 'governance_frequency',
  objectives: 'objectives',
  tech_stack: 'tech_stack',
  hours: 'hours',
  tco_efforts: 'tco_efforts',
  completion: 'completion',
  progress: 'completion',
  application_name: 'application_name',
  vendor: 'vendor_name',
  vendor_name: 'vendor_name',
  requester: 'requester_name',
  requester_name: 'requester_name',
  owner: 'project_owner_name',
  project_owner: 'project_owner_name',
  project_owner_name: 'project_owner_name',
  sponsor: 'sponsor_name',
  sponsor_name: 'sponsor_name',
  project_manager: 'project_manager_name',
  project_manager_name: 'project_manager_name',
  developer: 'developer_name',
  developer_name: 'developer_name',
  business_owner: 'business_owner_name',
  business_owner_name: 'business_owner_name',
  assignee: 'assignee_name',
  assignee_name: 'assignee_name',
  cos_owner: 'cos_owner_name',
  cos_owner_name: 'cos_owner_name',
  l1_manager_email: 'l1_manager_email',
  l2_manager_email: 'l2_manager_email',
  ai_usage: 'ai_usage',
  reports_available: 'reports_available',
  integrated_with_tally: 'integrated_with_tally',
  integrated_with_sap: 'integrated_with_sap',
  integrated_with_power_bi: 'integrated_with_power_bi',
  brd_available: 'brd_available',
  process_document: 'process_document',
  support_available: 'support_available',
  cb_analysis_available: 'cb_analysis_available',
  risk_mitigation: 'risk_mitigation',
  risk_mitigation_details: 'risk_mitigation_details',
  ai_details: 'ai_details',
}

const TASK_ALIASES: Record<string, string> = {
  name: 'name',
  task_name: 'name',
  title: 'name',
  task_code: 'task_code',
  code: 'task_code',
  kissflow_id: 'kissflow_id',
  project_code: 'project_code',
  project_name: 'project_name',
  project: 'project_name',
  project_kissflow_id: 'project_kissflow_id',
  detail: 'detail',
  description: 'detail',
  status: 'status',
  workflow_status: 'workflow_status',
  priority: 'priority',
  task_type: 'task_type',
  entity: 'entity',
  application_name: 'application_name',
  function_category: 'function_category',
  function_sub_category: 'function_sub_category',
  function_type: 'function_type',
  start_date: 'start_date',
  start: 'start_date',
  end_date: 'end_date',
  end: 'end_date',
  due_date: 'end_date',
  assigned_to: 'assigned_to_name',
  assigned_to_name: 'assigned_to_name',
  assignee: 'assigned_to_name',
  assigned_to_email: 'assigned_to_email',
  assignee_email: 'assigned_to_email',
  secondary_assignee: 'secondary_assignee_name',
  secondary_assignee_name: 'secondary_assignee_name',
  l1_manager_email: 'l1_manager_email',
  l2_manager_email: 'l2_manager_email',
  root_cause_analysis: 'root_cause_analysis',
  requires_approval: 'requires_approval',
  is_dependent: 'is_dependent',
}

const SUBTASK_ALIASES: Record<string, string> = {
  name: 'name',
  subtask_name: 'name',
  title: 'name',
  kissflow_id: 'kissflow_id',
  subtask_code: 'subtask_code',
  code: 'subtask_code',
  task_code: 'task_code',
  task_name: 'task_name',
  task: 'task_name',
  summary: 'summary',
  detail: 'summary',
  description: 'summary',
  status: 'status',
  workflow_status: 'workflow_status',
  priority: 'priority',
  start_date: 'start_date',
  start: 'start_date',
  end_date: 'end_date',
  end: 'end_date',
  due_date: 'end_date',
  assigned_to: 'assigned_to_name',
  assigned_to_name: 'assigned_to_name',
  assignee: 'assigned_to_name',
  assigned_to_email: 'assigned_to_email',
  assignee_email: 'assigned_to_email',
  l1_manager_email: 'l1_manager_email',
  l2_manager_email: 'l2_manager_email',
  is_dependent: 'is_dependent',
}

const KINDS: Record<string, 'date' | 'bool' | 'number' | 'string'> = {
  start_date: 'date',
  end_date: 'date',
  hours: 'number',
  tco_efforts: 'number',
  completion: 'number',
  tat_days: 'number',
  aging_days: 'number',
  ai_usage: 'bool',
  reports_available: 'bool',
  integrated_with_tally: 'bool',
  integrated_with_sap: 'bool',
  integrated_with_power_bi: 'bool',
  brd_available: 'bool',
  process_document: 'bool',
  support_available: 'bool',
  cb_analysis_available: 'bool',
  risk_mitigation: 'bool',
  requires_approval: 'bool',
  is_dependent: 'bool',
}

export const PROJECT_TEMPLATE = [
  'name', 'project_code', 'status', 'priority', 'rag', 'risk', 'category',
  'project_type', 'company_name', 'entity', 'business', 'start_date', 'end_date',
  'project_owner_name', 'requester_name', 'sponsor_name', 'project_manager_name',
  'assignee_name', 'governance_frequency', 'objectives', 'tech_stack', 'completion',
]

export const TASK_TEMPLATE = [
  'name', 'task_code', 'project_code', 'project_name', 'status', 'priority',
  'task_type', 'entity', 'start_date', 'end_date', 'assigned_to_name', 'assigned_to_email',
  'detail', 'l1_manager_email', 'l2_manager_email',
]

export const SUBTASK_TEMPLATE = [
  'name', 'subtask_code', 'task_code', 'task_name', 'status', 'priority',
  'start_date', 'end_date', 'assigned_to_name', 'assigned_to_email', 'summary',
]

const PROJECT_WRITE = [
  'kissflow_id', 'project_code', 'source', 'name', 'status', 'priority', 'rag', 'risk',
  'category', 'project_type', 'project_request', 'function_type',
  'function_category', 'function_sub_category',
  'company_name', 'entity', 'business', 'company_id',
  'start_date', 'end_date', 'governance_frequency',
  'ai_usage', 'ai_details',
  'reports_available', 'integrated_with_tally', 'integrated_with_sap', 'integrated_with_power_bi',
  'brd_available', 'process_document', 'support_available', 'cb_analysis_available', 'risk_mitigation',
  'objectives', 'tech_stack', 'tat_days', 'aging_days', 'hours', 'tco_efforts', 'completion',
  'application_name', 'vendor_name', 'l1_manager_email', 'l2_manager_email',
  'requester_employee_id', 'requester_name',
  'business_owner_employee_id', 'business_owner_name',
  'project_owner_employee_id', 'project_owner_name',
  'sponsor_employee_id', 'sponsor_name',
  'project_manager_employee_id', 'project_manager_name',
  'developer_employee_id', 'developer_name', 'cos_owner_name', 'assignee_name',
  'risk_mitigation_details',
]

const TASK_WRITE = [
  'kissflow_id', 'task_code', 'source', 'project_id', 'name', 'detail', 'status', 'workflow_status',
  'priority', 'task_type', 'entity', 'application_name',
  'function_category', 'function_sub_category', 'function_type',
  'start_date', 'end_date', 'tat_days', 'aging_days',
  'requires_approval', 'is_dependent',
  'assigned_to_employee_id', 'assigned_to_name', 'secondary_assignee_name',
  'l1_manager_email', 'l2_manager_email', 'root_cause_analysis',
  'created_by_name', 'created_by_email',
]

const SUBTASK_WRITE = [
  'kissflow_id', 'subtask_code', 'source', 'task_id', 'name', 'summary', 'status', 'workflow_status', 'priority',
  'start_date', 'end_date', 'is_dependent',
  'assigned_to_employee_id', 'assigned_to_name',
  'l1_manager_email', 'l2_manager_email', 'created_by_name',
]

function blank(v: unknown) {
  return v == null || String(v).trim() === ''
}

function empName(emp: { first_name?: string; last_name?: string } | null) {
  if (!emp) return ''
  return `${emp.first_name || ''} ${emp.last_name || ''}`.trim()
}

async function resolvePerson(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return { id: null as number | null, name: null as string | null, email: null as string | null }
  const emp = await findEmployee({
    email: raw.includes('@') ? raw : null,
    employeeCode: !raw.includes('@') && !raw.includes(' ') ? raw : null,
    name: raw.includes('@') ? null : raw,
  })
  if (emp) return { id: Number(emp.id), name: empName(emp) || raw, email: emp.email || (raw.includes('@') ? raw : null) }
  return { id: null, name: raw.includes('@') ? null : raw, email: raw.includes('@') ? raw : null }
}

async function resolveCompanyId(name: unknown) {
  const n = String(name || '').trim()
  if (!n) return null
  const row = await get<{ id: number }>(`
    SELECT id FROM companies WHERE deleted_at IS NULL AND LOWER(TRIM(name)) = LOWER(?) LIMIT 1
  `, [n])
  return row?.id ?? null
}

async function findProject(opts: { code?: string | null; kissflow?: string | null; name?: string | null }) {
  if (opts.kissflow) {
    const row = await get<Record<string, unknown>>(`SELECT * FROM projects WHERE deleted_at IS NULL AND kissflow_id = ? LIMIT 1`, [opts.kissflow])
    if (row) return row
  }
  if (opts.code) {
    const row = await get<Record<string, unknown>>(`SELECT * FROM projects WHERE deleted_at IS NULL AND project_code = ? LIMIT 1`, [opts.code])
    if (row) return row
  }
  if (opts.name) {
    return get<Record<string, unknown>>(`SELECT * FROM projects WHERE deleted_at IS NULL AND LOWER(TRIM(name)) = LOWER(?) LIMIT 1`, [opts.name])
  }
  return undefined
}

async function findTask(opts: { code?: string | null; kissflow?: string | null; name?: string | null }) {
  if (opts.kissflow) {
    const row = await get<Record<string, unknown>>(`SELECT * FROM tasks WHERE deleted_at IS NULL AND kissflow_id = ? LIMIT 1`, [opts.kissflow])
    if (row) return row
  }
  if (opts.code) {
    const row = await get<Record<string, unknown>>(`SELECT * FROM tasks WHERE deleted_at IS NULL AND task_code = ? LIMIT 1`, [opts.code])
    if (row) return row
  }
  if (opts.name) {
    return get<Record<string, unknown>>(`SELECT * FROM tasks WHERE deleted_at IS NULL AND LOWER(TRIM(name)) = LOWER(?) LIMIT 1`, [opts.name])
  }
  return undefined
}

function writePayload(fields: string[], body: Record<string, unknown>) {
  const cols: string[] = []
  const vals: unknown[] = []
  for (const f of fields) {
    if (body[f] === undefined) continue
    cols.push(f)
    if (f === 'tech_stack') {
      const raw = body[f]
      if (typeof raw === 'string') {
        const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
        vals.push(JSON.stringify(parts))
      } else {
        vals.push(raw == null ? null : JSON.stringify(raw))
      }
    } else {
      vals.push(body[f] === '' ? null : body[f])
    }
  }
  return { cols, vals }
}

async function upsert(table: string, fields: string[], body: Record<string, unknown>, existingId?: number, userId?: number | null) {
  const ts = now()
  const { cols, vals } = writePayload(fields, body)
  if (!cols.length && !existingId) return 0
  if (existingId) {
    const existing = await get<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ?`, [existingId])
    const life = lifecycleFields(existing || null, body.status, userId ?? null, ts)
    for (let i = 0; i < life.fields.length; i += 1) mergeWrite(cols, vals, life.fields[i], life.vals[i])
    if (!cols.length) return existingId
    await run(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...vals, ts, existingId],
    )
    return existingId
  }
  const insertCols = [...cols, 'created_by_user_id', 'updated_by_user_id', 'created_at', 'updated_at']
  const insertVals = [...vals, userId ?? null, userId ?? null, ts, ts]
  const info = await run(
    `INSERT INTO ${table} (${insertCols.join(',')}) VALUES (${insertCols.map(() => '?').join(',')})`,
    insertVals,
  )
  return Number(info.insertId)
}

const TABLE_BY_KIND: Record<RecordImportKind, string> = {
  project: 'projects',
  task: 'tasks',
  subtask: 'subtasks',
}

async function auditImport(
  kind: RecordImportKind,
  existing: Record<string, unknown> | undefined,
  id: number,
  user?: AuthUser,
) {
  if (!id) return
  const after = await get<Record<string, unknown>>(`SELECT * FROM ${TABLE_BY_KIND[kind]} WHERE id = ?`, [id])
  if (!after) return
  if (existing) {
    const changes = diffRecords(existing, after)
    await recordRevision({ itemType: kind, itemId: id, user, action: 'import', changes })
    return
  }
  await recordCreated({ itemType: kind, itemId: id, user, row: after, action: 'import' })
}

async function importProjects(rows: Record<string, unknown>[], user?: AuthUser): Promise<RecordImportSummary> {
  const summary: RecordImportSummary = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [] }
  const vis = await resolveVisibility(user)
  for (let i = 0; i < rows.length; i += 1) {
    const rowNum = i + 2
    try {
      const mapped = mapRowByAliases(rows[i], PROJECT_ALIASES, KINDS)
      if (blank(mapped.name) && blank(mapped.project_code) && blank(mapped.kissflow_id)) {
        summary.skipped += 1
        continue
      }
      if (blank(mapped.name)) {
        summary.skipped += 1
        summary.errors.push({ row: rowNum, message: 'Name is required' })
        continue
      }
      const existing = await findProject({
        kissflow: mapped.kissflow_id ? String(mapped.kissflow_id) : null,
        code: mapped.project_code ? String(mapped.project_code) : null,
      })
      if (existing && !vis.unrestricted && !projectRowVisible(vis, existing)) {
        summary.skipped += 1
        summary.errors.push({ row: rowNum, message: 'No access to update this project' })
        continue
      }
      let body = existing ? { ...mapped } : await applyCreateDefaults('project', mapped, user)
      if (!existing) body = await prepareCreateBody('project', body, 'import')
      if (blank(body.status)) body.status = 'Open'
      if (body.company_name) {
        const cid = await resolveCompanyId(body.company_name)
        if (cid) body.company_id = cid
      }
      for (const [nameKey, idKey] of [
        ['project_owner_name', 'project_owner_employee_id'],
        ['requester_name', 'requester_employee_id'],
        ['sponsor_name', 'sponsor_employee_id'],
        ['project_manager_name', 'project_manager_employee_id'],
        ['developer_name', 'developer_employee_id'],
        ['business_owner_name', 'business_owner_employee_id'],
      ] as const) {
        if (!blank(body[nameKey]) && body[idKey] == null) {
          const person = await resolvePerson(body[nameKey])
          if (person.id) body[idKey] = person.id
          if (person.name) body[nameKey] = person.name
        }
      }
      const meta = await resolveAssignmentMeta('project', body)
      body = { ...body, ...meta.extra }
      if (existing) {
        const id = await upsert('projects', PROJECT_WRITE, body, Number(existing.id), user?.id)
        await auditImport('project', existing, id, user)
        summary.updated += 1
      } else {
        const id = await upsert('projects', PROJECT_WRITE, body, undefined, user?.id)
        await auditImport('project', undefined, id, user)
        summary.created += 1
      }
    } catch (e) {
      summary.skipped += 1
      summary.errors.push({ row: rowNum, message: e instanceof Error ? e.message : 'Import failed' })
    }
  }
  return summary
}

async function importTasks(rows: Record<string, unknown>[], user?: AuthUser): Promise<RecordImportSummary> {
  const summary: RecordImportSummary = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [] }
  const vis = await resolveVisibility(user)
  for (let i = 0; i < rows.length; i += 1) {
    const rowNum = i + 2
    try {
      const mapped = mapRowByAliases(rows[i], TASK_ALIASES, KINDS)
      if (blank(mapped.name) && blank(mapped.task_code) && blank(mapped.kissflow_id)) {
        summary.skipped += 1
        continue
      }
      if (blank(mapped.name)) {
        summary.skipped += 1
        summary.errors.push({ row: rowNum, message: 'Name is required' })
        continue
      }
      const project = await findProject({
        code: mapped.project_code ? String(mapped.project_code) : null,
        kissflow: mapped.project_kissflow_id ? String(mapped.project_kissflow_id) : null,
        name: mapped.project_name ? String(mapped.project_name) : null,
      })
      if ((mapped.project_code || mapped.project_name || mapped.project_kissflow_id) && !project) {
        summary.skipped += 1
        summary.errors.push({ row: rowNum, message: 'Project not found (use project_code or project_name)' })
        continue
      }
      if (project && !vis.unrestricted && !projectRowVisible(vis, project)) {
        summary.skipped += 1
        summary.errors.push({ row: rowNum, message: 'No access to the linked project' })
        continue
      }
      const existing = await findTask({
        kissflow: mapped.kissflow_id ? String(mapped.kissflow_id) : null,
        code: mapped.task_code ? String(mapped.task_code) : null,
      })
      if (existing && !vis.unrestricted && !taskRowVisible(vis, existing)) {
        summary.skipped += 1
        summary.errors.push({ row: rowNum, message: 'No access to update this task' })
        continue
      }
      let body: Record<string, unknown> = { ...mapped }
      delete body.project_code
      delete body.project_name
      delete body.project_kissflow_id
      delete body.assigned_to_email
      if (project) body.project_id = Number(project.id)
      const assignee = await resolvePerson(mapped.assigned_to_email || mapped.assigned_to_name)
      if (assignee.id) body.assigned_to_employee_id = assignee.id
      if (assignee.name) body.assigned_to_name = assignee.name
      body = existing ? body : await applyCreateDefaults('task', body, user)
      if (!existing) body = await prepareCreateBody('task', body, 'import')
      if (blank(body.status)) body.status = 'Open'
      const meta = await resolveAssignmentMeta('task', body)
      body = { ...body, ...meta.extra }
      if (existing) {
        const id = await upsert('tasks', TASK_WRITE, body, Number(existing.id), user?.id)
        await auditImport('task', existing, id, user)
        summary.updated += 1
      } else {
        const id = await upsert('tasks', TASK_WRITE, body, undefined, user?.id)
        await auditImport('task', undefined, id, user)
        summary.created += 1
      }
    } catch (e) {
      summary.skipped += 1
      summary.errors.push({ row: rowNum, message: e instanceof Error ? e.message : 'Import failed' })
    }
  }
  return summary
}

async function importSubtasks(rows: Record<string, unknown>[], user?: AuthUser): Promise<RecordImportSummary> {
  const summary: RecordImportSummary = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [] }
  const vis = await resolveVisibility(user)
  for (let i = 0; i < rows.length; i += 1) {
    const rowNum = i + 2
    try {
      const mapped = mapRowByAliases(rows[i], SUBTASK_ALIASES, KINDS)
      if (blank(mapped.name) && blank(mapped.kissflow_id) && blank(mapped.subtask_code)) {
        summary.skipped += 1
        continue
      }
      if (blank(mapped.name)) {
        summary.skipped += 1
        summary.errors.push({ row: rowNum, message: 'Name is required' })
        continue
      }
      const task = await findTask({
        code: mapped.task_code ? String(mapped.task_code) : null,
        name: mapped.task_name ? String(mapped.task_name) : null,
      })
      if ((mapped.task_code || mapped.task_name) && !task) {
        summary.skipped += 1
        summary.errors.push({ row: rowNum, message: 'Task not found (use task_code or task_name)' })
        continue
      }
      if (task && !vis.unrestricted && !taskRowVisible(vis, task)) {
        summary.skipped += 1
        summary.errors.push({ row: rowNum, message: 'No access to the linked task' })
        continue
      }
      const existing = mapped.subtask_code
        ? await get<Record<string, unknown>>(`SELECT * FROM subtasks WHERE deleted_at IS NULL AND subtask_code = ? LIMIT 1`, [mapped.subtask_code])
        : mapped.kissflow_id
          ? await get<Record<string, unknown>>(`SELECT * FROM subtasks WHERE deleted_at IS NULL AND kissflow_id = ? LIMIT 1`, [mapped.kissflow_id])
          : undefined
      if (existing && !vis.unrestricted && !subtaskRowVisible(vis, existing)) {
        summary.skipped += 1
        summary.errors.push({ row: rowNum, message: 'No access to update this subtask' })
        continue
      }
      let body: Record<string, unknown> = { ...mapped }
      delete body.task_code
      delete body.task_name
      delete body.assigned_to_email
      if (task) body.task_id = Number(task.id)
      const assignee = await resolvePerson(mapped.assigned_to_email || mapped.assigned_to_name)
      if (assignee.id) body.assigned_to_employee_id = assignee.id
      if (assignee.name) body.assigned_to_name = assignee.name
      body = existing ? body : await applyCreateDefaults('subtask', body, user)
      if (!existing) body = await prepareCreateBody('subtask', body, 'import')
      if (blank(body.status)) body.status = 'Open'
      const meta = await resolveAssignmentMeta('subtask', body)
      body = { ...body, ...meta.extra }
      if (existing) {
        const id = await upsert('subtasks', SUBTASK_WRITE, body, Number(existing.id), user?.id)
        await auditImport('subtask', existing, id, user)
        summary.updated += 1
      } else {
        const id = await upsert('subtasks', SUBTASK_WRITE, body, undefined, user?.id)
        await auditImport('subtask', undefined, id, user)
        summary.created += 1
      }
    } catch (e) {
      summary.skipped += 1
      summary.errors.push({ row: rowNum, message: e instanceof Error ? e.message : 'Import failed' })
    }
  }
  return summary
}

export function templateCsv(kind: RecordImportKind) {
  if (kind === 'project') return csvTemplate(PROJECT_TEMPLATE)
  if (kind === 'task') return csvTemplate(TASK_TEMPLATE)
  return csvTemplate(SUBTASK_TEMPLATE)
}

export async function importRecordsFromFile(kind: RecordImportKind, filePath: string, user?: AuthUser) {
  const rows = readSpreadsheetRows(filePath)
  if (kind === 'project') return importProjects(rows, user)
  if (kind === 'task') return importTasks(rows, user)
  return importSubtasks(rows, user)
}
