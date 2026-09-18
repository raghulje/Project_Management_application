const PRODUCT = 'Project Management'

const EXACT: Record<string, string> = {
  '/': 'Dashboard',
  '/login': 'Sign in',
  '/reports': 'Reports',
  '/dashboard/my-work': 'My work',
  '/hub/projects': 'My projects',
  '/hub/tasks': 'My tasks',
  '/hub/subtasks': 'My subtasks',
  '/approvals': 'Approvals',
  '/projects': 'Projects',
  '/projects/import': 'Import projects',
  '/projects/new': 'New project',
  '/board': 'Board',
  '/tasks': 'Tasks',
  '/tasks/import': 'Import tasks',
  '/tasks/new': 'New task',
  '/subtasks': 'Subtasks',
  '/subtasks/import': 'Import subtasks',
  '/subtasks/new': 'New subtask',
  '/users': 'App users',
  '/employees': 'Employees',
  '/employees/import': 'Import employees',
  '/employees/new': 'New employee',
  '/admin': 'Admin',
  '/settings/roles': 'Roles',
  '/settings/notifications': 'Notifications',
  '/admin/email-logs': 'Notification logs',
  '/companies': 'Companies',
  '/departments': 'Departments',
  '/locations': 'Locations',
}

const PREFIX: Array<[string, string]> = [
  ['/projects/', 'Project'],
  ['/tasks/', 'Task'],
  ['/subtasks/', 'Subtask'],
  ['/employees/', 'Employee'],
]

export function documentTitleForPath(pathname: string) {
  if (EXACT[pathname]) return `${EXACT[pathname]} · ${PRODUCT}`
  const match = PREFIX.find(([prefix]) => pathname.startsWith(prefix))
  if (match) {
    if (pathname.endsWith('/edit')) return `Edit ${match[1].toLowerCase()} · ${PRODUCT}`
    return `${match[1]} · ${PRODUCT}`
  }
  return PRODUCT
}

export function applyDocumentTitle(pathname: string) {
  if (typeof document === 'undefined') return
  document.title = documentTitleForPath(pathname)
}
