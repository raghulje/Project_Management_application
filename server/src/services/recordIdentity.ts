import { get } from '../db/index.js'
import { isClosedStatus } from './reopen.js'

export type RecordKind = 'project' | 'task' | 'subtask'
export type RecordSource = 'local' | 'import' | 'legacy'

const TABLE: Record<RecordKind, string> = {
  project: 'projects',
  task: 'tasks',
  subtask: 'subtasks',
}

const CODE_COL: Record<RecordKind, string> = {
  project: 'project_code',
  task: 'task_code',
  subtask: 'subtask_code',
}

const PREFIX: Record<RecordKind, string> = {
  project: 'PRJ',
  task: 'TSK',
  subtask: 'SUB',
}

function blank(v: unknown) {
  return v == null || String(v).trim() === ''
}

export function codeColumn(kind: RecordKind) {
  return CODE_COL[kind]
}

export async function nextRecordCode(kind: RecordKind) {
  const table = TABLE[kind]
  const col = CODE_COL[kind]
  const year = new Date().getFullYear()
  const prefix = `${PREFIX[kind]}-${year}-`
  const row = await get<{ n: number | null }>(`
    SELECT MAX(CAST(SUBSTRING_INDEX(${col}, '-', -1) AS UNSIGNED)) as n
    FROM ${table}
    WHERE ${col} LIKE ?
  `, [`${prefix}%`]).catch(() => ({ n: 0 }))
  const next = Number(row?.n || 0) + 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

/** Local create/import: own business code, our source flag. Kissflow id is legacy-only. */
export async function prepareCreateBody(
  kind: RecordKind,
  body: Record<string, unknown>,
  source: RecordSource = 'local',
) {
  const next: Record<string, unknown> = { ...body, source }
  if (source === 'local' || blank(next.kissflow_id)) delete next.kissflow_id
  const col = CODE_COL[kind]
  if (blank(next[col])) next[col] = await nextRecordCode(kind)
  if (blank(next.status)) next.status = 'Open'
  return next
}

export function lifecycleFields(
  existing: Record<string, unknown> | null,
  nextStatus: unknown,
  userId: number | null,
  ts: string,
  opts?: { deleting?: boolean },
) {
  const fields: string[] = ['updated_by_user_id']
  const vals: unknown[] = [userId]
  if (opts?.deleting) {
    fields.push('deleted_by_user_id')
    vals.push(userId)
    return { fields, vals }
  }
  if (nextStatus != null) {
    const closing = isClosedStatus(nextStatus)
    const wasClosed = existing ? isClosedStatus(existing.status) : false
    if (closing && !wasClosed) {
      fields.push('closed_at', 'closed_by_user_id')
      vals.push(ts, userId)
    } else if (!closing && wasClosed) {
      fields.push('closed_at', 'closed_by_user_id')
      vals.push(null, null)
    }
  }
  return { fields, vals }
}

export function mergeWrite(fields: string[], vals: unknown[], col: string, val: unknown) {
  const i = fields.indexOf(col)
  if (i >= 0) {
    vals[i] = val
    return
  }
  fields.push(col)
  vals.push(val)
}

export function stampCreateWrite(
  fields: string[],
  vals: unknown[],
  body: Record<string, unknown>,
  userId: number | null,
  ts: string,
) {
  mergeWrite(fields, vals, 'source', body.source || 'local')
  if (body.project_code != null) mergeWrite(fields, vals, 'project_code', body.project_code)
  if (body.task_code != null) mergeWrite(fields, vals, 'task_code', body.task_code)
  if (body.subtask_code != null) mergeWrite(fields, vals, 'subtask_code', body.subtask_code)
  if (isClosedStatus(body.status)) {
    mergeWrite(fields, vals, 'closed_at', ts)
    mergeWrite(fields, vals, 'closed_by_user_id', userId)
  }
}
