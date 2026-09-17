export const LEADERSHIP_ROLES = ['Project Manager', 'CTO', 'CEO', 'MD', 'Business Head'] as const
export const EMPLOYEE_ROLES = ['Employee', 'Viewer'] as const

export function normalizeRoles(user: { roles?: unknown; groups?: unknown; role?: unknown } | null | undefined) {
  const raw = [
    ...(Array.isArray(user?.roles) ? user.roles : []),
    ...(Array.isArray(user?.groups) ? user.groups : []),
    user?.role,
  ]
  return raw.map((r) => String(r || '').trim()).filter(Boolean)
}

export function primaryRole(user: { roles?: unknown; groups?: unknown; role?: unknown } | null | undefined, isAdmin = false) {
  const roles = normalizeRoles(user)
  if (roles.some((r) => r === 'Superusers' || r === 'Admin')) return roles.find((r) => r === 'Admin' || r === 'Superusers') || 'Admin'
  const emp = roles.find((r) => (EMPLOYEE_ROLES as readonly string[]).includes(r))
  if (emp) return emp
  const lead = roles.find((r) => (LEADERSHIP_ROLES as readonly string[]).includes(r))
  if (lead) return lead
  if (isAdmin) return 'Admin'
  return roles[0] || 'Employee'
}

export function isLeadershipRole(roles: string[]) {
  return roles.some((r) => (LEADERSHIP_ROLES as readonly string[]).includes(r))
}

export function isEmployeeRole(roles: string[], isAdmin = false, isLeadership = false) {
  if (isAdmin) return false
  if (roles.some((r) => (EMPLOYEE_ROLES as readonly string[]).includes(r))) return true
  if (isLeadership) return false
  return roles.length === 0
}

export function homePathForRole(opts: { isAdmin: boolean; isLeadership: boolean; isEmployee: boolean }) {
  if (opts.isEmployee) return '/hub/projects'
  return '/'
}
