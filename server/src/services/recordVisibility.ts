import { all, get } from '../db/index.js'
import { hasPermission, LEADERSHIP_ROLES } from './permissions.js'
import type { AuthUser } from '../middleware/auth.js'

export type OrgPerson = {
  employee_id: number
  employee_code: string
  name: string
  email: string
  designation: string
  company: string
  entity: string
}

export type VisibilityScope = {
  unrestricted: boolean
  is_manager: boolean
  user_id: number | null
  self: OrgPerson | null
  team: OrgPerson[]
  names: string[]
  emails: string[]
  ids: number[]
  codes: string[]
}

function norm(v: unknown) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function emailOf(v: unknown) {
  const s = String(v || '').trim().toLowerCase()
  return s.includes('@') ? s : ''
}

function personName(row: { first_name?: unknown; last_name?: unknown }) {
  return `${row.first_name || ''} ${row.last_name || ''}`.trim()
}

type EmpRow = {
  id: number
  employee_code: string
  first_name: string
  last_name: string
  email: string | null
  supervisor_employee_code: string | null
  designation: string | null
  refex_company_name: string | null
  legal_entity_code: string | null
}

function toOrgPerson(row: EmpRow): OrgPerson {
  return {
    employee_id: Number(row.id),
    employee_code: String(row.employee_code || ''),
    name: personName(row),
    email: emailOf(row.email),
    designation: String(row.designation || ''),
    company: String(row.refex_company_name || ''),
    entity: String(row.legal_entity_code || ''),
  }
}

async function userRoleNames(userId: number) {
  const rows = await all<{ name: string }>(`
    SELECT g.name
    FROM permission_groups g
    INNER JOIN users_groups ug ON ug.group_id = g.id
    WHERE ug.user_id = ?
  `, [userId])
  return rows.map((r) => String(r.name || ''))
}

function isEmployeeScoped(roles: string[]) {
  return roles.some((r) => r === 'Employee' || r === 'Viewer')
}

function isUnrestricted(user: AuthUser | undefined, roles: string[]) {
  if (!user) return true
  if (hasPermission(user.permissions, 'superuser') || hasPermission(user.permissions, 'admin')) return true
  if (roles.some((r) => r === 'Superusers' || r === 'Admin')) return true
  // Employee / Viewer always see own (and org-tree) work, even if a leadership group is leftover.
  if (isEmployeeScoped(roles)) return false
  return roles.some((r) => (LEADERSHIP_ROLES as readonly string[]).includes(r))
}

function collectDescendants(rootCode: string, children: Map<string, EmpRow[]>) {
  const out: EmpRow[] = []
  const seen = new Set<string>()
  const queue = [rootCode]
  seen.add(rootCode.toLowerCase())
  while (queue.length) {
    const code = queue.shift() as string
    const kids = children.get(code.toLowerCase()) || []
    for (const kid of kids) {
      const next = String(kid.employee_code || '').trim()
      const key = next.toLowerCase()
      if (!next || seen.has(key)) continue
      seen.add(key)
      out.push(kid)
      queue.push(next)
    }
  }
  return out
}

export async function resolveVisibility(user: AuthUser | undefined): Promise<VisibilityScope> {
  const empty: VisibilityScope = {
    unrestricted: !user,
    is_manager: false,
    user_id: user?.id ?? null,
    self: null,
    team: [],
    names: [],
    emails: [],
    ids: [],
    codes: [],
  }
  if (!user) return empty

  const roles = await userRoleNames(user.id)
  if (isUnrestricted(user, roles)) {
    return { ...empty, unrestricted: true, user_id: user.id }
  }

  const emps = await all<EmpRow>(`
    SELECT id, employee_code, first_name, last_name, email, supervisor_employee_code,
           designation, refex_company_name, legal_entity_code
    FROM employees
    WHERE deleted_at IS NULL
  `)
  const byCode = new Map<string, EmpRow>()
  const byEmail = new Map<string, EmpRow>()
  const children = new Map<string, EmpRow[]>()
  for (const emp of emps) {
    const code = String(emp.employee_code || '').trim()
    if (code) byCode.set(code.toLowerCase(), emp)
    const em = emailOf(emp.email)
    if (em) byEmail.set(em, emp)
    const boss = String(emp.supervisor_employee_code || '').trim().toLowerCase()
    if (boss) {
      const list = children.get(boss) || []
      list.push(emp)
      children.set(boss, list)
    }
  }

  const self = (user.employee_num && byCode.get(String(user.employee_num).trim().toLowerCase()))
    || (emailOf(user.email) && byEmail.get(emailOf(user.email)))
    || null

  const team = self ? collectDescendants(String(self.employee_code), children).map(toOrgPerson) : []
  const people = [self ? toOrgPerson(self) : null, ...team].filter(Boolean) as OrgPerson[]

  const names = new Set<string>()
  const emails = new Set<string>()
  const ids: number[] = []
  const codes = new Set<string>()
  const selfName = `${user.first_name || ''} ${user.last_name || ''}`.trim()
  if (selfName) names.add(norm(selfName))
  if (emailOf(user.email)) emails.add(emailOf(user.email))
  if (user.employee_num) codes.add(String(user.employee_num).trim().toLowerCase())

  for (const p of people) {
    if (p.name) names.add(norm(p.name))
    if (p.email) emails.add(p.email)
    if (p.employee_id) ids.push(p.employee_id)
    if (p.employee_code) codes.add(p.employee_code.toLowerCase())
  }

  return {
    unrestricted: false,
    is_manager: team.length > 0,
    user_id: user.id,
    self: self ? toOrgPerson(self) : people[0] || null,
    team,
    names: [...names],
    emails: [...emails],
    ids: [...new Set(ids)],
    codes: [...codes],
  }
}

