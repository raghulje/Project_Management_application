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
import { resolveVisibility, subtaskRowVisible, taskRowVisible, visibilitySql } from '../services/recordVisibility.js'
import { attachRecordImport } from './recordImport.js'
import { attachRecordBulk } from './recordBulk.js'

export const tasksRouter = Router()

const WRITE = [
  'task_code', 'project_id', 'name', 'detail', 'status', 'workflow_status',
  'priority', 'task_type', 'entity', 'application_name',
  'function_category', 'function_sub_category', 'function_type',
  'start_date', 'end_date', 'tat_days', 'aging_days',
  'requires_approval', 'is_dependent', 'dependent_on_task_id',
  'assigned_to_employee_id', 'assigned_to_name', 'secondary_assignee_name',
  'l1_manager_email', 'l2_manager_email', 'root_cause_analysis',
  'created_by_name', 'created_by_email',
] as const

function mapTask(row: Record<string, unknown>, extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...row,
    requires_approval: Boolean(row.requires_approval),
    is_dependent: Boolean(row.is_dependent),
    ...extras,
  }
}

tasksRouter.get('/', async (req, res) => {
  const q = String(req.query.search || '').trim()
  let sql = `
    SELECT t.*, p.name as project_name, p.project_code as project_code, p.kissflow_id as project_kissflow_id
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.deleted_at IS NULL
  `
  const params: unknown[] = []
  const vis = await resolveVisibility(req.user)
  const clause = visibilitySql(vis, 'task', 't')
  sql += clause.sql
  params.push(...clause.params)
  if (req.query.project_id) { sql += ' AND t.project_id = ?'; params.push(Number(req.query.project_id)) }
  if (req.query.status) { sql += ' AND t.status = ?'; params.push(String(req.query.status)) }
  if (req.query.priority) { sql += ' AND t.priority = ?'; params.push(String(req.query.priority)) }
  if (req.query.assignee) { sql += ' AND t.assigned_to_name LIKE ?'; params.push(`%${req.query.assignee}%`) }
  if (q) {
    sql += ` AND (t.name LIKE ? OR t.task_code LIKE ? OR t.detail LIKE ? OR p.name LIKE ?)`
    const like = `%${q}%`
    params.push(like, like, like, like)
  }
  sql += ' ORDER BY t.id DESC'
  const limit = Math.min(Number(req.query.limit) || 50, 500)
  const offset = Number(req.query.offset) || 0
  const totalRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM (${sql}) AS _count_q`, params)
  const rows = await all<Record<string, unknown>>(`${sql} ${limitSql(limit, offset)}`, params)
  return okList(res, await attachRevisionCounts('task', rows.map((r) => mapTask(r))), Number(totalRow?.c || 0))
})

tasksRouter.get('/selectlist', async (req, res) => {
  const q = String(req.query.search || '').trim()
  const vis = await resolveVisibility(req.user)
  const clause = visibilitySql(vis, 'task')
  let sql = `SELECT id, CONCAT(COALESCE(task_code,''), ' — ', name) as text FROM tasks WHERE deleted_at IS NULL${clause.sql}`
  const params: unknown[] = [...clause.params]
  if (req.query.project_id) { sql += ' AND project_id = ?'; params.push(Number(req.query.project_id)) }
  if (q) { sql += ' AND (name LIKE ? OR task_code LIKE ?)'; params.push(`%${q}%`, `%${q}%`) }
  sql += ' ORDER BY name ASC LIMIT 500'
  return res.json({ results: await all(sql, params), pagination: { more: false } })
})

attachRecordImport(tasksRouter, 'task')
attachRecordBulk(tasksRouter, 'task')

tasksRouter.get('/:id', async (req, res) => {
  const key = String(req.params.id || '').trim()
  const row = /^\d+$/.test(key)
    ? await get<Record<string, unknown>>(`
        SELECT t.*, p.name as project_name, p.project_code as project_code, p.kissflow_id as project_kissflow_id
        FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.id = ? AND t.deleted_at IS NULL
      `, [key])
    : await get<Record<string, unknown>>(`
        SELECT t.*, p.name as project_name, p.project_code as project_code, p.kissflow_id as project_kissflow_id
        FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.deleted_at IS NULL AND (t.task_code = ? OR t.kissflow_id = ?)
        LIMIT 1
      `, [key, key])
  if (!row) return fail(res, 'Task not found', 404)
  const vis = await resolveVisibility(req.user)
  const [subtasks, revisions] = await Promise.all([
    all(`SELECT * FROM subtasks WHERE task_id = ? AND deleted_at IS NULL ORDER BY id DESC`, [row.id]),
    listRevisions('task', Number(row.id)),
  ])
  const canTask = vis.unrestricted || taskRowVisible(vis, row)
  const scopedSubs = canTask ? subtasks : subtasks.filter((s) => subtaskRowVisible(vis, s))
  if (!canTask && !scopedSubs.length) return fail(res, 'Task not found', 404)
  const mapped = mapTask(row, {
    subtasks: scopedSubs, revisions,
    revision_count: revisions.length,
    reopen_count: revisions.filter(isReopenRevision).length,
  })
  return okItem(res, req.user ? await attachEditPolicy(req.user, 'task', mapped) : mapped)
})

function writeVals(body: Record<string, unknown>) {
  const fields: string[] = WRITE.filter((f) => body[f] !== undefined)
  const bools = new Set(['requires_approval', 'is_dependent'])
  const vals = fields.map((f) => {
    if (bools.has(f)) return body[f] ? 1 : 0
    return body[f] === '' ? null : body[f]
  })
  return { fields, vals }
}

tasksRouter.post('/', async (req, res) => {
  const b = await applyCreateDefaults('task', req.body || {}, req.user)
  if (!b.name) return fail(res, 'name is required')
  const meta = await resolveAssignmentMeta('task', b)
  const prepared = await prepareCreateBody('task', { ...b, ...meta.extra }, 'local')
  const { fields, vals } = writeVals(prepared)
  if (!fields.includes('name')) { fields.push('name'); vals.push(prepared.name) }
  const ts = now()
  stampCreateWrite(fields, vals, prepared, req.user?.id ?? null, ts)
  const cols = [...fields, 'created_by_user_id', 'created_at', 'updated_at']
  const info = await run(
    `INSERT INTO tasks (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    [...vals, req.user?.id ?? null, ts, ts],
  )
  const id = Number(info.insertId)
  const row = await get<Record<string, unknown>>(`SELECT * FROM tasks WHERE id = ?`, [id])
  await recordCreated({ itemType: 'task', itemId: id, user: req.user, row: row || prepared })
  await logAction({ userId: req.user?.id, actionType: 'create', itemType: 'task', itemId: id })
  const mapped = mapTask(row || {})
  void resolvePersonEmail(val(mapped, 'assigned_to_name'), mapped.assigned_to_employee_id as number | null).then((email) => {
    notifyWorkflow({
      category: mapped.assigned_to_name ? 'assignment' : 'task_lifecycle',
      event: mapped.assigned_to_name ? 'task.assigned' : 'task.created',
      subject: `[PM] Task created: ${val(mapped, 'name')}`,
      title: 'New task created',
      intro: `${actorLabel(req.user)} created a task.`,
      fields: [
        { label: 'Name', value: val(mapped, 'name') },
        { label: 'Code', value: val(mapped, 'task_code') },
        { label: 'Status', value: val(mapped, 'status') },
        { label: 'Assignee', value: val(mapped, 'assigned_to_name') },
        { label: 'End date', value: val(mapped, 'end_date') },
      ],
      ctaPath: `/tasks/${id}`,
      itemType: 'task',
      itemId: id,
      projectId: mapped.project_id != null ? Number(mapped.project_id) : null,
      taskId: id,
      taskCode: val(mapped, 'task_code'),
      assigneeEmail: email,
    })
  })
  return okMessage(res, 'Task created', mapped, 201)
})

