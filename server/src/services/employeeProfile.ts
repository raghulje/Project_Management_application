import { get } from '../db/index.js'
import type { AuthUser } from '../middleware/auth.js'

export type EmployeeProfile = {
  id: number
  code: string
  name: string
  email: string
  company: string
  entity: string
  department: string
  location: string
  designation: string
  business_line: string
  l1_name: string
  l1_email: string
  l2_name: string
  l2_email: string
}

type EmpRow = {
  id: number
  employee_code: string
  first_name: string
  last_name: string
  email: string | null
  supervisor_employee_code: string | null
  designation: string | null
  department_name: string | null
  business_line: string | null
  refex_company_name: string | null
  legal_entity_code: string | null
  refex_location: string | null
  office_location: string | null
}

function str(v: unknown) {
  return String(v || '').trim()
}

function personName(row: { first_name?: unknown; last_name?: unknown } | null) {
  if (!row) return ''
  return `${row.first_name || ''} ${row.last_name || ''}`.trim()
}

function emailOf(v: unknown) {
  const s = str(v).toLowerCase()
  return s.includes('@') ? s : ''
}

async function employeeByCode(code: string) {
  const key = str(code)
  if (!key) return null
  return get<EmpRow>(`
    SELECT id, employee_code, first_name, last_name, email, supervisor_employee_code,
           designation, department_name, business_line, refex_company_name, legal_entity_code,
           refex_location, office_location
    FROM employees
    WHERE deleted_at IS NULL AND LOWER(employee_code) = LOWER(?)
    LIMIT 1
  `, [key])
}

function toProfile(row: EmpRow, l1: EmpRow | null, l2: EmpRow | null): EmployeeProfile {
  return {
    id: Number(row.id),
    code: str(row.employee_code),
    name: personName(row),
    email: emailOf(row.email),
    company: str(row.refex_company_name),
    entity: str(row.legal_entity_code),
    department: str(row.department_name),
    location: str(row.refex_location || row.office_location),
    designation: str(row.designation),
    business_line: str(row.business_line),
    l1_name: personName(l1),
    l1_email: emailOf(l1?.email),
    l2_name: personName(l2),
    l2_email: emailOf(l2?.email),
  }
}

export async function loadEmployeeProfile(user: {
  employee_num?: string | null
  email?: string | null
  username?: string | null
} | null | undefined): Promise<EmployeeProfile | null> {
  if (!user) return null
  const code = str(user.employee_num || user.username)
  const email = emailOf(user.email)
  const row = await get<EmpRow>(`
    SELECT id, employee_code, first_name, last_name, email, supervisor_employee_code,
           designation, department_name, business_line, refex_company_name, legal_entity_code,
           refex_location, office_location
    FROM employees
    WHERE deleted_at IS NULL AND (
      (? <> '' AND LOWER(employee_code) = LOWER(?))
      OR (? <> '' AND email IS NOT NULL AND LOWER(email) = ?)
    )
    ORDER BY CASE
      WHEN ? <> '' AND LOWER(employee_code) = LOWER(?) THEN 0
      ELSE 1
    END, id ASC
    LIMIT 1
  `, [code, code, email, email, code, code])
  if (!row) return null
  const l1 = row.supervisor_employee_code ? (await employeeByCode(String(row.supervisor_employee_code)) ?? null) : null
  const l2 = l1?.supervisor_employee_code ? (await employeeByCode(String(l1.supervisor_employee_code)) ?? null) : null
  return toProfile(row, l1, l2)
}

function blank(v: unknown) {
  return v == null || String(v).trim() === ''
}

function fill(body: Record<string, unknown>, key: string, value: unknown) {
  if (blank(body[key]) && !blank(value)) body[key] = value
}

/** Prefer a readable company name when the legal entity is only a short code. */
export function displayEntity(profile: EmployeeProfile) {
  const entity = str(profile.entity)
  const company = str(profile.company)
  if (entity && (entity.includes(' ') || entity.length >= 8)) return entity
  return company || entity
}

export async function applyCreateDefaults(
  kind: 'project' | 'task' | 'subtask',
  body: Record<string, unknown>,
  user: AuthUser | undefined,
) {
  const next = { ...body }
  const profile = await loadEmployeeProfile(user)
  const actor = `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
  const name = profile?.name || actor
  const email = profile?.email || emailOf(user?.email)

  if (kind === 'project') {
    fill(next, 'company_name', profile?.company)
    fill(next, 'entity', profile ? displayEntity(profile) : '')
    fill(next, 'requester_name', name)
    fill(next, 'assignee_name', name)
    fill(next, 'project_owner_name', name)
    fill(next, 'business', profile?.business_line)
    fill(next, 'l1_manager_email', profile?.l1_email)
    fill(next, 'l2_manager_email', profile?.l2_email)
    if (blank(next.company_id) && profile?.company) {
      const co = await get<{ id: number }>(`
        SELECT id FROM companies
        WHERE deleted_at IS NULL AND LOWER(TRIM(name)) = LOWER(?)
        LIMIT 1
      `, [profile.company])
      if (co) next.company_id = co.id
    }
  }

  if (kind === 'task') {
    if (blank(next.entity)) {
      if (next.project_id) {
        const project = await get<{ company_name: string | null; entity: string | null }>(`
          SELECT company_name, entity FROM projects WHERE id = ? AND deleted_at IS NULL
        `, [Number(next.project_id)])
        fill(next, 'entity', project?.company_name || project?.entity || profile?.company || (profile ? displayEntity(profile) : ''))
      } else {
        fill(next, 'entity', profile?.company || (profile ? displayEntity(profile) : ''))
      }
    }
    fill(next, 'assigned_to_name', name)
    fill(next, 'created_by_name', name)
    fill(next, 'created_by_email', email)
    fill(next, 'l1_manager_email', profile?.l1_email)
    fill(next, 'l2_manager_email', profile?.l2_email)
  }

  if (kind === 'subtask') {
    fill(next, 'assigned_to_name', name)
    fill(next, 'created_by_name', name)
    fill(next, 'l1_manager_email', profile?.l1_email)
    fill(next, 'l2_manager_email', profile?.l2_email)
  }

  return next
}
