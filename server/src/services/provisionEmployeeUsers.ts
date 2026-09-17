import bcrypt from 'bcryptjs'
import { all, get, run, now } from '../db/index.js'
import { ACTIVE_EMPLOYEE_SQL } from './employeeStatus.js'
import { employeePerms, ensureDefaultRoles, parsePerms, isTruthyPerm } from './permissions.js'

export const DEFAULT_EMPLOYEE_PASSWORD = 'Welcome@2026'

const PROTECTED_ROLES = new Set([
  'Superusers',
  'Admin',
  'Project Manager',
  'CTO',
  'CEO',
  'MD',
  'Business Head',
])

export type ProvisionUsersSummary = {
  total_active: number
  created: number
  linked: number
  skipped: number
}

type EmpRow = {
  id: number
  employee_code: string
  first_name: string | null
  last_name: string | null
  email: string | null
  personal_email: string | null
  mobile: string | null
  work_mobile: string | null
  designation: string | null
}

type UserRow = {
  id: number
  username: string
  email: string | null
  employee_num: string | null
  permissions: unknown
}

function asEmail(v: unknown) {
  const s = String(v || '').trim()
  return s.includes('@') ? s : ''
}

function pickEmail(emp: EmpRow) {
  return asEmail(emp.email) || asEmail(emp.personal_email)
}

function isProtectedUser(user: UserRow, roleNames: string[]) {
  const perms = parsePerms(user.permissions)
  if (isTruthyPerm(perms.superuser) || isTruthyPerm(perms.admin)) return true
  return roleNames.some((n) => PROTECTED_ROLES.has(n))
}

async function uniqueUsername(base: string, taken: Set<string>) {
  const root = (base || 'user').trim().slice(0, 90) || 'user'
  let next = root
  let n = 2
  while (taken.has(next.toLowerCase())) {
    next = `${root}-${n}`.slice(0, 100)
    n += 1
  }
  taken.add(next.toLowerCase())
  return next
}

/**
 * Create app users for every active employee.
 * Default password is Welcome@2026. Does not send email.
 */
export async function provisionActiveEmployeeUsers(): Promise<ProvisionUsersSummary> {
  await ensureDefaultRoles()
  const role = await get<{ id: number }>(`SELECT id FROM permission_groups WHERE name = 'Employee' LIMIT 1`)
  if (!role) throw new Error('Employee role is missing')

  const emps = await all<EmpRow>(`
    SELECT id, employee_code, first_name, last_name, email, personal_email, mobile, work_mobile, designation
    FROM employees
    WHERE deleted_at IS NULL AND ${ACTIVE_EMPLOYEE_SQL}
    ORDER BY id ASC
  `)
  const users = await all<UserRow>(`
    SELECT id, username, email, employee_num, permissions
    FROM users
    WHERE deleted_at IS NULL
  `)
  const groupRows = await all<{ user_id: number; name: string }>(`
    SELECT ug.user_id, g.name
    FROM users_groups ug
    INNER JOIN permission_groups g ON g.id = ug.group_id
  `)
  const rolesByUser = new Map<number, string[]>()
  for (const row of groupRows) {
    const list = rolesByUser.get(Number(row.user_id)) || []
    list.push(String(row.name))
    rolesByUser.set(Number(row.user_id), list)
  }

  const byCode = new Map<string, UserRow>()
  const byEmail = new Map<string, UserRow>()
  const takenNames = new Set<string>()
  for (const u of users) {
    takenNames.add(String(u.username || '').toLowerCase())
    const code = String(u.employee_num || '').trim().toLowerCase()
    if (code) byCode.set(code, u)
    const email = asEmail(u.email).toLowerCase()
    if (email) byEmail.set(email, u)
  }

  const hash = bcrypt.hashSync(DEFAULT_EMPLOYEE_PASSWORD, 10)
  const permsJson = JSON.stringify(employeePerms())
  const ts = now()
  const summary: ProvisionUsersSummary = {
    total_active: emps.length,
    created: 0,
    linked: 0,
    skipped: 0,
  }

  for (const emp of emps) {
    const code = String(emp.employee_code || '').trim()
    if (!code) {
      summary.skipped += 1
      continue
    }
    const email = pickEmail(emp)
    const existing = byCode.get(code.toLowerCase())
      || (email ? byEmail.get(email.toLowerCase()) : undefined)

    if (existing) {
      if (isProtectedUser(existing, rolesByUser.get(existing.id) || [])) {
        summary.skipped += 1
        continue
      }
      if (!String(existing.employee_num || '').trim()) {
        await run(`UPDATE users SET employee_num = ?, updated_at = ? WHERE id = ?`, [code, ts, existing.id])
        existing.employee_num = code
        byCode.set(code.toLowerCase(), existing)
      }
      const names = rolesByUser.get(existing.id) || []
      if (!names.includes('Employee')) {
        await run(`INSERT IGNORE INTO users_groups (user_id, group_id) VALUES (?, ?)`, [existing.id, role.id])
        names.push('Employee')
        rolesByUser.set(existing.id, names)
      }
      summary.linked += 1
      continue
    }

    const username = await uniqueUsername(code, takenNames)
    const first = String(emp.first_name || 'Employee').trim() || 'Employee'
    const last = String(emp.last_name || '').trim()
    const phone = String(emp.work_mobile || emp.mobile || '').trim() || null
    const jobtitle = String(emp.designation || '').trim() || null
    const info = await run(
      `INSERT INTO users
        (employee_num, first_name, last_name, username, email, password, phone, jobtitle, activated, permissions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [code, first, last, username, email || null, hash, phone, jobtitle, permsJson, ts, ts],
    )
    const id = Number(info.insertId)
    await run(`INSERT INTO users_groups (user_id, group_id) VALUES (?, ?)`, [id, role.id])
    const created: UserRow = {
      id,
      username,
      email: email || null,
      employee_num: code,
      permissions: permsJson,
    }
    byCode.set(code.toLowerCase(), created)
    if (email) byEmail.set(email.toLowerCase(), created)
    rolesByUser.set(id, ['Employee'])
    summary.created += 1
  }

  return summary
}