tasksRouter.post('/:id/reopen', async (req, res) => {
  const id = Number(req.params.id)
  if (!req.user) return fail(res, 'Unauthorized', 401)
  const result = await reopenRecord({
    itemType: 'task',
    itemId: id,
    reason: String(req.body?.reason || ''),
    toStatus: req.body?.status ? String(req.body.status) : 'Open',
    user: req.user,
  })
  if (!result.ok) return fail(res, result.message, result.status)
  const mapped = mapTask(result.row, { reopen_count: result.reopen_count })
  return okMessage(res, 'Task re-opened', req.user ? await attachEditPolicy(req.user, 'task', mapped) : mapped)
})

tasksRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const existing = await get<Record<string, unknown>>(`SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL`, [id])
  if (!existing) return fail(res, 'Task not found', 404)
  if (!req.user) return fail(res, 'Unauthorized', 401)
  if (req.body?.status != null && isReopenAttempt(existing.status, req.body.status)) {
    return fail(res, 'Closed records must be re-opened with a reason. Use Re-open.', 422)
  }
  const filtered = await filterWritableUpdate({
    user: req.user,
    itemType: 'task',
    existing,
    body: req.body || {},
    writeFields: WRITE,
  })
  if (!filtered.ok) return fail(res, filtered.message, filtered.status, filtered.payload)
  if (filtered.unchanged) {
    const mapped = mapTask(existing)
    return okMessage(res, 'No changes', req.user ? await attachEditPolicy(req.user, 'task', mapped) : mapped)
  }
  const ts = now()
  const { fields, vals } = writeVals(filtered.body)
  const life = lifecycleFields(existing, filtered.body.status, req.user.id, ts)
  for (let i = 0; i < life.fields.length; i += 1) mergeWrite(fields, vals, life.fields[i], life.vals[i])
  if (!fields.length) return fail(res, 'No fields')
  await run(
    `UPDATE tasks SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    [...vals, ts, id],
  )
  const after = await get<Record<string, unknown>>(`SELECT * FROM tasks WHERE id = ?`, [id])
  const changes = diffRecords(existing, after || {})
  await recordRevision({ itemType: 'task', itemId: id, user: req.user, changes })
  await logAction({ userId: req.user?.id, actionType: 'update', itemType: 'task', itemId: id, meta: { changes } })
  const row = await get<Record<string, unknown>>(`SELECT * FROM tasks WHERE id = ?`, [id])
  const mapped = mapTask(row || {})
  const assigned = req.body?.assigned_to_name != null
  notifyWorkflow({
    category: assigned ? 'assignment' : (req.body?.status != null ? 'status_change' : 'task_lifecycle'),
    event: assigned ? 'task.assigned' : 'task.updated',
    subject: `[PM] Task updated: ${val(mapped, 'name')}`,
    title: 'Task updated',
    intro: `${actorLabel(req.user)} updated this task.`,
    fields: [
      { label: 'Name', value: val(mapped, 'name') },
      { label: 'Status', value: val(mapped, 'status') },
      { label: 'Assignee', value: val(mapped, 'assigned_to_name') },
      { label: 'End date', value: val(mapped, 'end_date') },
    ],
    ctaPath: `/tasks/${id}`,
    itemType: 'task',
    itemId: id,
    projectId: mapped.project_id != null ? Number(mapped.project_id) : null,
    taskId: id,
    taskCode: val(mapped, 'task_code'),
  })
  return okMessage(res, 'Task updated', req.user ? await attachEditPolicy(req.user, 'task', mapped) : mapped)
})

tasksRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!(await get(`SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL`, [id]))) {
    return fail(res, 'Task not found', 404)
  }
  const ts = now()
  const existingRow = await get<Record<string, unknown>>(`SELECT * FROM tasks WHERE id = ?`, [id])
  await run(`UPDATE tasks SET deleted_at = ?, deleted_by_user_id = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?`, [ts, req.user?.id ?? null, req.user?.id ?? null, ts, id])
  await recordDeleted({ itemType: 'task', itemId: id, user: req.user, row: existingRow })
  await logAction({ userId: req.user?.id, actionType: 'delete', itemType: 'task', itemId: id })
  return okMessage(res, 'Task deleted')
})
