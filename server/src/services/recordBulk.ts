import { all, get, run, now } from '../db/index.js'
import type { AuthUser } from '../middleware/auth.js'
import { logAction } from './actionLog.js'
import { filterWritableUpdate } from './fieldAccess.js'
import { PROJECT_TEMPLATE, TASK_TEMPLATE, SUBTASK_TEMPLATE, type RecordImportKind } from './recordImport.js'
import { projectRowVisible, resolveVisibility, subtaskRowVisible, taskRowVisible, visibilitySql } from './recordVisibility.js'
import { isClosedStatus, isReopenAttempt } from './reopen.js'
import { lifecycleFields, mergeWrite } from './recordIdentity.js'
import { diffRecords, recordRevision } from './revisions.js'

const TABLE: Record<RecordImportKind, string> = {
  project: 'projects',
  task: 'tasks',
  subtask: 'subtasks',
}

const STATUS_OPTS = new Set(['Open', 'In Progress', 'On Hold', 'Completed', 'Closed', 'Cancelled'])
const PRIORITY_OPTS = new Set(['High', 'Medium', 'Low'])
const WRITE = ['status', 'priority'] as const

export type BulkUpdateSummary = {
  total: number
  updated: number
  skipped: number
  errors: Array<{ id: number; message: string }>
}

function csvCell(value: unknown) {
  if (value == null || value === '') return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function uniqIds(raw: unknown, max: number) {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(',')
  const ids = [...new Set(list.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))]
  return ids.slice(0, max)
}

async function resolveIds(kind: RecordImportKind, rawIds: unknown, rawRefs: unknown, max: number) {
  const ids = new Set(uniqIds(rawIds, max))
  const refs = (Array.isArray(rawRefs) ? rawRefs : String(rawRefs || '').split(','))
    .map((v) => String(v || '').trim())
    .filter(Boolean)
  const table = TABLE[kind]
  for (const ref of refs) {
    if (ids.size >= max) break
    const n = Number(ref)
    if (Number.isInteger(n) && n > 0) {
      ids.add(n)
      continue
    }
    const codeCol = kind === 'project' ? 'project_code' : kind === 'task' ? 'task_code' : 'subtask_code'
    const row = await get<{ id: number }>(
      `SELECT id FROM ${table} WHERE deleted_at IS NULL AND (kissflow_id = ? OR ${codeCol} = ? OR LOWER(TRIM(name)) = LOWER(?)) LIMIT 1`,
      [ref, ref, ref],
    )
    if (row?.id) ids.add(Number(row.id))
  }
  return [...ids].slice(0, max)
}

function rowVisible(kind: RecordImportKind, scope: Awaited<ReturnType<typeof resolveVisibility>>, row: Record<string, unknown>) {
  if (kind === 'project') return projectRowVisible(scope, row)
  if (kind === 'task') return taskRowVisible(scope, row)
  return subtaskRowVisible(scope, row)
}

function exportHeaders(kind: RecordImportKind) {
  if (kind === 'project') return ['id', ...PROJECT_TEMPLATE]
  if (kind === 'task') return ['id', ...TASK_TEMPLATE]
  return ['id', ...SUBTASK_TEMPLATE]
}

function exportSql(kind: RecordImportKind, ids: number[]) {
  const ph = ids.map(() => '?').join(',')
  if (kind === 'task') {
    return {
      sql: `SELECT t.*, p.name as project_name, p.project_code as project_code
        FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.deleted_at IS NULL AND t.id IN (${ph})`,
      params: ids,
    }
  }
  if (kind === 'subtask') {
    return {
      sql: `SELECT s.*, t.name as task_name, t.task_code as task_code
        FROM subtasks s LEFT JOIN tasks t ON t.id = s.task_id
        WHERE s.deleted_at IS NULL AND s.id IN (${ph})`,
      params: ids,
    }
  }
  return {
    sql: `SELECT * FROM projects WHERE deleted_at IS NULL AND id IN (${ph})`,
    params: ids,
  }
}

