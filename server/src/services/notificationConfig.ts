import { all, get, run, now } from '../db/index.js'
import { mailConfigured } from './mail.js'
import { listOpsRecipientEmails } from './permissions.js'

export type EmailCategoryKey =
  | 'project_lifecycle'
  | 'task_lifecycle'
  | 'subtask_lifecycle'
  | 'assignment'
  | 'overdue'
  | 'status_change'

export type NotificationConfig = {
  email_notifications: Record<EmailCategoryKey, boolean>
  extra_ops_emails: string
  overdue_to_assignee: boolean
  workflow_to_ops_roles: boolean
}

const DEFAULT_CONFIG: NotificationConfig = {
  email_notifications: {
    project_lifecycle: true,
    task_lifecycle: true,
    subtask_lifecycle: true,
    assignment: true,
    overdue: true,
    status_change: true,
  },
  extra_ops_emails: '',
  overdue_to_assignee: true,
  workflow_to_ops_roles: true,
}

export const EMAIL_CATEGORIES: { key: EmailCategoryKey; label: string }[] = [
  { key: 'project_lifecycle', label: 'Project created / updated / deleted' },
  { key: 'task_lifecycle', label: 'Task created / updated / deleted' },
  { key: 'subtask_lifecycle', label: 'Subtask created / updated / deleted' },
  { key: 'assignment', label: 'Task / subtask assigned or reassigned' },
  { key: 'overdue', label: 'Overdue project / task / subtask digests' },
  { key: 'status_change', label: 'Status, RAG, or priority changes' },
]

function parseConfig(raw: unknown): NotificationConfig {
  let obj: Record<string, unknown> = {}
  if (typeof raw === 'string' && raw.trim()) {
    try { obj = JSON.parse(raw) as Record<string, unknown> } catch { obj = {} }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>
  }
  const toggles = (obj.email_notifications && typeof obj.email_notifications === 'object')
    ? obj.email_notifications as Record<string, unknown>
    : obj
  const en = { ...DEFAULT_CONFIG.email_notifications }
  for (const k of Object.keys(en) as EmailCategoryKey[]) {
    if (toggles[k] === false || toggles[k] === 0 || toggles[k] === '0') en[k] = false
    else if (toggles[k] === true || toggles[k] === 1 || toggles[k] === '1') en[k] = true
  }
  return {
    email_notifications: en,
    extra_ops_emails: String(obj.extra_ops_emails ?? ''),
    overdue_to_assignee: obj.overdue_to_assignee === false ? false : true,
    workflow_to_ops_roles: obj.workflow_to_ops_roles === false ? false : true,
  }
}

export async function getNotificationConfig(): Promise<NotificationConfig> {
  try {
    const row = await get<{ notification_config?: unknown }>(`SELECT notification_config FROM settings WHERE id = 1`)
    return parseConfig(row?.notification_config)
  } catch {
    return { ...DEFAULT_CONFIG, email_notifications: { ...DEFAULT_CONFIG.email_notifications } }
  }
}

export async function saveNotificationConfig(partial: Partial<NotificationConfig> & {
  email_notifications?: Partial<Record<EmailCategoryKey, boolean>>
}): Promise<NotificationConfig> {
  const current = await getNotificationConfig()
  const next: NotificationConfig = {
    email_notifications: { ...current.email_notifications, ...(partial.email_notifications || {}) },
    extra_ops_emails: partial.extra_ops_emails !== undefined ? String(partial.extra_ops_emails) : current.extra_ops_emails,
    overdue_to_assignee: partial.overdue_to_assignee !== undefined ? Boolean(partial.overdue_to_assignee) : current.overdue_to_assignee,
    workflow_to_ops_roles: partial.workflow_to_ops_roles !== undefined ? Boolean(partial.workflow_to_ops_roles) : current.workflow_to_ops_roles,
  }
  await run(`UPDATE settings SET notification_config = ?, updated_at = ? WHERE id = 1`, [JSON.stringify(next), now()])
  return next
}

export async function isEmailCategoryEnabled(category: EmailCategoryKey | string): Promise<boolean> {
  if (!mailConfigured()) return false
  const cfg = await getNotificationConfig()
  const key = category as EmailCategoryKey
  if (key in cfg.email_notifications) return Boolean(cfg.email_notifications[key])
  return true
}

export function splitEmails(raw: string): string[] {
  return raw.split(/[,;\n]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.includes('@'))
}

export async function resolveWorkflowRecipients(): Promise<string[]> {
  const cfg = await getNotificationConfig()
  const emails = new Set<string>()
  if (cfg.workflow_to_ops_roles) {
    for (const e of await listOpsRecipientEmails()) emails.add(e)
  }
  for (const e of splitEmails(cfg.extra_ops_emails)) emails.add(e)
  const row = await get<{ alert_email?: string | null }>(`SELECT alert_email FROM settings WHERE id = 1`)
  const fallback = String(row?.alert_email || '').trim().toLowerCase()
  if (fallback.includes('@')) emails.add(fallback)
  return [...emails]
}

export async function notificationAdminSnapshot() {
  const cfg = await getNotificationConfig()
  const settings = await get<{ alert_email?: string | null; site_name?: string }>(
    `SELECT alert_email, site_name FROM settings WHERE id = 1`,
  )
  const opsUsers = await all<{ id: number; email: string | null; first_name: string; last_name: string; username: string }>(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.username
    FROM users u
    WHERE u.deleted_at IS NULL AND u.activated = 1
      AND (
        CAST(u.permissions AS CHAR) LIKE '%"notify.ops"%'
        OR CAST(u.permissions AS CHAR) LIKE '%"superuser"%'
        OR CAST(u.permissions AS CHAR) LIKE '%"admin"%'
      )
    ORDER BY u.first_name, u.last_name
  `)
  return {
    smtp_configured: mailConfigured(),
    smtp_hint: mailConfigured()
      ? 'SMTP is configured via server environment (SMTP_HOST / SMTP_USER).'
      : 'SMTP is not configured. Set SMTP_USER / SMTP_PASS in server/.env',
    alert_email: settings?.alert_email || null,
    site_name: settings?.site_name || 'Project Management',
    config: cfg,
    ops_users: opsUsers.map((u) => ({
      id: u.id,
      name: `${u.first_name} ${u.last_name}`.trim() || u.username,
      email: u.email,
    })),
    resolved_ops_emails: await resolveWorkflowRecipients(),
    categories: EMAIL_CATEGORIES,
    triggers: [
      { key: 'project.created', category: 'project_lifecycle', label: 'Project created' },
      { key: 'project.updated', category: 'project_lifecycle', label: 'Project updated' },
      { key: 'project.deleted', category: 'project_lifecycle', label: 'Project deleted' },
      { key: 'task.created', category: 'task_lifecycle', label: 'Task created' },
      { key: 'task.updated', category: 'task_lifecycle', label: 'Task updated' },
      { key: 'task.assigned', category: 'assignment', label: 'Task assigned' },
      { key: 'task.overdue', category: 'overdue', label: 'Task overdue' },
      { key: 'subtask.created', category: 'subtask_lifecycle', label: 'Subtask created' },
      { key: 'subtask.updated', category: 'subtask_lifecycle', label: 'Subtask updated' },
      { key: 'subtask.assigned', category: 'assignment', label: 'Subtask assigned' },
      { key: 'subtask.overdue', category: 'overdue', label: 'Subtask overdue' },
      { key: 'status.changed', category: 'status_change', label: 'Status / RAG change' },
    ],
  }
}
