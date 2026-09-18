import { Router } from 'express'
import { all, get, run, now, limitSql } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { logAction } from '../services/actionLog.js'
import { actorLabel, notifyWorkflow, resolvePersonEmail, val } from '../services/notify.js'
import { attachRevisionCounts, diffRecords, isReopenRevision, listRevisions, recordCreated, recordDeleted, recordRevision } from '../services/revisions.js'
import { lifecycleFields, mergeWrite, prepareCreateBody, stampCreateWrite } from '../services/recordIdentity.js'
import { attachEditPolicy, filterWritableUpdate, resolveAssignmentMeta } from '../services/fieldAccess.js'
import { applyCreateDefaults } from '../services/employeeProfile.js'
import { isReopenAttempt, reopenRecord } from '../services/reopen.js'
import { resolveVisibility, subtaskRowVisible, visibilitySql } from '../services/recordVisibility.js'
import { attachRecordImport } from './recordImport.js'
import { attachRecordBulk } from './recordBulk.js'

export const subtasksRouter = Router()

const WRITE = [
  'subtask_code', 'task_id', 'name', 'summary', 'status', 'workflow_status', 'priority',
  'start_date', 'end_date', 'is_dependent',
  'assigned_to_employee_id', 'assigned_to_name',
  'l1_manager_email', 'l2_manager_email', 'created_by_name',
] as const

function mapRow(row: Record<string, unknown>): Record<string, unknown> {
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
  const vis = await resolveVisibility(req.user)
  const clause = visibilitySql(vis, 'subtask', 's')
  sql += clause.sql
  params.push(...clause.params)
  if (req.query.task_id) { sql += ' AND s.task_id = ?'; params.push(Number(req.query.task_id)) }
  if (req.query.project_id) { sql += ' AND t.project_id = ?'; params.push(Number(req.query.project_id)) }
  if (req.query.status) { sql += ' AND s.status = ?'; params.push(String(req.query.status)) }
  if (q) {
    sql += ` AND (s.name LIKE ? OR s.subtask_code LIKE ? OR s.summary LIKE ? OR t.name LIKE ?)`
    const like = `%${q}%`
    params.push(like, like, like, like)
  }
  sql += ' ORDER BY s.id DESC'
  const limit = Math.min(Number(req.query.limit) || 50, 500)
  const offset = Number(req.query.offset) || 0
  const totalRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM (${sql}) AS _count_q`, params)
  const rows = await all<Record<string, unknown>>(`${sql} ${limitSql(limit, offset)}`, params)
  return okList(res, await attachRevisionCounts('subtask', rows.map(mapRow)), Number(totalRow?.c || 0))
})

attachRecordImport(subtasksRouter, 'subtask')
attachRecordBulk(subtasksRouter, 'subtask')

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
        WHERE s.deleted_at IS NULL AND (s.subtask_code = ? OR s.kissflow_id = ?)
        LIMIT 1
      `, [key, key])
  if (!row) return fail(res, 'Subtask not found', 404)
  const vis = await resolveVisibility(req.user)
  if (!vis.unrestricted && !subtaskRowVisible(vis, row)) return fail(res, 'Subtask not found', 404)
  const revisions = await listRevisions('subtask', Number(row.id))
  const mapped = { ...mapRow(row), revisions, revision_count: revisions.length, reopen_count: revisions.filter(isReopenRevision).length }
  return okItem(res, req.user ? await attachEditPolicy(req.user, 'subtask', mapped) : mapped)
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
  const b = await applyCreateDefaults('subtask', req.body || {}, req.user)
  if (!b.name) return fail(res, 'name is required')
  const meta = await resolveAssignmentMeta('subtask', b)
  const prepared = await prepareCreateBody('subtask', { ...b, ...meta.extra }, 'local')
  const { fields, vals } = writeVals(prepared)
  if (!fields.includes('name')) { fields.push('name'); vals.push(prepared.name) }
  const ts = now()
  stampCreateWrite(fields, vals, prepared, req.user?.id ?? null, ts)
  const cols = [...fields, 'created_by_user_id', 'created_at', 'updated_at']
  const info = await run(
    `INSERT INTO subtasks (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    [...vals, req.user?.id ?? null, ts, ts],
  )
  const id = Number(info.insertId)
  const row = await get<Record<string, unknown>>(`SELECT * FROM subtasks WHERE id = ?`, [id])
  await recordCreated({ itemType: 'subtask', itemId: id, user: req.user, row: row || prepared })
  await logAction({ userId: req.user?.id, actionType: 'create', itemType: 'subtask', itemId: id })
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

subtasksRouter.post('/:id/reopen', async (req, res) => {
  const id = Number(req.params.id)
  if (!req.user) return fail(res, 'Unauthorized', 401)
  const result = await reopenRecord({
    itemType: 'subtask',
    itemId: id,
    reason: String(req.body?.reason || ''),
    toStatus: req.body?.status ? String(req.body.status) : 'Open',
    user: req.user,
  })
  if (!result.ok) return fail(res, result.message, result.status)
  const mapped = { ...mapRow(result.row), reopen_count: result.reopen_count }
  return okMessage(res, 'Subtask re-opened', req.user ? await attachEditPolicy(req.user, 'subtask', mapped) : mapped)
})

subtasksRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const existing = await get<Record<string, unknown>>(`SELECT * FROM subtasks WHERE id = ? AND deleted_at IS NULL`, [id])
  if (!existing) return fail(res, 'Subtask not found', 404)
  if (!req.user) return fail(res, 'Unauthorized', 401)
  if (req.body?.status != null && isReopenAttempt(existing.status, req.body.status)) {
    return fail(res, 'Closed records must be re-opened with a reason. Use Re-open.', 422)
  }
  const filtered = await filterWritableUpdate({
    user: req.user,
    itemType: 'subtask',
    existing,
    body: req.body || {},
    writeFields: WRITE,
  })
  if (!filtered.ok) return fail(res, filtered.message, filtered.status, filtered.payload)
  if (filtered.unchanged) {
    return okMessage(res, 'No changes', req.user ? await attachEditPolicy(req.user, 'subtask', mapRow(existing)) : mapRow(existing))
  }
  const ts = now()
  const { fields, vals } = writeVals(filtered.body)
  const life = lifecycleFields(existing, filtered.body.status, req.user.id, ts)
  for (let i = 0; i < life.fields.length; i += 1) mergeWrite(fields, vals, life.fields[i], life.vals[i])
  if (!fields.length) return fail(res, 'No fields')
  await run(
    `UPDATE subtasks SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    [...vals, ts, id],
  )
  const after = await get<Record<string, unknown>>(`SELECT * FROM subtasks WHERE id = ?`, [id])
  const changes = diffRecords(existing, after || {})
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
  return okMessage(res, 'Subtask updated', req.user ? await attachEditPolicy(req.user, 'subtask', mapped) : mapped)
})

subtasksRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!(await get(`SELECT id FROM subtasks WHERE id = ? AND deleted_at IS NULL`, [id]))) {
    return fail(res, 'Subtask not found', 404)
  }
  const ts = now()
  const existingRow = await get<Record<string, unknown>>(`SELECT * FROM subtasks WHERE id = ?`, [id])
  await run(`UPDATE subtasks SET deleted_at = ?, deleted_by_user_id = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?`, [ts, req.user?.id ?? null, req.user?.id ?? null, ts, id])
  await recordDeleted({ itemType: 'subtask', itemId: id, user: req.user, row: existingRow })
  await logAction({ userId: req.user?.id, actionType: 'delete', itemType: 'subtask', itemId: id })
  return okMessage(res, 'Subtask deleted')
})
