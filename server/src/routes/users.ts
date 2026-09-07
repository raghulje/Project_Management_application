import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { all, get, run, now, limitSql } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { transformUser } from '../services/transformers.js'
import { logAction } from '../services/actionLog.js'
import { selectlist } from '../utils/crud.js'
import { getUserGroupIds, setUserGroups } from '../services/permissions.js'

export const usersRouter = Router()

usersRouter.get('/', async (req, res) => {
  const q = String(req.query.search || '').trim()
  let sql = `SELECT id FROM users WHERE deleted_at IS NULL`
  const params: unknown[] = []
  if (req.query.activated === '1') sql += ' AND activated = 1'
  if (req.query.activated === '0') sql += ' AND activated = 0'
  if (q) {
    sql += ` AND (first_name LIKE ? OR last_name LIKE ? OR username LIKE ? OR email LIKE ?)`
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
  }
  sql += ' ORDER BY id DESC'
  const limit = Math.min(Number(req.query.limit) || 50, 500)
  const offset = Number(req.query.offset) || 0
  const totalRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM (${sql}) AS _count_q`, params)
  const ids = await all<{ id: number }>(`${sql} ${limitSql(limit, offset)}`, params)
  const rows = (await Promise.all(ids.map((r) => transformUser(r.id)))).filter(Boolean)
  return okList(res, rows, Number(totalRow?.c || 0))
})

usersRouter.get('/selectlist', selectlist('users', `CONCAT(first_name, ' ', last_name)`))

usersRouter.get('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const user = await transformUser(id)
  if (!user) return fail(res, 'User not found', 404)
  const group_ids = await getUserGroupIds(id)
  return okItem(res, { ...user, group_ids })
})

const WRITE = [
  'first_name', 'last_name', 'username', 'email', 'phone', 'jobtitle',
  'employee_num', 'company_id', 'location_id', 'department_id', 'manager_id',
  'activated', 'notes',
] as const

usersRouter.post('/', async (req, res) => {
  const b = req.body || {}
  if (!b.first_name || !b.username) return fail(res, 'first_name and username are required')
  const exists = await get(`SELECT id FROM users WHERE username = ? AND deleted_at IS NULL`, [b.username])
  if (exists) return fail(res, 'Username already exists')
  const ts = now()
  const password = bcrypt.hashSync(String(b.password || 'Welcome@2026'), 10)
  const fields = WRITE.filter((f) => b[f] !== undefined)
  const cols = [...fields, 'password', 'created_at', 'updated_at']
  const vals = [...fields.map((f) => b[f]), password, ts, ts]
  const info = await run(`INSERT INTO users (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, vals)
  const id = Number(info.insertId)
  if (Array.isArray(b.group_ids)) await setUserGroups(id, b.group_ids.map(Number))
  await logAction({ userId: req.user?.id, actionType: 'create', itemType: 'user', itemId: id })
  return okMessage(res, 'User created', await transformUser(id), 201)
})

usersRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!(await transformUser(id))) return fail(res, 'User not found', 404)
  const b = req.body || {}
  const fields = WRITE.filter((f) => b[f] !== undefined)
  const sets = fields.map((f) => `${f} = ?`)
  const vals: unknown[] = fields.map((f) => b[f])
  if (b.password) {
    sets.push('password = ?')
    vals.push(bcrypt.hashSync(String(b.password), 10))
  }
  if (!sets.length && !Array.isArray(b.group_ids)) return fail(res, 'No fields')
  if (sets.length) {
    vals.push(now(), id)
    await run(`UPDATE users SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, vals)
  }
  if (Array.isArray(b.group_ids)) await setUserGroups(id, b.group_ids.map(Number))
  await logAction({ userId: req.user?.id, actionType: 'update', itemType: 'user', itemId: id })
  return okMessage(res, 'User updated', await transformUser(id))
})

usersRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (id === req.user?.id) return fail(res, 'You cannot delete your own account', 422)
  if (!(await transformUser(id))) return fail(res, 'User not found', 404)
  const ts = now()
  await run(`UPDATE users SET deleted_at = ?, updated_at = ?, activated = 0 WHERE id = ?`, [ts, ts, id])
  await logAction({ userId: req.user?.id, actionType: 'delete', itemType: 'user', itemId: id })
  return okMessage(res, 'User deleted')
})
