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
import { projectRowVisible, resolveVisibility, taskRowVisible, visibilitySql } from '../services/recordVisibility.js'
import { attachRecordImport } from './recordImport.js'
import { attachRecordBulk } from './recordBulk.js'

export const projectsRouter = Router()

const WRITE = [
  'project_code', 'name', 'status', 'priority', 'rag', 'risk',
  'category', 'project_type', 'project_request', 'function_type',
  'function_category', 'function_sub_category',
  'company_name', 'entity', 'business', 'company_id',
  'start_date', 'end_date', 'governance_frequency',
  'ai_usage', 'ai_details',
  'reports_available', 'integrated_with_tally', 'integrated_with_sap', 'integrated_with_power_bi',
  'brd_available', 'process_document', 'support_available', 'cb_analysis_available', 'risk_mitigation',
  'objectives', 'tech_stack', 'tat_days', 'aging_days', 'hours', 'tco_efforts', 'completion',
  'application_name', 'vendor_name', 'l1_manager_email', 'l2_manager_email',
  'requester_employee_id', 'requester_name',
  'business_owner_employee_id', 'business_owner_name',
  'project_owner_employee_id', 'project_owner_name',
  'sponsor_employee_id', 'sponsor_name',
  'project_manager_employee_id', 'project_manager_name',
  'developer_employee_id', 'developer_name', 'cos_owner_name', 'assignee_name',
  'risk_mitigation_details',
] as const

function mapProject(row: Record<string, unknown>, extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...row,
    ai_usage: Boolean(row.ai_usage),
    reports_available: Boolean(row.reports_available),
    integrated_with_tally: Boolean(row.integrated_with_tally),
    integrated_with_sap: Boolean(row.integrated_with_sap),
    integrated_with_power_bi: Boolean(row.integrated_with_power_bi),
    brd_available: Boolean(row.brd_available),
    process_document: Boolean(row.process_document),
    support_available: Boolean(row.support_available),
    cb_analysis_available: Boolean(row.cb_analysis_available),
    risk_mitigation: Boolean(row.risk_mitigation),
    tech_stack: asTech(row.tech_stack),
    ...extras,
  }
}

projectsRouter.get('/', async (req, res) => {
  const q = String(req.query.search || '').trim()
  let sql = `SELECT * FROM projects WHERE deleted_at IS NULL`
  const params: unknown[] = []
  const vis = await resolveVisibility(req.user)
  const clause = visibilitySql(vis, 'project')
  sql += clause.sql
  params.push(...clause.params)
  if (req.query.status) { sql += ' AND status = ?'; params.push(String(req.query.status)) }
  if (req.query.category) { sql += ' AND category = ?'; params.push(String(req.query.category)) }
  if (req.query.rag) { sql += ' AND rag LIKE ?'; params.push(`%${req.query.rag}%`) }
  if (req.query.owner) { sql += ' AND project_owner_name LIKE ?'; params.push(`%${req.query.owner}%`) }
  if (q) {
    sql += ` AND (name LIKE ? OR project_code LIKE ? OR kissflow_id LIKE ? OR company_name LIKE ?)`
    const like = `%${q}%`
    params.push(like, like, like, like)
  }
  sql += ' ORDER BY id DESC'
  const limit = Math.min(Number(req.query.limit) || 50, 500)
  const offset = Number(req.query.offset) || 0
  const totalRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM (${sql}) AS _count_q`, params)
  const rows = await all<Record<string, unknown>>(`${sql} ${limitSql(limit, offset)}`, params)
  return okList(res, await attachRevisionCounts('project', rows.map((r) => mapProject(r))), Number(totalRow?.c || 0))
})

projectsRouter.get('/selectlist', async (req, res) => {
  const q = String(req.query.search || '').trim()
  const vis = await resolveVisibility(req.user)
  const clause = visibilitySql(vis, 'project')
  let sql = `SELECT id, CONCAT(COALESCE(NULLIF(project_code,''), CONCAT('#', id)), ' — ', name) as text FROM projects WHERE deleted_at IS NULL${clause.sql}`
  const params: unknown[] = [...clause.params]
  if (q) { sql += ' AND (name LIKE ? OR project_code LIKE ? OR kissflow_id LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`) }
  sql += ' ORDER BY name ASC LIMIT 500'
  return res.json({ results: await all(sql, params), pagination: { more: false } })
})

attachRecordImport(projectsRouter, 'project')
attachRecordBulk(projectsRouter, 'project')

