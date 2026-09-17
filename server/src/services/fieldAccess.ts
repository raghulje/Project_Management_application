import { all, get, run, now } from '../db/index.js'
import type { AuthUser } from '../middleware/auth.js'
import { actorLabel } from './notify.js'
import { hasPermission, LEADERSHIP_ROLES } from './permissions.js'
import { recordRevision } from './revisions.js'

export type ItemType = 'project' | 'task' | 'subtask'

export const OPEN_FIELDS: Record<ItemType, string[]> = {
  project: ['status', 'rag', 'risk', 'risk_mitigation_details', 'ai_details', 'objectives', 'completion'],
  task: ['status', 'detail', 'root_cause_analysis', 'workflow_status'],
  subtask: ['status', 'summary', 'workflow_status'],
}

export const REQUESTABLE_FIELDS: Record<ItemType, string[]> = {
  project: [
    'name', 'start_date', 'end_date', 'priority', 'assignee_name',
    'project_owner_name', 'project_manager_name', 'business_owner_name', 'sponsor_name',
    'governance_frequency', 'company_name', 'project_type', 'function_type', 'category',
    'tco_efforts', 'vendor_name', 'tech_stack', 'developer_name', 'cos_owner_name',
  ],
  task: [
    'name', 'start_date', 'end_date', 'priority', 'assigned_to_name',
    'secondary_assignee_name', 'project_id', 'task_type', 'entity',
    'is_dependent', 'dependent_on_task_id',
  ],
  subtask: [
    'name', 'start_date', 'end_date', 'priority', 'assigned_to_name', 'task_id',
  ],
}

const BOOL_FIELDS = new Set([
  'ai_usage', 'reports_available', 'integrated_with_tally', 'integrated_with_sap',
  'integrated_with_power_bi', 'brd_available', 'process_document', 'support_available',
  'cb_analysis_available', 'risk_mitigation', 'requires_approval', 'is_dependent',
])

const DATE_FIELDS = new Set(['start_date', 'end_date'])

export const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  start_date: 'Start date',
  end_date: 'End date',
  priority: 'Priority',
  status: 'Status',
  rag: 'RAG',
  risk: 'Risk',
  assignee_name: 'Assignee',
  assigned_to_name: 'Assignee',
  secondary_assignee_name: 'Secondary assignee',
  project_owner_name: 'Project owner',
  project_manager_name: 'Project manager',
  business_owner_name: 'Business owner',
  sponsor_name: 'Sponsor',
  developer_name: 'Developer',
  cos_owner_name: 'COS owner',
  requester_name: 'Requester',
  governance_frequency: 'Governance',
  company_name: 'Company',
  project_type: 'Project type',
  function_type: 'Function type',
  category: 'Category',
  tco_efforts: 'TCO / efforts',
  vendor_name: 'Vendor',
  tech_stack: 'Tech stack',
  project_id: 'Project',
  task_id: 'Parent task',
  task_type: 'Task type',
  entity: 'Entity',
  is_dependent: 'Depends on another task',
  dependent_on_task_id: 'Depends on',
  detail: 'Detail',
  summary: 'Summary',
  objectives: 'Objectives',
  risk_mitigation_details: 'Risk mitigation details',
  ai_details: 'AI details',
  completion: 'Completion',
  root_cause_analysis: 'Root cause analysis',
  workflow_status: 'Workflow status',
}

const TABLE: Record<ItemType, string> = {
  project: 'projects',
  task: 'tasks',
  subtask: 'subtasks',
}

