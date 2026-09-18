import { AsyncLocalStorage } from 'node:async_hooks'
import { all, get, run, now } from '../db/index.js'

export type AuditStore = {
  ip?: string
  userAgent?: string
  method?: string
  path?: string
  logged?: boolean
}

export const auditStore = new AsyncLocalStorage<AuditStore>()

export type ActionLogInput = {
  userId?: number | null
  actionType: string
  itemType?: string | null
  itemId?: number | null
  targetType?: string | null
  targetId?: number | null
  locationId?: number | null
  note?: string | null
  meta?: unknown
}

function mergeMeta(opts: ActionLogInput): Record<string, unknown> | null {
  const ctx = auditStore.getStore()
  const base: Record<string, unknown> = {}
  if (opts.meta && typeof opts.meta === 'object' && !Array.isArray(opts.meta)) {
    Object.assign(base, opts.meta)
  } else if (opts.meta) {
    base.value = opts.meta
  }
  if (ctx) {
    ctx.logged = true
    if (ctx.ip && base.ip == null) base.ip = ctx.ip
    if (ctx.userAgent && base.userAgent == null) base.userAgent = ctx.userAgent
    if (ctx.method && base.method == null) base.method = ctx.method
    if (ctx.path && base.resource == null) base.resource = ctx.path
  }
  return Object.keys(base).length ? base : null
}

export async function logAction(opts: ActionLogInput) {
  const ts = now()
  const meta = mergeMeta(opts)
  const ctx = auditStore.getStore()
  const ip = ctx?.ip || (meta && typeof meta.ip === 'string' ? meta.ip : null)
  const userAgent = ctx?.userAgent || (meta && typeof meta.userAgent === 'string' ? meta.userAgent : null)
  try {
    await run(`
      INSERT INTO action_logs (
        user_id, action_type, target_id, target_type, item_id, item_type,
        location_id, note, log_meta, ip_address, user_agent, action_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      opts.userId ?? null,
      opts.actionType,
      opts.targetId ?? null,
      opts.targetType ?? null,
      opts.itemId ?? null,
      opts.itemType ?? null,
      opts.locationId ?? null,
      opts.note ?? null,
      meta ? JSON.stringify(meta) : null,
      ip || null,
      userAgent ? String(userAgent).slice(0, 255) : null,
      ts,
      ts,
      ts,
    ])
  } catch (err) {
    console.error('action_logs insert failed:', err instanceof Error ? err.message : err)
  }
}

function parseMeta(raw: unknown) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw))
  } catch {
    return null
  }
}

export async function listActionLogs(q: {
  action?: string
  itemType?: string
  userId?: number
  search?: string
  page?: number
  limit?: number
}) {
  const where = ['a.deleted_at IS NULL']
  const params: unknown[] = []
  if (q.action) {
    where.push('a.action_type = ?')
    params.push(q.action)
  }
  if (q.itemType) {
    where.push('a.item_type = ?')
    params.push(q.itemType)
  }
  if (q.userId) {
    where.push('a.user_id = ?')
    params.push(Number(q.userId))
  }
  if (q.search?.trim()) {
    const like = `%${q.search.trim()}%`
    where.push(`(
      IFNULL(u.email,'') LIKE ?
      OR IFNULL(u.username,'') LIKE ?
      OR TRIM(CONCAT(IFNULL(u.first_name,''),' ',IFNULL(u.last_name,''))) LIKE ?
      OR IFNULL(a.action_type,'') LIKE ?
      OR IFNULL(a.item_type,'') LIKE ?
      OR IFNULL(a.note,'') LIKE ?
      OR CAST(IFNULL(a.log_meta,'') AS CHAR) LIKE ?
    )`)
    params.push(like, like, like, like, like, like, like)
  }

  const limit = Math.min(Math.max(Number(q.limit) || 40, 1), 100)
  const page = Math.max(Number(q.page) || 1, 1)
  const offset = (page - 1) * limit
  const whereSql = `WHERE ${where.join(' AND ')}`

  const totalRow = await get<{ c: number }>(
    `SELECT COUNT(*) as c
     FROM action_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereSql}`,
    params,
  )
  const rows = await all<Record<string, unknown>>(`
    SELECT
      a.id, a.user_id, a.action_type, a.item_type, a.item_id, a.target_type, a.target_id,
      a.note, a.log_meta, a.ip_address, a.user_agent, a.action_date, a.created_at,
      u.email AS user_email, u.username AS user_username,
      TRIM(CONCAT(IFNULL(u.first_name,''),' ',IFNULL(u.last_name,''))) AS user_name
    FROM action_logs a
    LEFT JOIN users u ON u.id = a.user_id
    ${whereSql}
    ORDER BY a.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `, params)

  return {
    rows: rows.map((r) => {
      const meta = parseMeta(r.log_meta) as Record<string, unknown> | null
      return {
        id: r.id,
        userId: r.user_id,
        userEmail: r.user_email || '',
        userName: String(r.user_name || '').trim() || r.user_username || '',
        action: r.action_type,
        itemType: r.item_type || '',
        itemId: r.item_id,
        note: r.note || '',
        ipAddress: r.ip_address || meta?.ip || '',
        userAgent: r.user_agent || meta?.userAgent || '',
        resource: meta?.resource || '',
        method: meta?.method || '',
        meta,
        createdAt: r.created_at || r.action_date,
      }
    }),
    total: Number(totalRow?.c || 0),
    page,
    limit,
  }
}