export async function exportRecordsCsv(kind: RecordImportKind, user: AuthUser | undefined, rawIds: unknown) {
  const vis = await resolveVisibility(user)
  let ids = uniqIds(rawIds, 2000)
  if (!ids.length) {
    const table = TABLE[kind]
    const clause = visibilitySql(vis, kind)
    const rows = await all<{ id: number }>(
      `SELECT id FROM ${table} WHERE deleted_at IS NULL${clause.sql} ORDER BY id DESC LIMIT 2000`,
      clause.params,
    )
    ids = rows.map((r) => Number(r.id))
  }
  if (!ids.length) return '\uFEFF' + exportHeaders(kind).join(',') + '\n'

  const q = exportSql(kind, ids)
  const rows = await all<Record<string, unknown>>(q.sql, q.params)
  const headers = exportHeaders(kind)
  const lines = [headers.join(',')]
  for (const row of rows) {
    if (!vis.unrestricted && !rowVisible(kind, vis, row)) continue
    lines.push(headers.map((h) => csvCell(row[h])).join(','))
  }
  return `\uFEFF${lines.join('\n')}\n`
}

export async function bulkUpdateRecords(
  kind: RecordImportKind,
  user: AuthUser,
  rawIds: unknown,
  patch: { status?: unknown; priority?: unknown; refs?: unknown },
): Promise<BulkUpdateSummary> {
  const ids = await resolveIds(kind, rawIds, patch.refs, 200)
  const body: Record<string, unknown> = {}
  if (patch.status != null && String(patch.status).trim()) {
    const status = String(patch.status).trim()
    if (!STATUS_OPTS.has(status)) throw new Error('Invalid status')
    body.status = status
  }
  if (patch.priority != null && String(patch.priority).trim()) {
    const priority = String(patch.priority).trim()
    if (!PRIORITY_OPTS.has(priority)) throw new Error('Invalid priority')
    body.priority = priority
  }
  if (!Object.keys(body).length) throw new Error('Choose a status or priority to update')
  if (!ids.length) throw new Error('Select at least one record')

  const vis = await resolveVisibility(user)
  const table = TABLE[kind]
  const summary: BulkUpdateSummary = { total: ids.length, updated: 0, skipped: 0, errors: [] }
  const ts = now()

  for (const id of ids) {
    try {
      const existing = await get<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`, [id])
      if (!existing) {
        summary.skipped += 1
        summary.errors.push({ id, message: 'Not found' })
        continue
      }
      if (!vis.unrestricted && !rowVisible(kind, vis, existing)) {
        summary.skipped += 1
        summary.errors.push({ id, message: 'No access' })
        continue
      }
      if (body.status != null && isReopenAttempt(existing.status, body.status)) {
        summary.skipped += 1
        summary.errors.push({ id, message: 'Closed records must be re-opened with a reason' })
        continue
      }
      if (body.status != null && isClosedStatus(existing.status) && isClosedStatus(body.status)) {
        summary.skipped += 1
        continue
      }
      const filtered = await filterWritableUpdate({
        user,
        itemType: kind,
        existing,
        body,
        writeFields: WRITE,
      })
      if (!filtered.ok) {
        summary.skipped += 1
        summary.errors.push({ id, message: filtered.message })
        continue
      }
      if (filtered.unchanged || !Object.keys(filtered.body).length) {
        summary.skipped += 1
        continue
      }
      const fields = Object.keys(filtered.body)
      const vals = fields.map((f) => filtered.body[f] ?? null)
      const life = lifecycleFields(existing, filtered.body.status, user.id, ts)
      for (let i = 0; i < life.fields.length; i += 1) mergeWrite(fields, vals, life.fields[i], life.vals[i])
      await run(
        `UPDATE ${table} SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        [...vals, ts, id],
      )
      const after = await get<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ?`, [id])
      const changes = diffRecords(existing, after || {}, Object.keys(filtered.body))
      await recordRevision({ itemType: kind, itemId: id, user, action: 'bulk_update', changes })
      summary.updated += 1
    } catch (e) {
      summary.skipped += 1
      summary.errors.push({ id, message: e instanceof Error ? e.message : 'Update failed' })
    }
  }

  await logAction({
    userId: user.id,
    actionType: 'bulk_update',
    itemType: kind,
    itemId: 0,
    note: `${body.status || body.priority || 'update'}: ${summary.updated} updated`,
    meta: { ...summary, patch: body },
  })
  return summary
}
