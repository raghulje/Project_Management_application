import { Router } from 'express'
import { all, get, run, now, limitSql } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { logAction } from '../services/actionLog.js'
import { actorLabel, notifyWorkflow, resolvePersonEmail, val } from '../services/notify.js'
import { attachRevisionCounts, diffRecords, listRevisions, recordRevision } from '../services/revisions.js'

export const subtasksRouter = Router()

const WRITE = [
  'kissflow_id', 'task_id', 'name', 'summary', 'status', 'workflow_status', 'priority',
  'start_date', 'end_date', 'is_dependent',
  'assigned_to_employee_id', 'assigned_to_name',
  'l1_manager_email', 'l2_manager_email', 'created_by_name',
] as const

function mapRow(row: Record<string, unknown>) {
  return { ...row, is_dependent: Boolean(row.is_dependent) }
}

subtasksRouter.get('/', async (req, res) => {
  const q = String(req.query.search || '').trim()
  let sql = `
    SELECT s.*, t.name as task_name, t.task_code, p.name as project_name
    FROM subtasks s
    LEFT JOIN tasks t ON t.id = s.task_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE s.deleted_at IS NULL
  `
  const params: unknown[] = []
  if (req.query.task_id) { sql += ' AND s.task_id = ?'; params.push(Number(req.query.task_id)) }
  if (req.query.project_id) { sql += ' AND t.project_id = ?'; params.push(Number(req.query.project_id)) }
  if (req.query.status) { sql += ' AND s.status = ?'; params.push(String(req.query.status)) }
  if (q) {
    sql += ` AND (s.name LIKE ? OR s.summary LIKE ? OR t.name LIKE ?)`
    const like = `%${q}%`
    params.push(like, like, like)
  }
  sql += ' ORDER BY s.id DESC'
  const limit = Math.min(Number(req.query.limit) || 50, 500)
  const offset = Number(req.query.offset) || 0
  const totalRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM (${sql}) AS _count_q`, params)
  const rows = await all<Record<string, unknown>>(`${sql} ${limitSql(limit, offset)}`, params)
  return okList(res, await attachRevisionCounts('subtask', rows.map(mapRow)), Number(totalRow?.c || 0))
})

subtasksRouter.get('/:id', async (req, res) => {
  const key = String(req.params.id || '').trim()
  const row = /^\d+$/.test(key)
    ? await get<Record<string, unknown>>(`
        SELECT s.*, t.name as task_name, t.task_code, p.name as project_name, p.id as project_id
        FROM subtasks s
        LEFT JOIN tasks t ON t.id = s.task_id
        LEFT JOIN projects p ON p.id = t.project_id
        WHERE s.id = ? AND s.deleted_at IS NULL
      `, [key])
    : await get<Record<string, unknown>>(`
        SELECT s.*, t.name as task_name, t.task_code, p.name as project_name, p.id as project_id
        FROM subtasks s
        LEFT JOIN tasks t ON t.id = s.task_id
        LEFT JOIN projects p ON p.id = t.project_id
        WHERE s.deleted_at IS NULL AND s.kissflow_id = ?
        LIMIT 1
      `, [key])
  if (!row) return fail(res, 'Subtask not found', 404)
  const revisions = await listRevisions('subtask', Number(row.id))
  return okItem(res, { ...mapRow(row), revisions, revision_count: revisions.length })
})

function writeVals(body: Record<string, unknown>) {
  const fields: string[] = WRITE.filter((f) => body[f] !== undefined)
  const vals = fields.map((f) => {
    if (f === 'is_dependent') return body[f] ? 1 : 0
    return body[f] === '' ? null : body[f]
  })
  return { fields, vals }
}

subtasksRouter.post('/', async (req, res) => {
  const b = req.body || {}
  if (!b.name) return fail(res, 'name is required')
  const { fields, vals } = writeVals(b)
  if (!fields.includes('name')) { fields.push('name'); vals.push(b.name) }
  const ts = now()
  const cols = [...fields, 'created_by_user_id', 'created_at', 'updated_at']
  const info = await run(
    `INSERT INTO subtasks (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    [...vals, req.user?.id ?? null, ts, ts],
  )
  const id = Number(info.insertId)
  await logAction({ userId: req.user?.id, actionType: 'create', itemType: 'subtask', itemId: id })
  const row = await get<Record<string, unknown>>(`SELECT * FROM subtasks WHERE id = ?`, [id])
  const mapped = mapRow(row || {})
  void resolvePersonEmail(val(mapped, 'assigned_to_name'), mapped.assigned_to_employee_id as number | null).then((email) => {
    notifyWorkflow({
      category: mapped.assigned_to_name ? 'assignment' : 'subtask_lifecycle',
      event: mapped.assigned_to_name ? 'subtask.assigned' : 'subtask.created',
      subject: `[PM] Subtask created: ${val(mapped, 'name')}`,
      title: 'New subtask created',
      intro: `${actorLabel(req.user)} created a subtask.`,
      fields: [
        { label: 'Name', value: val(mapped, 'name') },
        { label: 'Status', value: val(mapped, 'status') },
        { label: 'Assignee', value: val(mapped, 'assigned_to_name') },
        { label: 'End date', value: val(mapped, 'end_date') },
      ],
      ctaPath: `/subtasks/${id}`,
      itemType: 'subtask',
      itemId: id,
      taskId: mapped.task_id != null ? Number(mapped.task_id) : null,
      subtaskId: id,
      assigneeEmail: email,
    })
  })
  return okMessage(res, 'Subtask created', mapped, 201)
})

subtasksRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const existing = await get<Record<string, unknown>>(`SELECT * FROM subtasks WHERE id = ? AND deleted_at IS NULL`, [id])
  if (!existing) return fail(res, 'Subtask not found', 404)
  const { fields, vals } = writeVals(req.body || {})
  if (!fields.length) return fail(res, 'No fields')
  await run(
    `UPDATE subtasks SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    [...vals, now(), id],
  )
  const after = await get<Record<string, unknown>>(`SELECT * FROM subtasks WHERE id = ?`, [id])
  const changes = diffRecords(existing, after || {}, fields)
  await recordRevision({ itemType: 'subtask', itemId: id, user: req.user, changes })
  await logAction({ userId: req.user?.id, actionType: 'update', itemType: 'subtask', itemId: id, meta: { changes } })
  const row = await get<Record<string, unknown>>(`SELECT * FROM subtasks WHERE id = ?`, [id])
  const mapped = mapRow(row || {})
  notifyWorkflow({
    category: req.body?.assigned_to_name != null ? 'assignment' : 'subtask_lifecycle',
    event: req.body?.assigned_to_name != null ? 'subtask.assigned' : 'subtask.updated',
    subject: `[PM] Subtask updated: ${val(mapped, 'name')}`,
    title: 'Subtask updated',
    intro: `${actorLabel(req.user)} updated this subtask.`,
    fields: [
      { label: 'Name', value: val(mapped, 'name') },
      { label: 'Status', value: val(mapped, 'status') },
      { label: 'Assignee', value: val(mapped, 'assigned_to_name') },
    ],
    ctaPath: `/subtasks/${id}`,
    itemType: 'subtask',
    itemId: id,
    taskId: mapped.task_id != null ? Number(mapped.task_id) : null,
    subtaskId: id,
  })
  return okMessage(res, 'Subtask updated', mapped)
})

subtasksRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!(await get(`SELECT id FROM subtasks WHERE id = ? AND deleted_at IS NULL`, [id]))) {
    return fail(res, 'Subtask not found', 404)
  }
  const ts = now()
  await run(`UPDATE subtasks SET deleted_at = ?, updated_at = ? WHERE id = ?`, [ts, ts, id])
  await logAction({ userId: req.user?.id, actionType: 'delete', itemType: 'subtask', itemId: id })
  return okMessage(res, 'Subtask deleted')
})
