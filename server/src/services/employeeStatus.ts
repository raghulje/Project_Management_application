import { get } from '../db/index.js'

/** HRMS Active: description "Active" or employment_status code 1. */
export const ACTIVE_EMPLOYEE_SQL = `(
  LOWER(TRIM(COALESCE(employment_status_description, ''))) = 'active'
  OR TRIM(COALESCE(employment_status, '')) IN ('1', 'Active', 'active')
)`

export function isActiveEmployee(row: {
  employment_status?: unknown
  employment_status_description?: unknown
}) {
  const desc = String(row.employment_status_description || '').trim().toLowerCase()
  const code = String(row.employment_status || '').trim().toLowerCase()
  return desc === 'active' || code === '1' || code === 'active'
}

export async function requireActiveEmployee(id: number): Promise<
  { ok: true } | { ok: false; status: number; message: string }
> {
  const emp = await get<{
    id: number
    employment_status: string | null
    employment_status_description: string | null
  }>(
    `SELECT id, employment_status, employment_status_description
     FROM employees WHERE id = ? AND deleted_at IS NULL`,
    [id],
  )
  if (!emp) return { ok: false, status: 404, message: 'Employee not found' }
  if (!isActiveEmployee(emp)) {
    return { ok: false, status: 422, message: 'Only active employees can be assigned' }
  }
  return { ok: true }
}