projectsRouter.get('/:id', async (req, res) => {
  const key = String(req.params.id || '').trim()
  const row = /^\d+$/.test(key)
    ? await get<Record<string, unknown>>(`SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL`, [key])
    : await get<Record<string, unknown>>(
      `SELECT * FROM projects WHERE deleted_at IS NULL AND (kissflow_id = ? OR project_code = ?) LIMIT 1`,
      [key, key],
    )
  if (!row) return fail(res, 'Project not found', 404)
  const vis = await resolveVisibility(req.user)
  const [taskRows, timeline, revisions] = await Promise.all([
    all(`SELECT id, task_code, name, status, priority, assigned_to_name, assigned_to_employee_id, start_date, end_date, l1_manager_email, l2_manager_email, created_by_name, secondary_assignee_name
         FROM tasks WHERE project_id = ? AND deleted_at IS NULL ORDER BY id DESC`, [row.id]),
    all(`SELECT * FROM project_timeline_history WHERE project_id = ? ORDER BY id DESC`, [row.id]),
    listRevisions('project', Number(row.id)),
  ])
  const steward = vis.unrestricted || projectRowVisible(vis, row)
  const scopedTaskRows = steward ? taskRows : taskRows.filter((t) => taskRowVisible(vis, t))
  if (!steward && !scopedTaskRows.length) return fail(res, 'Project not found', 404)
  const tasks = await attachRevisionCounts('task', scopedTaskRows)
  const counts = await get<{ open_tasks: number; done_tasks: number }>(`
    SELECT
      SUM(CASE WHEN status NOT IN ('Completed','Closed','Cancelled') THEN 1 ELSE 0 END) as open_tasks,
      SUM(CASE WHEN status IN ('Completed','Closed') THEN 1 ELSE 0 END) as done_tasks
    FROM tasks WHERE project_id = ? AND deleted_at IS NULL
  `, [row.id])
  const mapped = mapProject(row, {
    tasks, timeline, revisions,
    revision_count: revisions.length,
    reopen_count: revisions.filter(isReopenRevision).length,
    task_counts: counts,
  })
  return okItem(res, req.user ? await attachEditPolicy(req.user, 'project', mapped) : mapped)
})

function asTech(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'string') {
    try { return asTech(JSON.parse(v)) } catch { return v }
  }
  if (Array.isArray(v)) return v.filter(Boolean).map(String).join(', ')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (o.label || o.name || o.value) return String(o.label || o.name || o.value)
    return Object.keys(o).filter((k) => o[k]).join(', ')
  }
  return String(v)
}

function writeVals(body: Record<string, unknown>) {
  const fields: string[] = WRITE.filter((f) => body[f] !== undefined)
  const vals = fields.map((f) => {
    if (f === 'tech_stack') {
      if (typeof body[f] === 'string') {
        const parts = body[f].split(',').map((s) => s.trim()).filter(Boolean)
        return JSON.stringify(parts)
      }
      if (body[f] != null && typeof body[f] === 'object') return JSON.stringify(body[f])
      return null
    }
    if ([
      'ai_usage', 'reports_available', 'integrated_with_tally', 'integrated_with_sap',
      'integrated_with_power_bi', 'brd_available', 'process_document', 'support_available',
      'cb_analysis_available', 'risk_mitigation',
    ].includes(f)) return body[f] === true || body[f] === 1 || body[f] === '1' || body[f] === 'true' ? 1 : 0
    return body[f] === '' ? null : body[f]
  })
  return { fields, vals }
}

