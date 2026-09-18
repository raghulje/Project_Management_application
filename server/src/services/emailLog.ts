import { all, get, run } from '../db/index.js'

export type EmailLogStatus = 'queued' | 'sent' | 'failed' | 'skipped'

export type EmailLogInput = {
  emailType: string
  status?: EmailLogStatus
  projectId?: number | null
  taskId?: number | null
  subtaskId?: number | null
  relatedId?: number | null
  projectCode?: string | null
  taskCode?: string | null
  toAddresses?: string | string[]
  ccAddresses?: string | string[] | null
  subject?: string
  messageId?: string | null
  errorMessage?: string | null
  meta?: Record<string, unknown> | null
}

function joinEmails(list: string | string[] | null | undefined) {
  if (!list) return ''
  if (typeof list === 'string') return list
  return [...new Set(list.filter(Boolean))].join(', ')
}

export async function createEmailLog(input: EmailLogInput) {
  const info = await run(
    `INSERT INTO email_logs
      (email_type, status, project_id, task_id, subtask_id, related_id, project_code, task_code,
       to_addresses, cc_addresses, subject, message_id, error_message, meta_json, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(input.emailType || 'generic').slice(0, 64),
      input.status || 'queued',
      input.projectId || null,
      input.taskId || null,
      input.subtaskId || null,
      input.relatedId || null,
      input.projectCode || null,
      input.taskCode || null,
      joinEmails(input.toAddresses) || '(none)',
      joinEmails(input.ccAddresses) || null,
      String(input.subject || '').slice(0, 500),
      input.messageId || null,
      input.errorMessage || null,
      input.meta ? JSON.stringify(input.meta) : null,
      input.status === 'sent' ? new Date() : null,
    ],
  )
  return Number(info.insertId)
}

export async function updateEmailLog(id: number, patch: {
  status?: EmailLogStatus
  messageId?: string | null
  errorMessage?: string | null
  toAddresses?: string | string[]
}) {
  const sets: string[] = []
  const vals: unknown[] = []
  if (patch.status) {
    sets.push('status = ?')
    vals.push(patch.status)
    if (patch.status === 'sent') sets.push('sent_at = NOW()')
  }
  if (patch.messageId !== undefined) { sets.push('message_id = ?'); vals.push(patch.messageId) }
  if (patch.errorMessage !== undefined) { sets.push('error_message = ?'); vals.push(patch.errorMessage) }
  if (patch.toAddresses !== undefined) { sets.push('to_addresses = ?'); vals.push(joinEmails(patch.toAddresses)) }
  if (!sets.length) return
  vals.push(id)
  await run(`UPDATE email_logs SET ${sets.join(', ')} WHERE id = ?`, vals)
}

export async function listEmailLogs(q: {
  status?: string
  emailType?: string
  search?: string
  projectId?: number
  page?: number
  limit?: number
}) {
  const where = ['1=1']
  const params: unknown[] = []
  if (q.status) { where.push('status = ?'); params.push(q.status) }
  if (q.emailType) { where.push('email_type = ?'); params.push(q.emailType) }
  if (q.projectId) { where.push('project_id = ?'); params.push(q.projectId) }
  if (q.search) {
    where.push('(subject LIKE ? OR to_addresses LIKE ? OR project_code LIKE ? OR task_code LIKE ?)')
    const like = `%${q.search}%`
    params.push(like, like, like, like)
  }
  const limit = Math.min(Number(q.limit) || 50, 200)
  const page = Math.max(Number(q.page) || 1, 1)
  const offset = (page - 1) * limit
  const totalRow = await get<{ c: number }>(
    `SELECT COUNT(*) as c FROM email_logs WHERE ${where.join(' AND ')}`,
    params,
  )
  const rows = await all<Record<string, unknown>>(
    `SELECT * FROM email_logs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  )
  return { rows, total: Number(totalRow?.c || 0), page, limit }
}

export async function listEmailLogTypes() {
  const rows = await all<{ email_type: string }>(
    `SELECT DISTINCT email_type FROM email_logs WHERE email_type IS NOT NULL AND email_type != '' ORDER BY email_type ASC`,
  )
  return rows.map((r) => String(r.email_type))
}

export async function getEmailLog(id: number) {
  return get<Record<string, unknown>>(`SELECT * FROM email_logs WHERE id = ?`, [id])
}