export function publicVisibility(scope: VisibilityScope) {
  return {
    unrestricted: scope.unrestricted,
    is_manager: scope.is_manager,
    self: scope.self,
    team: scope.team,
    team_count: scope.team.length,
  }
}

function inListSql(column: string, values: Array<string | number>, params: unknown[]) {
  if (!values.length) return ''
  params.push(...values)
  return `${column} IN (${values.map(() => '?').join(',')})`
}

/** SQL fragment: record is owned/assigned/managed by the current user or their reports. */
export function visibilitySql(
  scope: VisibilityScope,
  kind: 'project' | 'task' | 'subtask',
  alias = '',
): { sql: string; params: unknown[] } {
  if (scope.unrestricted) return { sql: '', params: [] }
  const p = alias ? `${alias}.` : ''
  const parts: string[] = []
  const params: unknown[] = []
  if (scope.user_id) {
    parts.push(`${p}created_by_user_id = ?`)
    params.push(scope.user_id)
  }
  const idCols = kind === 'project'
    ? ['project_owner_employee_id', 'business_owner_employee_id', 'sponsor_employee_id', 'project_manager_employee_id', 'developer_employee_id', 'requester_employee_id']
    : ['assigned_to_employee_id']
  const nameCols = kind === 'project'
    ? ['project_owner_name', 'business_owner_name', 'sponsor_name', 'project_manager_name', 'developer_name', 'cos_owner_name', 'requester_name', 'assignee_name']
    : kind === 'task'
      ? ['assigned_to_name', 'secondary_assignee_name', 'created_by_name']
      : ['assigned_to_name', 'created_by_name']
  const emailCols = ['l1_manager_email', 'l2_manager_email']
  if (kind === 'task') emailCols.push('created_by_email')

  for (const col of idCols) {
    const sql = inListSql(`${p}${col}`, scope.ids, params)
    if (sql) parts.push(sql)
  }
  for (const col of nameCols) {
    const sql = inListSql(`LOWER(TRIM(${p}${col}))`, scope.names, params)
    if (sql) parts.push(sql)
  }
  for (const col of emailCols) {
    const sql = inListSql(`LOWER(TRIM(${p}${col}))`, scope.emails, params)
    if (sql) parts.push(sql)
  }
  if (!parts.length) return { sql: ' AND 1=0', params: [] }
  return { sql: ` AND (${parts.join(' OR ')})`, params }
}

function compactName(v: unknown) {
  return norm(v).replace(/[\s.]+/g, '')
}

export function valuesMatchScope(scope: VisibilityScope, values: unknown[]) {
  if (scope.unrestricted) return true
  const names = new Set(scope.names)
  const compact = new Set(scope.names.map(compactName).filter(Boolean))
  const emails = new Set(scope.emails)
  const ids = new Set(scope.ids.map(String))
  for (const raw of values) {
    if (raw == null || raw === '') continue
    const s = String(raw).trim()
    if (!s || s === '—' || /unassigned/i.test(s)) continue
    if (ids.has(s)) return true
    const em = emailOf(s)
    if (em && emails.has(em)) return true
    if (names.has(norm(s))) return true
    const c = compactName(s)
    if (c && compact.has(c)) return true
  }
  return false
}

export function projectRowVisible(scope: VisibilityScope, row: Record<string, unknown>) {
  if (scope.unrestricted) return true
  if (scope.user_id && Number(row.created_by_user_id) === scope.user_id) return true
  return valuesMatchScope(scope, [
    row.project_owner_employee_id, row.business_owner_employee_id, row.sponsor_employee_id,
    row.project_manager_employee_id, row.developer_employee_id, row.requester_employee_id,
    row.project_owner_name, row.business_owner_name, row.sponsor_name, row.project_manager_name,
    row.developer_name, row.cos_owner_name, row.requester_name, row.assignee_name,
    row.l1_manager_email, row.l2_manager_email,
  ])
}

