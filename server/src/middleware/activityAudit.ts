import type { NextFunction, Request, Response } from 'express'
import { auditStore, logAction } from '../services/actionLog.js'

const SKIP_PREFIXES = [
  '/status',
  '/login',
  '/user',
  '/dashboard/portfolio',
  '/dashboard/visibility',
  '/dashboard/charts',
  '/activity/files',
]

function actionFromMethod(method: string) {
  switch (method) {
    case 'POST':
      return 'create'
    case 'PUT':
    case 'PATCH':
      return 'update'
    case 'DELETE':
      return 'delete'
    default:
      return 'update'
  }
}

function inferItem(path: string, req: Request) {
  const map: Record<string, string> = {
    projects: 'project',
    tasks: 'task',
    subtasks: 'subtask',
    users: 'user',
    employees: 'employee',
    companies: 'company',
    departments: 'department',
    locations: 'location',
    groups: 'group',
  }
  const parts = path.split('/').filter(Boolean)
  let itemType: string | null = null
  let itemId: number | null = null
  for (let i = 0; i < parts.length; i += 1) {
    const mapped = map[parts[i]]
    if (mapped) {
      itemType = mapped
      const next = Number(parts[i + 1])
      if (Number.isFinite(next) && next > 0) itemId = next
    }
  }
  const paramId = Number(req.params?.id || req.body?.id || 0)
  if (!itemId && Number.isFinite(paramId) && paramId > 0) itemId = paramId
  return { itemType, itemId }
}

function shouldSkip(path: string) {
  return SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))
}

/** Capture IP / UA / path for this request so logAction() can attach them. */
export function attachAuditContext(req: Request, _res: Response, next: NextFunction) {
  const raw = String(req.originalUrl || req.url || '').split('?')[0]
  const path = raw.replace(/^\/api\/v1/, '') || raw
  const store: import('../services/actionLog.js').AuditStore = {
    ip: String(req.ip || req.socket?.remoteAddress || ''),
    userAgent: String(req.get('user-agent') || '').slice(0, 500),
    method: req.method,
    path,
    logged: false,
  }
  auditStore.run(store, () => next())
}

/** After a successful write, log it if the route did not already call logAction(). */
export function auditUserActivity(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next()
  const path = String(req.originalUrl || req.url || '').split('?')[0].replace(/^\/api\/v1/, '')
  if (shouldSkip(path)) return next()
  const store = auditStore.getStore()

  res.on('finish', () => {
    if (res.statusCode >= 400) return
    if (store?.logged) return
    const user = req.user
    if (!user?.id) return
    const { itemType, itemId } = inferItem(path, req)
    void logAction({
      userId: Number(user.id),
      actionType: actionFromMethod(req.method),
      itemType,
      itemId,
      note: `${req.method} ${path}`.slice(0, 500),
      meta: {
        statusCode: res.statusCode,
        ip: store?.ip,
        userAgent: store?.userAgent,
        method: store?.method || req.method,
        resource: store?.path || path,
      },
    })
  })

  next()
}
