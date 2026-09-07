import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { all, get, run, now } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import {
  ensureDefaultRoles,
  hasPermission,
  MODULE_ACTIONS,
  MODULES,
  parsePerms,
  permissionCatalog,
  requirePerm,
  setUserGroups,
  syncUserPermissions,
} from '../services/permissions.js'

export const groupsRouter = Router()

function canReadRoles(req: Request, res: Response, next: NextFunction) {
  const p = req.user?.permissions
  if (
    hasPermission(p, 'settings.view')
    || hasPermission(p, 'people.view')
    || hasPermission(p, 'people.create')
    || hasPermission(p, 'people.edit')
  ) return next()
  return fail(res, 'Forbidden: missing settings.view', 403)
}

groupsRouter.use(async (_req, _res, next) => {
  try { await ensureDefaultRoles() } catch { /* non-fatal */ }
  next()
})

groupsRouter.get('/catalog', canReadRoles, (_req, res) => {
  return okItem(res, {
    modules: MODULES,
    module_actions: MODULE_ACTIONS,
    keys: permissionCatalog(),
  })
})

groupsRouter.get('/', canReadRoles, async (_req, res) => {
  const rows = await all<Record<string, unknown>>(`
    SELECT g.id, g.name, g.permissions, g.created_at, g.updated_at,
      (SELECT COUNT(*) FROM users_groups ug WHERE ug.group_id = g.id) as users_count
    FROM permission_groups g
    ORDER BY g.name ASC
  `)
  return okList(res, rows.map((r) => ({
    id: r.id,
    name: r.name,
    permissions: parsePerms(r.permissions),
    users_count: Number(r.users_count || 0),
    created_at: r.created_at,
    updated_at: r.updated_at,
  })))
})

groupsRouter.get('/:id', canReadRoles, async (req, res) => {
  const id = Number(req.params.id)
  const row = await get<Record<string, unknown>>(`SELECT * FROM permission_groups WHERE id = ?`, [id])
  if (!row) return fail(res, 'Role not found', 404)
  const members = await all(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.username
    FROM users u
    INNER JOIN users_groups ug ON ug.user_id = u.id
    WHERE ug.group_id = ? AND u.deleted_at IS NULL
    ORDER BY u.first_name, u.last_name
  `, [id])
  return okItem(res, {
    id: row.id,
    name: row.name,
    permissions: parsePerms(row.permissions),
    members,
  })
})

groupsRouter.post('/', requirePerm('settings.edit'), async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return fail(res, 'name is required')
  const exists = await get(`SELECT id FROM permission_groups WHERE name = ?`, [name])
  if (exists) return fail(res, 'Role name already exists')
  const perms = typeof req.body?.permissions === 'object' && req.body.permissions ? req.body.permissions : {}
  const ts = now()
  const info = await run(
    `INSERT INTO permission_groups (name, permissions, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [name, JSON.stringify(perms), ts, ts],
  )
  return okMessage(res, 'Role created', { id: Number(info.insertId), name, permissions: perms }, 201)
})

groupsRouter.put('/:id', requirePerm('settings.edit'), async (req, res) => {
  const id = Number(req.params.id)
  const row = await get<{ id: number }>(`SELECT id FROM permission_groups WHERE id = ?`, [id])
  if (!row) return fail(res, 'Role not found', 404)
  const b = req.body || {}
  const sets: string[] = []
  const vals: unknown[] = []
  if (b.name !== undefined) {
    const name = String(b.name).trim()
    if (!name) return fail(res, 'name cannot be empty')
    sets.push('name = ?')
    vals.push(name)
  }
  if (b.permissions !== undefined) {
    sets.push('permissions = ?')
    vals.push(JSON.stringify(b.permissions || {}))
  }
  if (!sets.length) return fail(res, 'No fields')
  vals.push(now(), id)
  await run(`UPDATE permission_groups SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, vals)
  const members = await all<{ user_id: number }>(`SELECT user_id FROM users_groups WHERE group_id = ?`, [id])
  for (const m of members) await syncUserPermissions(m.user_id)
  const updated = await get<Record<string, unknown>>(`SELECT * FROM permission_groups WHERE id = ?`, [id])
  return okMessage(res, 'Role updated', {
    id: updated?.id,
    name: updated?.name,
    permissions: parsePerms(updated?.permissions),
  })
})

groupsRouter.delete('/:id', requirePerm('settings.edit'), async (req, res) => {
  const id = Number(req.params.id)
  const row = await get<{ name: string }>(`SELECT name FROM permission_groups WHERE id = ?`, [id])
  if (!row) return fail(res, 'Role not found', 404)
  if (['Superusers', 'Admin', 'Project Manager', 'CTO', 'CEO', 'MD', 'Business Head', 'Employee', 'Viewer'].includes(String(row.name))) {
    return fail(res, 'Built-in roles cannot be deleted', 422)
  }
  const members = await all<{ user_id: number }>(`SELECT user_id FROM users_groups WHERE group_id = ?`, [id])
  await run(`DELETE FROM users_groups WHERE group_id = ?`, [id])
  await run(`DELETE FROM permission_groups WHERE id = ?`, [id])
  for (const m of members) await syncUserPermissions(m.user_id)
  return okMessage(res, 'Role deleted')
})

groupsRouter.put('/:id/members', requirePerm('settings.edit'), async (req, res) => {
  const id = Number(req.params.id)
  if (!(await get(`SELECT id FROM permission_groups WHERE id = ?`, [id]))) return fail(res, 'Role not found', 404)
  const userIds: number[] = Array.isArray(req.body?.user_ids)
    ? req.body.user_ids.map((x: unknown) => Number(x)).filter((n: number) => n > 0)
    : []
  const current = await all<{ user_id: number }>(`SELECT user_id FROM users_groups WHERE group_id = ?`, [id])
  const currentSet = new Set(current.map((c) => Number(c.user_id)))
  const nextSet = new Set(userIds)
  for (const uid of currentSet) {
    if (!nextSet.has(uid)) {
      await run(`DELETE FROM users_groups WHERE user_id = ? AND group_id = ?`, [uid, id])
      await syncUserPermissions(uid)
    }
  }
  for (const uid of nextSet) {
    if (!currentSet.has(uid)) {
      await run(`INSERT INTO users_groups (user_id, group_id) VALUES (?, ?)`, [uid, id])
      await syncUserPermissions(uid)
    }
  }
  return okMessage(res, 'Members updated')
})

groupsRouter.put('/users/:userId/roles', requirePerm('settings.edit'), async (req, res) => {
  const userId = Number(req.params.userId)
  if (!(await get(`SELECT id FROM users WHERE id = ? AND deleted_at IS NULL`, [userId]))) {
    return fail(res, 'User not found', 404)
  }
  const groupIds = Array.isArray(req.body?.group_ids) ? req.body.group_ids.map(Number) : []
  if (req.body?.group_id != null) groupIds.push(Number(req.body.group_id))
  const perms = await setUserGroups(userId, groupIds)
  return okMessage(res, 'User roles updated', { user_id: userId, permissions: perms, group_ids: groupIds })
})
