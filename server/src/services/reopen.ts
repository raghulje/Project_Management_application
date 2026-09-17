import { get, run, now } from '../db/index.js'
import { logAction } from './actionLog.js'
import { actorLabel, notifyWorkflow, val } from './notify.js'
import { recordRevision, reopenCounts } from './revisions.js'

export type ReopenItemType = 'project' | 'task' | 'subtask'

const TABLES: Record<ReopenItemType, string> = {
  project: 'projects',
  task: 'tasks',
  subtask: 'subtasks',
}

export function isClosedStatus(status: unknown) {
  const s = String(status || '').toLowerCase()
  return s.includes('closed') || s.includes('complete') || s.includes('cancel') || s === 'done'
}

export function isReopenAttempt(fromStatus: unknown, toStatus: unknown) {
  return isClosedStatus(fromStatus) && !isClosedStatus(toStatus)
}

export async function reopenRecord(opts: {
  itemType: ReopenItemType
  itemId: number
  reason: string
  toStatus?: string
  user?: { id?: number; first_name?: string; last_name?: string; username?: string; email?: string | null } | null
}) {
  const reason = String(opts.reason || '').trim()
  if (!reason) return { ok: false as const, status: 422, message: 'Reason is required to re-open this record' }
  const table = TABLES[opts.itemType]
  const existing = await get<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`, [opts.itemId])
  if (!existing) return { ok: false as const, status: 404, message: `${opts.itemType} not found` }
  if (!isClosedStatus(existing.status)) {
    return { ok: false as const, status: 422, message: 'Only closed, completed, or cancelled records can be re-opened' }
  }
  const toStatus = String(opts.toStatus || 'Open').trim() || 'Open'
  if (isClosedStatus(toStatus)) {
    return { ok: false as const, status: 422, message: 'Re-open status must be an open state' }
  }
  const counts = await reopenCounts(opts.itemType, [opts.itemId])
  const prev = counts.get(opts.itemId) || 0
  const next = prev + 1
  const fromStatus = String(existing.status || 'Closed')
  await run(
    `UPDATE ${table} SET status = ?, updated_at = ? WHERE id = ?`,
    [toStatus, now(), opts.itemId],
  )
  await recordRevision({
    itemType: opts.itemType,
    itemId: opts.itemId,
    user: opts.user,
    changes: [
      { field: 'status', label: 'Status', from: fromStatus, to: toStatus },
      { field: 'reopen_count', label: 'Re-opened', from: prev ? `${prev}x` : '—', to: `${next}x` },
      { field: 'reopen_reason', label: 'Re-open reason', from: '—', to: reason },
    ],
  })
  await logAction({
    userId: opts.user?.id,
    actionType: 'reopen',
    itemType: opts.itemType,
    itemId: opts.itemId,
    meta: { reason, from: fromStatus, to: toStatus, reopen_count: next },
  })
  const row = await get<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ?`, [opts.itemId])
  notifyWorkflow({
    category: 'status_change',
    event: `${opts.itemType}.reopened`,
    subject: `[PM] ${opts.itemType} re-opened: ${val(row, 'name')}`,
    title: `${opts.itemType[0].toUpperCase()}${opts.itemType.slice(1)} re-opened`,
    intro: `${actorLabel(opts.user)} re-opened this ${opts.itemType}.`,
    fields: [
      { label: 'Name', value: val(row, 'name') },
      { label: 'Status', value: toStatus },
      { label: 'Re-opened', value: `${next}x` },
      { label: 'Reason', value: reason },
    ],
    ctaPath: `/${opts.itemType}s/${opts.itemId}`,
    itemType: opts.itemType,
    itemId: opts.itemId,
    projectId: opts.itemType === 'project' ? opts.itemId : (row?.project_id != null ? Number(row.project_id) : null),
    taskId: opts.itemType === 'task' ? opts.itemId : (row?.task_id != null ? Number(row.task_id) : null),
    subtaskId: opts.itemType === 'subtask' ? opts.itemId : null,
  })
  return { ok: true as const, row: row || existing, reopen_count: next }
}