export function taskRowVisible(scope: VisibilityScope, row: Record<string, unknown>) {
  if (scope.unrestricted) return true
  if (scope.user_id && Number(row.created_by_user_id) === scope.user_id) return true
  return valuesMatchScope(scope, [
    row.assigned_to_employee_id, row.assigned_to_name, row.secondary_assignee_name,
    row.created_by_name, row.created_by_email, row.l1_manager_email, row.l2_manager_email,
  ])
}

export function subtaskRowVisible(scope: VisibilityScope, row: Record<string, unknown>) {
  if (scope.unrestricted) return true
  if (scope.user_id && Number(row.created_by_user_id) === scope.user_id) return true
  return valuesMatchScope(scope, [
    row.assigned_to_employee_id, row.assigned_to_name, row.created_by_name,
    row.l1_manager_email, row.l2_manager_email,
  ])
}

export function filterPortfolioByVisibility(
  scope: VisibilityScope,
  data: { projects: Record<string, unknown>[]; tasks: Record<string, unknown>[]; processSubtasks: Record<string, unknown>[] },
) {
  if (scope.unrestricted) return data

  const projectSteward = (p: Record<string, unknown>) => valuesMatchScope(scope, [
    p.ownerId, p.owner, p.ownerEmail,
    p.projectOwnerId, p.projectOwner, p.projectOwnerEmail,
    p.businessOwnerId, p.businessOwner, p.businessOwnerEmail,
    p.sponsorId, p.sponsor, p.sponsorEmail,
    p.cosOwnerId, p.cosOwner, p.cosOwnerEmail,
    p.developerId, p.developer, p.developerEmail,
    p.projectManager, p.requester, p.createdBy, p.createdById, p.createdByEmail,
    p.l1ManagerEmail, p.l2ManagerEmail,
  ])
  const taskAssignee = (t: Record<string, unknown>) => valuesMatchScope(scope, [
    t.assignedToId, t.assignedTo, t.assignedToEmail,
    t.createdBy, t.createdByEmail, t.l1ManagerEmail, t.l2ManagerEmail,
  ])
  const subAssignee = (s: Record<string, unknown>) => valuesMatchScope(scope, [
    s.assignedToId, s.assignedTo, s.assignedToEmail, s.createdBy, s.l1ManagerEmail, s.l2ManagerEmail,
  ])

  const ownedProjects = data.projects.filter(projectSteward)
  const ownedKeys = new Set(ownedProjects.flatMap((p) => [
    String(p.id || ''), String(p.displayId || ''), String(p.dbId || ''),
  ].filter(Boolean)))

  const assignedTasks = data.tasks.filter(taskAssignee)
  const tasksOnOwned = data.tasks.filter((t) => {
    const keys = [String(t.projectId || ''), String(t.projectRef || ''), String(t.projectDbId || '')]
    return keys.some((k) => k && ownedKeys.has(k))
  })
  const visibleTasks = uniqueBy(assignedTasks.concat(tasksOnOwned), (t) => String(t.dbId || t.id))
  const taskKeys = new Set(visibleTasks.flatMap((t) => [
    String(t.taskBusinessId || ''), String(t.id || ''), String(t.dbId || ''), String(t._id || ''),
  ].filter(Boolean)))

  const assignedSubs = data.processSubtasks.filter(subAssignee)
  const subsOnTasks = data.processSubtasks.filter((s) => {
    const parent = String(s.parentTaskBusinessId || s.parentTaskId || '')
    return parent && taskKeys.has(parent)
  })
  const visibleSubs = uniqueBy(assignedSubs.concat(subsOnTasks), (s) => String(s.dbId || s.id))

  const projectKeysFromWork = new Set<string>()
  for (const t of visibleTasks) {
    for (const k of [t.projectId, t.projectRef, t.projectDbId]) {
      if (k) projectKeysFromWork.add(String(k))
    }
  }
  const projectsFromWork = data.projects.filter((p) => (
    projectKeysFromWork.has(String(p.id || ''))
    || projectKeysFromWork.has(String(p.displayId || ''))
    || projectKeysFromWork.has(String(p.dbId || ''))
  ))
  const visibleProjects = uniqueBy(ownedProjects.concat(projectsFromWork), (p) => String(p.dbId || p.id))

  return {
    projects: visibleProjects,
    tasks: visibleTasks,
    processSubtasks: visibleSubs,
  }
}

function uniqueBy<T>(rows: T[], key: (row: T) => string) {
  const seen = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    const k = key(row) || `row-${out.length}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(row)
  }
  return out
}
