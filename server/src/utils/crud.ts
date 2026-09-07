import { Router, type Request, type Response } from 'express'
import { all, get, run, now, limitSql } from '../db/index.js'
import { fail, okItem, okList, okMessage } from './response.js'
import { logAction } from '../services/actionLog.js'

type CrudOpts = {
  table: string
  resource: string
  searchable?: string[]
  mapRow?: (row: Record<string, unknown>) => unknown | Promise<unknown>
  softDelete?: boolean
  allowedFields: string[]
}

export function makeCrudRouter(opts: CrudOpts) {
  const router = Router()
  const soft = opts.softDelete !== false
  const deletedClause = soft ? 'AND deleted_at IS NULL' : ''

  router.get('/', async (req, res) => {
    const q = String(req.query.search || req.query.q || '').trim()
    let sql = `SELECT * FROM ${opts.table} WHERE 1=1 ${deletedClause}`
    const params: unknown[] = []
    if (q && opts.searchable?.length) {
      sql += ` AND (${opts.searchable.map((c) => `${c} LIKE ?`).join(' OR ')})`
      opts.searchable.forEach(() => params.push(`%${q}%`))
    }
    sql += ' ORDER BY id DESC'
    const limit = Math.min(Number(req.query.limit) || 50, 500)
    const offset = Number(req.query.offset) || 0
    const totalRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM (${sql}) AS _count_q`, params)
    const total = Number(totalRow?.c || 0)
    const rows = await all<Record<string, unknown>>(`${sql} ${limitSql(limit, offset)}`, params)
    const mapped = opts.mapRow ? await Promise.all(rows.map((r) => opts.mapRow!(r))) : rows
    return okList(res, mapped, total)
  })

  router.get('/selectlist', selectlist(opts.table))

  router.get('/:id', async (req, res) => {
    const row = await get<Record<string, unknown>>(`SELECT * FROM ${opts.table} WHERE id = ? ${deletedClause}`, [req.params.id])
    if (!row) return fail(res, `${opts.resource} not found`, 404)
    return okItem(res, opts.mapRow ? await opts.mapRow(row) : row)
  })

  router.post('/', async (req, res) => {
    const body = req.body || {}
    const fields = opts.allowedFields.filter((f) => body[f] !== undefined)
    if (!fields.length) return fail(res, 'No valid fields')
    const ts = now()
    const cols = [...fields, 'created_at', 'updated_at']
    const placeholders = cols.map(() => '?').join(',')
    const values = [...fields.map((f) => body[f]), ts, ts]
    const info = await run(`INSERT INTO ${opts.table} (${cols.join(',')}) VALUES (${placeholders})`, values)
    await logAction({ userId: req.user?.id, actionType: 'create', itemType: opts.resource, itemId: Number(info.insertId) })
    const row = await get<Record<string, unknown>>(`SELECT * FROM ${opts.table} WHERE id = ?`, [info.insertId])
    return okMessage(res, `${opts.resource} created`, opts.mapRow && row ? await opts.mapRow(row) : row, 201)
  })

  router.put('/:id', (req, res) => update(req, res))
  router.patch('/:id', (req, res) => update(req, res))

  async function update(req: Request, res: Response) {
    const existing = await get(`SELECT id FROM ${opts.table} WHERE id = ? ${deletedClause}`, [req.params.id])
    if (!existing) return fail(res, `${opts.resource} not found`, 404)
    const body = req.body || {}
    const fields = opts.allowedFields.filter((f) => body[f] !== undefined)
    if (!fields.length) return fail(res, 'No valid fields')
    const sets = fields.map((f) => `${f} = ?`).join(', ')
    await run(`UPDATE ${opts.table} SET ${sets}, updated_at = ? WHERE id = ?`, [
      ...fields.map((f) => body[f]),
      now(),
      req.params.id,
    ])
    await logAction({ userId: req.user?.id, actionType: 'update', itemType: opts.resource, itemId: Number(req.params.id) })
    const row = await get<Record<string, unknown>>(`SELECT * FROM ${opts.table} WHERE id = ?`, [req.params.id])
    return okMessage(res, `${opts.resource} updated`, opts.mapRow && row ? await opts.mapRow(row) : row)
  }

  router.delete('/:id', async (req, res) => {
    const existing = await get(`SELECT id FROM ${opts.table} WHERE id = ? ${deletedClause}`, [req.params.id])
    if (!existing) return fail(res, `${opts.resource} not found`, 404)
    if (soft) {
      await run(`UPDATE ${opts.table} SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), req.params.id])
    } else {
      await run(`DELETE FROM ${opts.table} WHERE id = ?`, [req.params.id])
    }
    await logAction({ userId: req.user?.id, actionType: 'delete', itemType: opts.resource, itemId: Number(req.params.id) })
    return okMessage(res, `${opts.resource} deleted`)
  })

  return router
}

export function selectlist(table: string, nameCol = 'name') {
  return async (req: Request, res: Response) => {
    const q = String(req.query.search || '').trim()
    let sql = `SELECT id, ${nameCol} as text FROM ${table} WHERE deleted_at IS NULL`
    const params: unknown[] = []
    if (q) {
      sql += ` AND ${nameCol} LIKE ?`
      params.push(`%${q}%`)
    }
    if (req.query.companyId) {
      sql += ' AND company_id = ?'
      params.push(Number(req.query.companyId))
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000)
    sql += ` ORDER BY text ASC LIMIT ${limit}`
    const results = await all(sql, params)
    return res.json({ results, pagination: { more: false } })
  }
}
