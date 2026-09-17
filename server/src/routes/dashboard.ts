import { Router } from 'express'
import { all, get } from '../db/index.js'
import { fail, okItem, okMessage } from '../utils/response.js'
import { buildPortfolio } from '../services/portfolio.js'
import { ACTIVE_EMPLOYEE_SQL } from '../services/employeeStatus.js'
import { syncKissflowPortfolio } from '../services/kissflowImport.js'

export const dashboardRouter = Router()

dashboardRouter.get('/', async (_req, res) => {
  const [projects, tasks, subtasks, employees, employeesActive, employeesInactive, users] = await Promise.all([
    get<{ c: number }>(`SELECT COUNT(*) as c FROM projects WHERE deleted_at IS NULL`),
    get<{ c: number }>(`SELECT COUNT(*) as c FROM tasks WHERE deleted_at IS NULL`),
    get<{ c: number }>(`SELECT COUNT(*) as c FROM subtasks WHERE deleted_at IS NULL`),
    get<{ c: number }>(`SELECT COUNT(*) as c FROM employees WHERE deleted_at IS NULL`),
    get<{ c: number }>(`SELECT COUNT(*) as c FROM employees WHERE deleted_at IS NULL AND ${ACTIVE_EMPLOYEE_SQL}`),
    get<{ c: number }>(`SELECT COUNT(*) as c FROM employees WHERE deleted_at IS NULL AND NOT ${ACTIVE_EMPLOYEE_SQL}`),
    get<{ c: number }>(`SELECT COUNT(*) as c FROM users WHERE deleted_at IS NULL`),
  ])
  const [openProjects, closedProjects, openTasks, doneTasks, overdueProjects, overdueTasks] = await Promise.all([
    get<{ c: number }>(`SELECT COUNT(*) as c FROM projects WHERE deleted_at IS NULL AND status = 'Open'`),
    get<{ c: number }>(`SELECT COUNT(*) as c FROM projects WHERE deleted_at IS NULL AND status = 'Closed'`),
    get<{ c: number }>(`SELECT COUNT(*) as c FROM tasks WHERE deleted_at IS NULL AND status = 'Open'`),
    get<{ c: number }>(`SELECT COUNT(*) as c FROM tasks WHERE deleted_at IS NULL AND status IN ('Completed','Closed')`),
    get<{ c: number }>(`
      SELECT COUNT(*) as c FROM projects
      WHERE deleted_at IS NULL AND status NOT IN ('Closed','Completed','Cancelled')
        AND end_date IS NOT NULL AND end_date < CURDATE()
    `),
    get<{ c: number }>(`
      SELECT COUNT(*) as c FROM tasks
      WHERE deleted_at IS NULL AND status NOT IN ('Completed','Closed','Cancelled','Rejected')
        AND end_date IS NOT NULL AND end_date < CURDATE()
    `),
  ])
  return okItem(res, {
    projects: Number(projects?.c || 0),
    tasks: Number(tasks?.c || 0),
    subtasks: Number(subtasks?.c || 0),
    employees: Number(employees?.c || 0),
    employees_active: Number(employeesActive?.c || 0),
    employees_inactive: Number(employeesInactive?.c || 0),
    users: Number(users?.c || 0),
    open_projects: Number(openProjects?.c || 0),
    closed_projects: Number(closedProjects?.c || 0),
    open_tasks: Number(openTasks?.c || 0),
    done_tasks: Number(doneTasks?.c || 0),
    overdue_projects: Number(overdueProjects?.c || 0),
    overdue_tasks: Number(overdueTasks?.c || 0),
  })
})

dashboardRouter.get('/charts', async (_req, res) => {
  const [status, rag, category, taskStatus] = await Promise.all([
    all<{ label: string; value: number }>(`
      SELECT COALESCE(status,'(blank)') as label, COUNT(*) as value
      FROM projects WHERE deleted_at IS NULL GROUP BY status ORDER BY value DESC
    `),
    all<{ label: string; value: number }>(`
      SELECT COALESCE(rag,'(blank)') as label, COUNT(*) as value
      FROM projects WHERE deleted_at IS NULL GROUP BY rag ORDER BY value DESC
    `),
    all<{ label: string; value: number }>(`
      SELECT COALESCE(category,'(blank)') as label, COUNT(*) as value
      FROM projects WHERE deleted_at IS NULL GROUP BY category ORDER BY value DESC LIMIT 10
    `),
    all<{ label: string; value: number }>(`
      SELECT COALESCE(status,'(blank)') as label, COUNT(*) as value
      FROM tasks WHERE deleted_at IS NULL GROUP BY status ORDER BY value DESC
    `),
  ])
  return okItem(res, { status, rag, category, taskStatus })
})

dashboardRouter.get('/portfolio', async (_req, res) => {
  return okItem(res, await buildPortfolio())
})

/** Same case/process endpoints as ProjectDashboardPage — production first, then development. */
dashboardRouter.post('/kissflow-sync', async (_req, res) => {
  try {
    const result = await syncKissflowPortfolio()
    return okMessage(
      res,
      `Synced ${result.projects} projects, ${result.tasks} tasks, ${result.subtasks} subtasks from ${result.source}`,
      result,
    )
  } catch (err) {
    return fail(res, err instanceof Error ? err.message : 'Kissflow sync failed', 502)
  }
})
