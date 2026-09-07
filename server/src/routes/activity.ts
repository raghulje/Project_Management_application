import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { all, get, run, now } from '../db/index.js'
import { fail, okItem, okMessage } from '../utils/response.js'
import { makeUploader, storageRoot } from '../services/uploads.js'

export const activityRouter = Router()
const upload = makeUploader('private_uploads/records', 'file')

function actor(user?: { first_name?: string; last_name?: string; username?: string }) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.username || 'Someone'
}

function mentionsFrom(body: string) {
  return [...new Set((body.match(/@([A-Za-z][A-Za-z .'-]{1,60})/g) || []).map((m) => m.slice(1).trim()))]
}

activityRouter.get('/', async (req, res) => {
  const item_type = String(req.query.item_type || '')
  const item_id = Number(req.query.item_id)
  if (!item_type || !item_id) return fail(res, 'item_type and item_id required')
  const [comments, files, assignees] = await Promise.all([
    all(`SELECT * FROM record_comments WHERE item_type = ? AND item_id = ? ORDER BY id ASC`, [item_type, item_id]),
    all(`SELECT id, item_type, item_id, file_name, mime_type, size_bytes, created_by_name, created_at
         FROM record_files WHERE item_type = ? AND item_id = ? ORDER BY id DESC`, [item_type, item_id]),
    all(`SELECT * FROM record_assignees WHERE item_type = ? AND item_id = ? ORDER BY id ASC`, [item_type, item_id]),
  ])
  return okItem(res, { comments, files, assignees })
})

activityRouter.post('/comments', async (req, res) => {
  const item_type = String(req.body?.item_type || '')
  const item_id = Number(req.body?.item_id)
  const body = String(req.body?.body || '').trim()
  if (!item_type || !item_id || !body) return fail(res, 'Comment text is required')
  const mentions = mentionsFrom(body)
  const ts = now()
  const info = await run(
    `INSERT INTO record_comments (item_type, item_id, body, mentions, created_by_user_id, created_by_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [item_type, item_id, body, JSON.stringify(mentions), req.user?.id ?? null, actor(req.user), ts],
  )
  for (const name of mentions) {
    await run(
      `INSERT IGNORE INTO record_assignees (item_type, item_id, person_name, created_at) VALUES (?, ?, ?, ?)`,
      [item_type, item_id, name, ts],
    )
  }
  const row = await get(`SELECT * FROM record_comments WHERE id = ?`, [info.insertId])
  return okMessage(res, 'Comment added', row, 201)
})

activityRouter.delete('/comments/:id', async (req, res) => {
  const id = Number(req.params.id)
  const row = await get<{ created_by_user_id?: number }>(`SELECT created_by_user_id FROM record_comments WHERE id = ?`, [id])
  if (!row) return fail(res, 'Comment not found', 404)
  await run(`DELETE FROM record_comments WHERE id = ?`, [id])
  return okMessage(res, 'Comment deleted')
})

activityRouter.put('/assignees', async (req, res) => {
  const item_type = String(req.body?.item_type || '')
  const item_id = Number(req.body?.item_id)
  const names = Array.isArray(req.body?.names) ? req.body.names.map((n: unknown) => String(n || '').trim()).filter(Boolean) : []
  if (!item_type || !item_id) return fail(res, 'item_type and item_id required')
  await run(`DELETE FROM record_assignees WHERE item_type = ? AND item_id = ?`, [item_type, item_id])
  const ts = now()
  for (const name of names) {
    await run(
      `INSERT IGNORE INTO record_assignees (item_type, item_id, person_name, created_at) VALUES (?, ?, ?, ?)`,
      [item_type, item_id, name, ts],
    )
  }
  const rows = await all(`SELECT * FROM record_assignees WHERE item_type = ? AND item_id = ?`, [item_type, item_id])
  return okMessage(res, 'Assignees updated', rows)
})

activityRouter.post('/files', (req, res) => {
  upload(req, res, async (err) => {
    if (err) return fail(res, err.message)
    const file = req.file
    const item_type = String(req.body?.item_type || '')
    const item_id = Number(req.body?.item_id)
    if (!file || !item_type || !item_id) return fail(res, 'File, item_type and item_id required')
    const ts = now()
    const info = await run(
      `INSERT INTO record_files (item_type, item_id, file_name, stored_name, mime_type, size_bytes, created_by_user_id, created_by_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item_type, item_id, file.originalname, file.filename, file.mimetype, file.size, req.user?.id ?? null, actor(req.user), ts],
    )
    const row = await get(`SELECT id, item_type, item_id, file_name, mime_type, size_bytes, created_by_name, created_at FROM record_files WHERE id = ?`, [info.insertId])
    return okMessage(res, 'File uploaded', row, 201)
  })
})

activityRouter.get('/files/:id/download', async (req, res) => {
  const row = await get<{ file_name: string; stored_name: string }>(`SELECT file_name, stored_name FROM record_files WHERE id = ?`, [Number(req.params.id)])
  if (!row) return fail(res, 'File not found', 404)
  const full = path.join(storageRoot, 'private_uploads/records', row.stored_name)
  if (!fs.existsSync(full)) return fail(res, 'File missing on disk', 404)
  return res.download(full, row.file_name)
})

activityRouter.delete('/files/:id', async (req, res) => {
  const id = Number(req.params.id)
  const row = await get<{ stored_name: string }>(`SELECT stored_name FROM record_files WHERE id = ?`, [id])
  if (!row) return fail(res, 'File not found', 404)
  const full = path.join(storageRoot, 'private_uploads/records', row.stored_name)
  try { fs.unlinkSync(full) } catch { /* ignore */ }
  await run(`DELETE FROM record_files WHERE id = ?`, [id])
  return okMessage(res, 'File deleted')
})
