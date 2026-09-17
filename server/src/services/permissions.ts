import type { NextFunction, Request, Response } from 'express'
import { all, get, run, now } from '../db/index.js'
import { fail } from '../utils/response.js'

export const MODULES = [
  'projects',
  'tasks',
  'subtasks',
  'people',
  'reports',
  'settings',
] as const

export type ModuleKey = (typeof MODULES)[number]
export const ACTIONS = ['view', 'create', 'edit', 'delete'] as const
export type ActionKey = (typeof ACTIONS)[number]

export const MODULE_ACTIONS: Record<ModuleKey, ActionKey[]> = {
  projects: ['view', 'create', 'edit', 'delete'],
  tasks: ['view', 'create', 'edit', 'delete'],
  subtasks: ['view', 'create', 'edit', 'delete'],
  people: ['view', 'create', 'edit', 'delete'],
  reports: ['view'],
  settings: ['view', 'edit'],
}

export function permissionCatalog() {
  const keys: { key: string; module: string; action: string; label: string }[] = []
  for (const mod of MODULES) {
    for (const act of MODULE_ACTIONS[mod]) {
      keys.push({
        key: `${mod}.${act}`,
        module: mod,
        action: act,
        label: `${mod} ${act}`,
      })
    }
  }
  keys.push({ key: 'notify.ops', module: 'notify', action: 'ops', label: 'Receive ops email alerts' })
  return keys
}

export function allModulePerms(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const mod of MODULES) {
    for (const act of MODULE_ACTIONS[mod]) {
      out[`${mod}.${act}`] = '1'
    }
  }
  out['notify.ops'] = '1'
  return out
}

export function viewerPerms(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const mod of MODULES) out[`${mod}.view`] = '1'
  return out
}

export function employeePerms(): Record<string, string> {
  return {
    'projects.view': '1',
    'projects.edit': '1',
    'tasks.view': '1',
    'tasks.create': '1',
    'tasks.edit': '1',
    'subtasks.view': '1',
    'subtasks.create': '1',
    'subtasks.edit': '1',
  }
}

export const BUILTIN_ROLES = [
  'Superusers',
  'Admin',
  'Project Manager',
  'CTO',
  'CEO',
  'MD',
  'Business Head',
  'Employee',
  'Viewer',
] as const

export const LEADERSHIP_ROLES = ['Project Manager', 'CTO', 'CEO', 'MD', 'Business Head'] as const

export function parsePerms(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>
  return {}
}

export function isTruthyPerm(v: unknown): boolean {
  return v === '1' || v === 1 || v === true || v === 'true'
}

export function hasPermission(perms: Record<string, unknown> | null | undefined, permission: string): boolean {
  const p = perms || {}
  if (isTruthyPerm(p.superuser)) return true
  if (isTruthyPerm(p.admin)) return true
  if (isTruthyPerm(p[permission])) return true
  return false
}

export function mergePermissions(...sets: Record<string, unknown>[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const set of sets) {
    for (const [k, v] of Object.entries(set || {})) {
      if (isTruthyPerm(v)) out[k] = '1'
    }
  }
  return out
}

export async function getUserGroupIds(userId: number): Promise<number[]> {
  const rows = await all<{ group_id: number }>(
    `SELECT group_id FROM users_groups WHERE user_id = ?`,
    [userId],
  )
  return rows.map((r) => Number(r.group_id))
}

export async function syncUserPermissions(userId: number, extra?: Record<string, unknown>) {
  const groups = await all<{ permissions: unknown }>(`
    SELECT g.permissions
    FROM permission_groups g
    INNER JOIN users_groups ug ON ug.group_id = g.id
    WHERE ug.user_id = ?
  `, [userId])
  const merged = mergePermissions(
    ...groups.map((g) => parsePerms(g.permissions)),
    extra || {},
  )
  await run(`UPDATE users SET permissions = ?, updated_at = ? WHERE id = ?`, [
    JSON.stringify(merged),
    now(),
    userId,
  ])
  return merged
}

export async function setUserGroups(userId: number, groupIds: number[]) {
  await run(`DELETE FROM users_groups WHERE user_id = ?`, [userId])
  const unique = [...new Set(groupIds.map(Number).filter((n) => n > 0))]
  for (const gid of unique) {
    await run(`INSERT INTO users_groups (user_id, group_id) VALUES (?, ?)`, [userId, gid])
  }
  const row = await get<{ permissions: unknown }>(`SELECT permissions FROM users WHERE id = ?`, [userId])
  const existing = parsePerms(row?.permissions)
  const extras: Record<string, string> = {}
  if (isTruthyPerm(existing.superuser)) extras.superuser = '1'
  if (isTruthyPerm(existing.admin)) extras.admin = '1'
  return syncUserPermissions(userId, extras)
}