projectsRouter.post('/', async (req, res) => {
  const b = await applyCreateDefaults('project', req.body || {}, req.user)
  if (!b.name) return fail(res, 'name is required')
  const meta = await resolveAssignmentMeta('project', b)
  const prepared = await prepareCreateBody('project', { ...b, ...meta.extra }, 'local')
  const { fields, vals } = writeVals(prepared)
  if (!fields.includes('name')) { fields.push('name'); vals.push(prepared.name) }
  const ts = now()
  stampCreateWrite(fields, vals, prepared, req.user?.id ?? null, ts)
  const cols = [...fields, 'created_by_user_id', 'created_at', 'updated_at']
  const info = await run(
    `INSERT INTO projects (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    [...vals, req.user?.id ?? null, ts, ts],
  )
  const id = Number(info.insertId)
  const row = await get<Record<string, unknown>>(`SELECT * FROM projects WHERE id = ?`, [id])
  await recordCreated({ itemType: 'project', itemId: id, user: req.user, row: row || prepared })
  await logAction({ userId: req.user?.id, actionType: 'create', itemType: 'project', itemId: id })
  const mapped = mapProject(row || {})
  void resolvePersonEmail(val(mapped, 'project_owner_name'), mapped.project_owner_employee_id as number | null).then((email) => {
    notifyWorkflow({
      category: 'project_lifecycle',
      event: 'project.created',
      subject: `[PM] Project created: ${val(mapped, 'name')}`,
      title: 'New project created',
      intro: `${actorLabel(req.user)} created a project.`,
      fields: [
        { label: 'Name', value: val(mapped, 'name') },
        { label: 'Code', value: val(mapped, 'project_code') },
        { label: 'Status', value: val(mapped, 'status') },
        { label: 'Priority', value: val(mapped, 'priority') },
        { label: 'Owner', value: val(mapped, 'project_owner_name') },
        { label: 'End date', value: val(mapped, 'end_date') },
      ],
      ctaPath: `/projects/${id}`,
      itemType: 'project',
      itemId: id,
      projectId: id,
      projectCode: val(mapped, 'project_code') || val(mapped, 'kissflow_id'),
      assigneeEmail: email,
    })
  })
  return okMessage(res, 'Project created', mapped, 201)
})

projectsRouter.post('/:id/reopen', async (req, res) => {
  const id = Number(req.params.id)
  if (!req.user) return fail(res, 'Unauthorized', 401)
  const result = await reopenRecord({
    itemType: 'project',
    itemId: id,
    reason: String(req.body?.reason || ''),
    toStatus: req.body?.status ? String(req.body.status) : 'Open',
    user: req.user,
  })
  if (!result.ok) return fail(res, result.message, result.status)
  const mapped = mapProject(result.row, { reopen_count: result.reopen_count })
  return okMessage(res, 'Project re-opened', req.user ? await attachEditPolicy(req.user, 'project', mapped) : mapped)
})

projectsRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const existing = await get<Record<string, unknown>>(`SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL`, [id])
  if (!existing) return fail(res, 'Project not found', 404)
  if (!req.user) return fail(res, 'Unauthorized', 401)
  if (req.body?.status != null && isReopenAttempt(existing.status, req.body.status)) {
    return fail(res, 'Closed records must be re-opened with a reason. Use Re-open.', 422)
  }
  const filtered = await filterWritableUpdate({
    user: req.user,
    itemType: 'project',
    existing,
    body: req.body || {},
    writeFields: WRITE,
  })
  if (!filtered.ok) return fail(res, filtered.message, filtered.status, filtered.payload)
  if (filtered.unchanged) {
    const mapped = mapProject(existing)
    return okMessage(res, 'No changes', req.user ? await attachEditPolicy(req.user, 'project', mapped) : mapped)
  }
  const ts = now()
  const { fields, vals } = writeVals(filtered.body)
  const life = lifecycleFields(existing, filtered.body.status, req.user.id, ts)
  for (let i = 0; i < life.fields.length; i += 1) mergeWrite(fields, vals, life.fields[i], life.vals[i])
  if (!fields.length) return fail(res, 'No fields')
  await run(
    `UPDATE projects SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    [...vals, ts, id],
  )
  const after = await get<Record<string, unknown>>(`SELECT * FROM projects WHERE id = ?`, [id])
  const changes = diffRecords(existing, after || {})
  await recordRevision({ itemType: 'project', itemId: id, user: req.user, changes })
  if (changes.some((c) => c.field === 'end_date')) {
    await run(
      `INSERT INTO project_timeline_history (project_id, revised_end_date, changed_on, created_by_name, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, after?.end_date || null, now(), actorLabel(req.user), now()],
    )
  }
  await logAction({ userId: req.user?.id, actionType: 'update', itemType: 'project', itemId: id, meta: { changes } })
  const row = await get<Record<string, unknown>>(`SELECT * FROM projects WHERE id = ?`, [id])
  const mapped = mapProject(row || {})
  const statusChanged = req.body?.status != null || req.body?.rag != null
  notifyWorkflow({
    category: statusChanged ? 'status_change' : 'project_lifecycle',
    event: statusChanged ? 'status.changed' : 'project.updated',
    subject: `[PM] Project updated: ${val(mapped, 'name')}`,
    title: 'Project updated',
    intro: `${actorLabel(req.user)} updated this project.`,
    fields: [
      { label: 'Name', value: val(mapped, 'name') },
      { label: 'Status', value: val(mapped, 'status') },
      { label: 'RAG', value: val(mapped, 'rag') },
      { label: 'Owner', value: val(mapped, 'project_owner_name') },
      { label: 'End date', value: val(mapped, 'end_date') },
    ],
    ctaPath: `/projects/${id}`,
    itemType: 'project',
    itemId: id,
    projectId: id,
    projectCode: val(mapped, 'project_code') || val(mapped, 'kissflow_id'),
  })
  return okMessage(res, 'Project updated', req.user ? await attachEditPolicy(req.user, 'project', mapped) : mapped)
})

projectsRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!(await get(`SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL`, [id]))) {
    return fail(res, 'Project not found', 404)
  }
  const ts = now()
  const existingRow = await get<Record<string, unknown>>(`SELECT * FROM projects WHERE id = ?`, [id])
  await run(`UPDATE projects SET deleted_at = ?, deleted_by_user_id = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?`, [ts, req.user?.id ?? null, req.user?.id ?? null, ts, id])
  await recordDeleted({ itemType: 'project', itemId: id, user: req.user, row: existingRow })
  await logAction({ userId: req.user?.id, actionType: 'delete', itemType: 'project', itemId: id })
  notifyWorkflow({
    category: 'project_lifecycle',
    event: 'project.deleted',
    subject: `[PM] Project deleted: ${val(existingRow, 'name')}`,
    title: 'Project deleted',
    intro: `${actorLabel(req.user)} deleted a project.`,
    fields: [
      { label: 'Name', value: val(existingRow, 'name') },
      { label: 'Code', value: val(existingRow, 'project_code') },
    ],
    itemType: 'project',
    itemId: id,
    projectId: id,
    projectCode: val(existingRow, 'project_code'),
  })
  return okMessage(res, 'Project deleted')
})