export function fieldLabel(field: string) {
  return FIELD_LABELS[field] || field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function requestableCatalog(itemType: ItemType) {
  return REQUESTABLE_FIELDS[itemType].map((key) => ({ key, label: fieldLabel(key) }))
}

function normName(v: unknown) {
  return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function emailOf(v: unknown) {
  const s = String(v || '').trim().toLowerCase()
  return s.includes('@') ? s : ''
}

function personName(row: { first_name?: string; last_name?: string; username?: string } | null | undefined) {
  if (!row) return ''
  return `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username || ''
}

type EmpRow = {
  id: number
  employee_code: string
  first_name: string
  last_name: string
  email: string | null
  supervisor_employee_code: string | null
}

type UserRow = {
  id: number
  first_name: string
  last_name: string
  username: string
  email: string | null
  employee_num: string | null
  manager_id: number | null
}

export async function findEmployee(opts: {
  employeeId?: number | null
  name?: string | null
  email?: string | null
  employeeCode?: string | null
}): Promise<EmpRow | null> {
  if (opts.employeeId) {
    const row = await get<EmpRow>(`
      SELECT id, employee_code, first_name, last_name, email, supervisor_employee_code
      FROM employees WHERE id = ? AND deleted_at IS NULL
    `, [opts.employeeId])
    if (row) return row
  }
  const email = emailOf(opts.email)
  if (email) {
    const row = await get<EmpRow>(`
      SELECT id, employee_code, first_name, last_name, email, supervisor_employee_code
      FROM employees WHERE deleted_at IS NULL AND LOWER(email) = ? LIMIT 1
    `, [email])
    if (row) return row
  }
  const code = String(opts.employeeCode || '').trim()
  if (code) {
    const row = await get<EmpRow>(`
      SELECT id, employee_code, first_name, last_name, email, supervisor_employee_code
      FROM employees WHERE deleted_at IS NULL AND employee_code = ? LIMIT 1
    `, [code])
    if (row) return row
  }
  const name = normName(opts.name)
  if (name) {
    const row = await get<EmpRow>(`
      SELECT id, employee_code, first_name, last_name, email, supervisor_employee_code
      FROM employees
      WHERE deleted_at IS NULL AND LOWER(TRIM(CONCAT(first_name, ' ', last_name))) = ?
      LIMIT 1
    `, [name])
    if (row) return row
  }
  return null
}

async function findUserByEmailOrCode(email?: string | null, employeeCode?: string | null): Promise<UserRow | null> {
  const em = emailOf(email)
  if (em) {
    const row = await get<UserRow>(`
      SELECT id, first_name, last_name, username, email, employee_num, manager_id
      FROM users WHERE deleted_at IS NULL AND LOWER(email) = ? LIMIT 1
    `, [em])
    if (row) return row
  }
  const code = String(employeeCode || '').trim()
  if (code) {
    const row = await get<UserRow>(`
      SELECT id, first_name, last_name, username, email, employee_num, manager_id
      FROM users WHERE deleted_at IS NULL AND employee_num = ? LIMIT 1
    `, [code])
    if (row) return row
  }
  return null
}

async function loadUserProfile(user: AuthUser) {
  const row = await get<UserRow>(`
    SELECT id, first_name, last_name, username, email, employee_num, manager_id
    FROM users WHERE id = ? AND deleted_at IS NULL
  `, [user.id])
  return row
}

async function userRoleNames(userId: number) {
  const rows = await all<{ name: string }>(`
    SELECT g.name
    FROM permission_groups g
    INNER JOIN users_groups ug ON ug.group_id = g.id
    WHERE ug.user_id = ?
  `, [userId])
  return rows.map((r) => String(r.name || '').trim()).filter(Boolean)
}

function matchesPerson(user: AuthUser, profile: UserRow | null | undefined, emp: EmpRow | null, name: unknown, employeeId: unknown) {
  const full = normName(personName(user))
  const email = emailOf(user.email)
  const code = String(profile?.employee_num || emp?.employee_code || '').trim().toLowerCase()
  const empId = emp?.id != null ? Number(emp.id) : null

  if (employeeId != null && employeeId !== '' && empId != null && Number(employeeId) === empId) return true
  if (employeeId != null && employeeId !== '' && Number(employeeId) === Number(user.id)) return true

  const n = normName(name)
  if (n && full && n === full) return true
  if (email && (n === email || emailOf(name) === email)) return true
  if (code && n === code) return true
  return false
}

function assigneeHints(itemType: ItemType, record: Record<string, unknown>) {
  if (itemType === 'project') {
    return {
      names: [record.assignee_name, record.developer_name],
      employeeId: null as number | null,
    }
  }
  return {
    names: [record.assigned_to_name, record.secondary_assignee_name],
    employeeId: record.assigned_to_employee_id != null ? Number(record.assigned_to_employee_id) : null,
  }
}

export async function isFullEditor(user: AuthUser, itemType: ItemType, record: Record<string, unknown>) {
  if (hasPermission(user.permissions, 'admin') || hasPermission(user.permissions, 'superuser')) return true
  const roles = await userRoleNames(user.id)
  if (roles.some((r) => r === 'Admin' || r === 'Superusers' || (LEADERSHIP_ROLES as readonly string[]).includes(r))) return true
  if (record.created_by_user_id != null && Number(record.created_by_user_id) === Number(user.id)) return true

  const profile = await loadUserProfile(user)
  const full = normName(personName(user))
  const email = emailOf(user.email)
  const owners = [
    record.project_owner_name,
    record.project_manager_name,
  ]
  for (const name of owners) {
    const n = normName(name)
    if (n && full && n === full) return true
    if (email && emailOf(name) === email) return true
  }
  if (itemType === 'project') {
    const emp = await findEmployee({ email: user.email, employeeCode: profile?.employee_num, name: personName(user) })
    if (emp && Number(record.project_owner_employee_id) === Number(emp.id)) return true
    if (emp && Number(record.project_manager_employee_id) === Number(emp.id)) return true
  }
  return false
}

export async function isAssignee(user: AuthUser, itemType: ItemType, record: Record<string, unknown>) {
  const profile = await loadUserProfile(user)
  const emp = await findEmployee({
    email: user.email,
    employeeCode: profile?.employee_num,
    name: personName(user),
  })
  const hints = assigneeHints(itemType, record)
  if (hints.employeeId && matchesPerson(user, profile, emp, null, hints.employeeId)) return true
  for (const name of hints.names) {
    if (name && matchesPerson(user, profile, emp, name, hints.employeeId)) return true
  }
  return false
}

export async function resolveAssignmentMeta(itemType: ItemType, body: Record<string, unknown>) {
  const name = itemType === 'project'
    ? String(body.assignee_name || '')
    : String(body.assigned_to_name || '')
  const employeeId = itemType === 'project' ? null : (body.assigned_to_employee_id != null ? Number(body.assigned_to_employee_id) : null)
  const emp = await findEmployee({ name, employeeId, email: name.includes('@') ? name : null })
  const l1 = await resolveL1FromAssignee(emp, body)
  const out: Record<string, unknown> = {}
  if (itemType !== 'project' && emp?.id && body.assigned_to_employee_id == null) {
    out.assigned_to_employee_id = emp.id
  }
  if (l1?.email && !emailOf(body.l1_manager_email)) {
    out.l1_manager_email = l1.email
  }
  return { employee: emp, l1, extra: out }
}

type L1Info = { email: string; name: string; userId: number | null }

async function resolveL1FromAssignee(emp: EmpRow | null, record: Record<string, unknown>): Promise<L1Info | null> {
  const existing = emailOf(record.l1_manager_email)
  if (existing) {
    const u = await findUserByEmailOrCode(existing, null)
    return { email: existing, name: personName(u) || String(record.l1_manager_email), userId: u?.id ?? null }
  }

  const skip = new Set<string>()
  const assigneeEmail = emailOf(emp?.email)
  if (assigneeEmail) skip.add(assigneeEmail)

  if (emp?.supervisor_employee_code) {
    const boss = await findEmployee({ employeeCode: emp.supervisor_employee_code })
    const em = emailOf(boss?.email)
    if (em && !skip.has(em)) {
      const u = await findUserByEmailOrCode(em, boss?.employee_code)
      return { email: em, name: personName(u) || personName(boss), userId: u?.id ?? null }
    }
  }

  const assigneeUser = await findUserByEmailOrCode(emp?.email, emp?.employee_code)
  if (assigneeUser?.manager_id) {
    const mgr = await get<UserRow>(`
      SELECT id, first_name, last_name, username, email, employee_num, manager_id
      FROM users WHERE id = ? AND deleted_at IS NULL
    `, [assigneeUser.manager_id])
    const em = emailOf(mgr?.email)
    if (em && !skip.has(em)) {
      return { email: em, name: personName(mgr), userId: mgr?.id ?? null }
    }
  }

  for (const key of ['project_manager_name', 'project_owner_name'] as const) {
    const person = String(record[key] || '')
    if (!person) continue
    const found = await findEmployee({ name: person, email: person.includes('@') ? person : null })
    const em = emailOf(found?.email)
    if (em && !skip.has(em)) {
      const u = await findUserByEmailOrCode(em, found?.employee_code)
      return { email: em, name: personName(u) || personName(found) || person, userId: u?.id ?? null }
    }
  }
  return null
}

export async function resolveL1ForRecord(itemType: ItemType, record: Record<string, unknown>) {
  const hints = assigneeHints(itemType, record)
  const emp = await findEmployee({
    employeeId: hints.employeeId,
    name: String(hints.names.find(Boolean) || ''),
  })
  return resolveL1FromAssignee(emp, record)
}

function parseJsonList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
    } catch { return [] }
  }
  return []
}

async function expireStaleGrants() {
  await run(
    `UPDATE field_access_requests SET status = 'expired', updated_at = ? WHERE status = 'granted' AND expires_at IS NOT NULL AND expires_at < ?`,
    [now(), now()],
  )
}

export type PendingRequest = {
  id: number
  fields: string[]
  reason: string
  created_at: string
  status: string
}

export type EditPolicy = {
  mode: 'full' | 'assignee' | 'none'
  open_fields: string[]
  granted_fields: string[]
  requestable_fields: { key: string; label: string }[]
  can_request: boolean
  pending_request: PendingRequest | null
  l1_email: string | null
  l1_name: string | null
  grant_expires_at: string | null
}

export async function grantedFieldsFor(userId: number, itemType: ItemType, itemId: number) {
  await expireStaleGrants()
  const rows = await all<{ granted_fields_json: unknown; fields_json: unknown; expires_at: string | null }>(`
    SELECT granted_fields_json, fields_json, expires_at
    FROM field_access_requests
    WHERE item_type = ? AND item_id = ? AND requested_by_user_id = ? AND status = 'granted'
      AND (expires_at IS NULL OR expires_at >= ?)
  `, [itemType, itemId, userId, now()])
  const set = new Set<string>()
  let latest: string | null = null
  for (const row of rows) {
    for (const f of parseJsonList(row.granted_fields_json).length ? parseJsonList(row.granted_fields_json) : parseJsonList(row.fields_json)) {
      set.add(f)
    }
    if (row.expires_at && (!latest || String(row.expires_at) > latest)) latest = String(row.expires_at)
  }
  return { fields: [...set], expiresAt: latest }
}

export async function pendingRequestFor(userId: number, itemType: ItemType, itemId: number): Promise<PendingRequest | null> {
  const row = await get<{ id: number; fields_json: unknown; reason: string; created_at: string; status: string }>(`
    SELECT id, fields_json, reason, created_at, status
    FROM field_access_requests
    WHERE item_type = ? AND item_id = ? AND requested_by_user_id = ? AND status = 'pending'
    ORDER BY id DESC LIMIT 1
  `, [itemType, itemId, userId])
  if (!row) return null
  return {
    id: Number(row.id),
    fields: parseJsonList(row.fields_json),
    reason: String(row.reason || ''),
    created_at: String(row.created_at || ''),
    status: String(row.status || 'pending'),
  }
}

export async function buildEditPolicy(user: AuthUser, itemType: ItemType, record: Record<string, unknown>): Promise<EditPolicy> {
  const open = OPEN_FIELDS[itemType]
  const catalog = requestableCatalog(itemType)
  const l1 = await resolveL1ForRecord(itemType, record)
  if (await isFullEditor(user, itemType, record)) {
    return {
      mode: 'full',
      open_fields: open,
      granted_fields: [],
      requestable_fields: catalog,
      can_request: false,
      pending_request: null,
      l1_email: l1?.email || emailOf(record.l1_manager_email) || null,
      l1_name: l1?.name || null,
      grant_expires_at: null,
    }
  }
  const assignee = await isAssignee(user, itemType, record)
  const granted = assignee ? await grantedFieldsFor(user.id, itemType, Number(record.id)) : { fields: [] as string[], expiresAt: null }
  const pending = assignee ? await pendingRequestFor(user.id, itemType, Number(record.id)) : null
  return {
    mode: assignee ? 'assignee' : 'none',
    open_fields: open,
    granted_fields: granted.fields,
    requestable_fields: catalog,
    can_request: assignee,
    pending_request: pending,
    l1_email: l1?.email || emailOf(record.l1_manager_email) || null,
    l1_name: l1?.name || null,
    grant_expires_at: granted.expiresAt,
  }
}

export async function attachEditPolicy<T extends Record<string, unknown>>(
  user: AuthUser | undefined,
  itemType: ItemType,
  row: T,
): Promise<T & { edit_policy: EditPolicy | null }> {
  if (!user) return { ...row, edit_policy: null }
  return { ...row, edit_policy: await buildEditPolicy(user, itemType, row) }
}

function normCmp(field: string, value: unknown) {
  if (value == null || value === '' || value === 'null' || value === 'undefined') return ''
  if (BOOL_FIELDS.has(field) || typeof value === 'boolean') {
    if (value === true || value === 1 || value === '1' || value === 'true') return '1'
    if (value === false || value === 0 || value === '0' || value === 'false') return '0'
  }
  if (DATE_FIELDS.has(field)) return String(value).slice(0, 10)
  if (field === 'tech_stack') {
    let raw = value
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw) } catch { /* keep */ }
    }
    const parts = Array.isArray(raw)
      ? raw.map(String)
      : String(raw || '').split(',')
    return parts.map((s) => s.replace(/[\[\]"]/g, '').trim()).filter(Boolean).join(', ')
  }
  if (['tco_efforts', 'hours', 'tat_days', 'aging_days', 'completion', 'project_id', 'task_id', 'dependent_on_task_id'].includes(field)) {
    const n = Number(value)
    if (!Number.isNaN(n) && String(value).trim() !== '') return String(n)
  }
  return String(value).trim()
}

export function valuesEqual(field: string, a: unknown, b: unknown) {
  return normCmp(field, a) === normCmp(field, b)
}

export type WriteFilterOk = { ok: true; body: Record<string, unknown>; unchanged: boolean }
export type WriteFilterErr = { ok: false; status: number; message: string; payload?: unknown }

export async function filterWritableUpdate(opts: {
  user: AuthUser
  itemType: ItemType
  existing: Record<string, unknown>
  body: Record<string, unknown>
  writeFields: readonly string[]
}): Promise<WriteFilterOk | WriteFilterErr> {
  const policy = await buildEditPolicy(opts.user, opts.itemType, opts.existing)
  if (policy.mode === 'none') {
    return { ok: false, status: 403, message: 'You can only update records assigned to you.' }
  }

  const allowed = new Set<string>([
    ...OPEN_FIELDS[opts.itemType],
    ...policy.granted_fields,
  ])
  const full = policy.mode === 'full'
  const changed: string[] = []
  const locked: string[] = []
  const next: Record<string, unknown> = {}

  for (const field of opts.writeFields) {
    if (opts.body[field] === undefined) continue
    if (valuesEqual(field, opts.existing[field], opts.body[field])) continue
    changed.push(field)
    if (!full && !allowed.has(field)) locked.push(field)
    else next[field] = opts.body[field]
  }

  if (locked.length) {
    return {
      ok: false,
      status: 403,
      message: `${locked.map(fieldLabel).join(', ')} ${locked.length === 1 ? 'is' : 'are'} locked. Request access from your L1 to change ${locked.length === 1 ? 'it' : 'them'}.`,
      payload: { locked_fields: locked, can_request: policy.can_request },
    }
  }

  if (!changed.length) return { ok: true, body: {}, unchanged: true }

  const merged = { ...opts.existing, ...next }
  const meta = await resolveAssignmentMeta(opts.itemType, merged)
  Object.assign(next, meta.extra)
  return { ok: true, body: next, unchanged: false }
}

export async function loadItem(itemType: ItemType, itemId: number) {
  const table = TABLE[itemType]
  return get<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`, [itemId])
}

export function recordPath(itemType: ItemType, itemId: number) {
  if (itemType === 'project') return `/projects/${itemId}`
  if (itemType === 'task') return `/tasks/${itemId}`
  return `/subtasks/${itemId}`
}

export async function auditAccess(opts: {
  itemType: ItemType
  itemId: number
  user: AuthUser
  field: 'access_request' | 'access_grant' | 'access_deny'
  from: string
  to: string
}) {
  const label = opts.field === 'access_request'
    ? 'Access request'
    : opts.field === 'access_grant'
      ? 'Access granted'
      : 'Access denied'
  await recordRevision({
    itemType: opts.itemType,
    itemId: opts.itemId,
    user: opts.user,
    changes: [{ field: opts.field, label, from: opts.from, to: opts.to }],
  })
}

export function mapAccessRequest(row: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const fields = parseJsonList(row.fields_json)
  const granted = parseJsonList(row.granted_fields_json)
  const itemType = String(row.item_type) as ItemType
  const itemId = Number(row.item_id)
  return {
    id: Number(row.id),
    item_type: itemType,
    item_id: itemId,
    item_name: row.item_name || extra.item_name || '',
    record_path: recordPath(itemType, itemId),
    fields,
    field_labels: fields.map(fieldLabel),
    granted_fields: granted,
    reason: String(row.reason || ''),
    status: String(row.status || ''),
    requested_by_user_id: Number(row.requested_by_user_id),
    requested_by_name: String(row.requested_by_name || ''),
    requested_by_email: String(row.requested_by_email || ''),
    l1_user_id: row.l1_user_id == null ? null : Number(row.l1_user_id),
    l1_email: String(row.l1_email || ''),
    l1_name: String(row.l1_name || ''),
    decided_by_user_id: row.decided_by_user_id == null ? null : Number(row.decided_by_user_id),
    decided_by_name: String(row.decided_by_name || ''),
    decision_note: String(row.decision_note || ''),
    expires_at: row.expires_at ? String(row.expires_at) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    ...extra,
  }
}

const ITEM_NAME_SQL = `
  CASE r.item_type
    WHEN 'project' THEN (SELECT name FROM projects WHERE id = r.item_id)
    WHEN 'task' THEN (SELECT name FROM tasks WHERE id = r.item_id)
    WHEN 'subtask' THEN (SELECT name FROM subtasks WHERE id = r.item_id)
  END as item_name
`

export async function listInbox(user: AuthUser, status = 'pending') {
  await expireStaleGrants()
  const admin = hasPermission(user.permissions, 'admin') || hasPermission(user.permissions, 'superuser')
  const email = emailOf(user.email)
  const params: unknown[] = []
  let sql = `SELECT r.*, ${ITEM_NAME_SQL} FROM field_access_requests r WHERE 1=1`
  if (status) {
    sql += ' AND r.status = ?'
    params.push(status)
  }
  if (!admin) {
    sql += ' AND (r.l1_user_id = ? OR LOWER(r.l1_email) = ?)'
    params.push(user.id, email || '__none__')
  }
  sql += ' ORDER BY r.id DESC LIMIT 200'
  const rows = await all<Record<string, unknown>>(sql, params)
  return rows.map((r) => mapAccessRequest(r))
}

export async function listMine(user: AuthUser) {
  await expireStaleGrants()
  const rows = await all<Record<string, unknown>>(`
    SELECT r.*, ${ITEM_NAME_SQL}
    FROM field_access_requests r
    WHERE r.requested_by_user_id = ?
    ORDER BY r.id DESC LIMIT 200
  `, [user.id])
  return rows.map((r) => mapAccessRequest(r))
}

export async function inboxCount(user: AuthUser) {
  await expireStaleGrants()
  const admin = hasPermission(user.permissions, 'admin') || hasPermission(user.permissions, 'superuser')
  const email = emailOf(user.email)
  if (admin) {
    const row = await get<{ c: number }>(`SELECT COUNT(*) as c FROM field_access_requests WHERE status = 'pending'`)
    return Number(row?.c || 0)
  }
  const row = await get<{ c: number }>(`
    SELECT COUNT(*) as c FROM field_access_requests
    WHERE status = 'pending' AND (l1_user_id = ? OR LOWER(l1_email) = ?)
  `, [user.id, email || '__none__'])
  return Number(row?.c || 0)
}

export async function createAccessRequest(opts: {
  user: AuthUser
  itemType: ItemType
  itemId: number
  fields: string[]
  reason: string
}) {
  const record = await loadItem(opts.itemType, opts.itemId)
  if (!record) return { ok: false as const, status: 404, message: 'Record not found' }
  const policy = await buildEditPolicy(opts.user, opts.itemType, record)
  if (!policy.can_request) {
    return { ok: false as const, status: 403, message: 'Only the assignee can request access to locked fields.' }
  }

  const allowed = new Set(REQUESTABLE_FIELDS[opts.itemType])
  const fields = [...new Set(opts.fields.map(String).filter((f) => allowed.has(f)))]
  if (!fields.length) return { ok: false as const, status: 400, message: 'Pick at least one locked field to request.' }
  const reason = String(opts.reason || '').trim()
  if (reason.length < 8) return { ok: false as const, status: 400, message: 'Please explain why you need this change (at least 8 characters).' }

  const l1 = await resolveL1ForRecord(opts.itemType, record)
  if (!l1?.email) {
    return { ok: false as const, status: 422, message: 'No L1 manager is on file for this assignee. Ask an admin to set the supervisor in HRMS.' }
  }

  const ts = now()
  const pending = await pendingRequestFor(opts.user.id, opts.itemType, opts.itemId)
  let id = pending?.id || 0
  const merged = pending ? [...new Set([...pending.fields, ...fields])] : fields
  if (pending) {
    await run(
      `UPDATE field_access_requests SET fields_json = ?, reason = ?, l1_user_id = ?, l1_email = ?, l1_name = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(merged), reason, l1.userId, l1.email, l1.name, ts, pending.id],
    )
  } else {
    const info = await run(`
      INSERT INTO field_access_requests (
        item_type, item_id, fields_json, reason, status,
        requested_by_user_id, requested_by_name, requested_by_email,
        l1_user_id, l1_email, l1_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      opts.itemType, opts.itemId, JSON.stringify(merged), reason,
      opts.user.id, actorLabel(opts.user), opts.user.email || '',
      l1.userId, l1.email, l1.name, ts, ts,
    ])
    id = Number(info.insertId)
  }

  await auditAccess({
    itemType: opts.itemType,
    itemId: opts.itemId,
    user: opts.user,
    field: 'access_request',
    from: '—',
    to: `${merged.map(fieldLabel).join(', ')}. Reason: ${reason}`,
  })

  const row = await get<Record<string, unknown>>(`SELECT * FROM field_access_requests WHERE id = ?`, [id])
  const itemName = String(record.name || '')
  return {
    ok: true as const,
    request: mapAccessRequest(row || {}, { item_name: itemName }),
    edit_policy: await buildEditPolicy(opts.user, opts.itemType, record),
    record,
    l1,
  }
}

function canDecide(user: AuthUser, request: Record<string, unknown>) {
  if (hasPermission(user.permissions, 'admin') || hasPermission(user.permissions, 'superuser')) return true
  if (request.l1_user_id != null && Number(request.l1_user_id) === Number(user.id)) return true
  const email = emailOf(user.email)
  if (email && emailOf(request.l1_email) === email) return true
  return false
}

export async function decideAccessRequest(opts: {
  user: AuthUser
  id: number
  decision: 'granted' | 'denied'
  note?: string
  hours?: number
}) {
  await expireStaleGrants()
  const row = await get<Record<string, unknown>>(`SELECT * FROM field_access_requests WHERE id = ?`, [opts.id])
  if (!row) return { ok: false as const, status: 404, message: 'Request not found' }
  if (String(row.status) !== 'pending') return { ok: false as const, status: 409, message: 'This request was already decided.' }
  if (!canDecide(opts.user, row)) return { ok: false as const, status: 403, message: 'Only the L1 manager can decide this request.' }

  const ts = now()
  const hours = Math.min(Math.max(Number(opts.hours) || 48, 1), 168)
  const expires = new Date(Date.now() + hours * 3600 * 1000)
  const expiresAt = opts.decision === 'granted'
    ? expires.toISOString().slice(0, 19).replace('T', ' ')
    : null
  const fields = parseJsonList(row.fields_json)
  await run(`
    UPDATE field_access_requests
    SET status = ?, decided_by_user_id = ?, decided_by_name = ?, decision_note = ?,
        granted_fields_json = ?, expires_at = ?, updated_at = ?
    WHERE id = ?
  `, [
    opts.decision,
    opts.user.id,
    actorLabel(opts.user),
    String(opts.note || '').trim() || null,
    opts.decision === 'granted' ? JSON.stringify(fields) : null,
    expiresAt,
    ts,
    opts.id,
  ])

  const itemType = String(row.item_type) as ItemType
  const itemId = Number(row.item_id)
  await auditAccess({
    itemType,
    itemId,
    user: opts.user,
    field: opts.decision === 'granted' ? 'access_grant' : 'access_deny',
    from: 'pending',
    to: opts.decision === 'granted'
      ? `${fields.map(fieldLabel).join(', ')} until ${expiresAt}`
      : (String(opts.note || '').trim() || 'Denied'),
  })

  const after = await get<Record<string, unknown>>(`SELECT * FROM field_access_requests WHERE id = ?`, [opts.id])
  const record = await loadItem(itemType, itemId)
  return {
    ok: true as const,
    request: mapAccessRequest(after || {}, { item_name: String(record?.name || '') }),
    record,
    itemType,
    itemId,
  }
}

export function isItemType(v: unknown): v is ItemType {
  return v === 'project' || v === 'task' || v === 'subtask'
}