export async function ensureDefaultRoles() {
  const ts = now()
  const defaults: { name: string; permissions: Record<string, string> }[] = [
    { name: 'Superusers', permissions: { superuser: '1', admin: '1', ...allModulePerms() } },
    { name: 'Admin', permissions: { admin: '1', ...allModulePerms() } },
    { name: 'Project Manager', permissions: allModulePerms() },
    { name: 'CTO', permissions: allModulePerms() },
    { name: 'CEO', permissions: allModulePerms() },
    { name: 'MD', permissions: allModulePerms() },
    { name: 'Business Head', permissions: allModulePerms() },
    { name: 'Employee', permissions: employeePerms() },
    { name: 'Viewer', permissions: viewerPerms() },
  ]

  for (const d of defaults) {
    const existing = await get<{ id: number; permissions: unknown }>(`SELECT id, permissions FROM permission_groups WHERE name = ?`, [d.name])
    if (!existing) {
      await run(
        `INSERT INTO permission_groups (name, permissions, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        [d.name, JSON.stringify(d.permissions), ts, ts],
      )
    } else if (d.name === 'Employee') {
      const current = parsePerms(existing.permissions)
      const next = { ...current, ...d.permissions }
      const changed = Object.keys(d.permissions).some((k) => !isTruthyPerm(current[k]))
      if (changed) {
        await run(`UPDATE permission_groups SET permissions = ?, updated_at = ? WHERE id = ?`, [
          JSON.stringify(next), ts, existing.id,
        ])
        const members = await all<{ user_id: number }>(`SELECT user_id FROM users_groups WHERE group_id = ?`, [existing.id])
        for (const m of members) await syncUserPermissions(m.user_id)
      }
    }
  }

  const su = await get<{ id: number }>(`SELECT id FROM permission_groups WHERE name = 'Superusers' LIMIT 1`)
  const admin = await get<{ id: number }>(
    `SELECT id FROM users WHERE email = 'admin@refex.com' AND deleted_at IS NULL LIMIT 1`,
  )
  if (admin && su) {
    const link = await get(`SELECT user_id FROM users_groups WHERE user_id = ? AND group_id = ?`, [admin.id, su.id])
    if (!link) {
      await run(`INSERT INTO users_groups (user_id, group_id) VALUES (?, ?)`, [admin.id, su.id])
    }
    await syncUserPermissions(admin.id, { superuser: '1', admin: '1' })
  }
}

export function moduleGate(module: ModuleKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    let action: ActionKey = 'view'
    if (req.method === 'GET' || req.method === 'HEAD') action = 'view'
    else if (req.method === 'DELETE') action = 'delete'
    else if (req.method === 'PUT' || req.method === 'PATCH') action = 'edit'
    else if (req.method === 'POST') action = 'create'
    const permission = `${module}.${action}`
    if (hasPermission(req.user?.permissions || {}, permission)) return next()
    return fail(res, `Forbidden: missing ${permission}`, 403)
  }
}

export async function listOpsRecipientEmails(): Promise<string[]> {
  const rows = await all<{ email: string | null }>(`
    SELECT DISTINCT u.email
    FROM users u
    WHERE u.deleted_at IS NULL AND u.activated = 1 AND u.email IS NOT NULL AND u.email != ''
      AND (
        CAST(u.permissions AS CHAR) LIKE '%"notify.ops"%'
        OR CAST(u.permissions AS CHAR) LIKE '%"superuser"%'
        OR CAST(u.permissions AS CHAR) LIKE '%"admin"%'
      )
  `)
  const emails = new Set<string>()
  for (const r of rows) {
    const e = String(r.email || '').trim().toLowerCase()
    if (e && e.includes('@')) emails.add(e)
  }
  const groupUsers = await all<{ email: string | null }>(`
    SELECT DISTINCT u.email
    FROM users u
    INNER JOIN users_groups ug ON ug.user_id = u.id
    INNER JOIN permission_groups g ON g.id = ug.group_id
    WHERE u.deleted_at IS NULL AND u.activated = 1
      AND u.email IS NOT NULL AND u.email != ''
      AND (
        CAST(g.permissions AS CHAR) LIKE '%"notify.ops"%'
        OR CAST(g.permissions AS CHAR) LIKE '%"superuser"%'
        OR CAST(g.permissions AS CHAR) LIKE '%"admin"%'
      )
  `)
  for (const r of groupUsers) {
    const e = String(r.email || '').trim().toLowerCase()
    if (e && e.includes('@')) emails.add(e)
  }
  return [...emails]
}

export function requirePerm(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (hasPermission(req.user?.permissions, permission)) return next()
    return fail(res, `Forbidden: missing ${permission}`, 403)
  }
}
