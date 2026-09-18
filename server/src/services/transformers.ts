import { all, get } from '../db/index.js'
import { nest } from '../utils/response.js'
import { parsePerms } from './permissions.js'
import { loadEmployeeProfile } from './employeeProfile.js'

export async function transformUser(id: number, opts?: { includeDeleted?: boolean }) {
  const deletedClause = opts?.includeDeleted ? '' : ' AND u.deleted_at IS NULL'
  const u = await get<Record<string, unknown>>(`
    SELECT u.*, c.name as company_name, l.name as location_name, d.name as department_name
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    LEFT JOIN locations l ON l.id = u.location_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.id = ?${deletedClause}
  `, [id])
  if (!u) return null
  const perms = parsePerms(u.permissions)
  const groups = await all<{ name: string }>(`
    SELECT g.name
    FROM permission_groups g
    INNER JOIN users_groups ug ON ug.group_id = g.id
    WHERE ug.user_id = ?
    ORDER BY g.name ASC
  `, [id])
  const roles = groups.map((g) => String(g.name || '')).filter(Boolean)
  const employee = await loadEmployeeProfile({
    employee_num: u.employee_num != null ? String(u.employee_num) : null,
    email: u.email != null ? String(u.email) : null,
    username: u.username != null ? String(u.username) : null,
  })
  return {
    id: u.id,
    avatar: null,
    name: `${u.first_name} ${u.last_name}`.trim(),
    first_name: u.first_name,
    last_name: u.last_name,
    username: u.username,
    email: u.email,
    employee_num: u.employee_num,
    jobtitle: u.jobtitle,
    phone: u.phone,
    notes: u.notes,
    activated: Boolean(u.activated),
    deleted: Boolean(u.deleted_at),
    company: nest(u.company_id as number, u.company_name as string),
    location: nest(u.location_id as number, u.location_name as string),
    department: nest(u.department_id as number, u.department_name as string),
    employee,
    permissions: perms,
    roles,
    groups: roles,
    role: roles[0] || (perms.superuser || perms.admin ? 'Admin' : ''),
    available_actions: { update: !u.deleted_at, delete: !u.deleted_at },
  }
}
