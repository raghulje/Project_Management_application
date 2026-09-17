import { get, run, now } from '../db/index.js'
import { sendMail } from './mail.js'
import { mailConfigured } from './mail.js'
import { isEmailCategoryEnabled, resolveWorkflowRecipients, getNotificationConfig, notificationsEnabled, type EmailCategoryKey } from './notificationConfig.js'
import { createEmailLog, updateEmailLog } from './emailLog.js'

function appBase() {
  return (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:5174').replace(/\/$/, '')
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type NotifyField = { label: string; value: string }

export function brandedEmail(opts: {
  title: string
  intro: string
  fields: NotifyField[]
  ctaLabel?: string
  ctaUrl?: string
  footerNote?: string
}) {
  const rows = opts.fields
    .filter((f) => f.value != null && String(f.value).trim() !== '')
    .map((f) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e8eef2;color:#64748b;font-size:13px;width:34%;vertical-align:top;">${escapeHtml(f.label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e8eef2;color:#0f172a;font-size:14px;font-weight:600;">${escapeHtml(f.value)}</td>
      </tr>`)
    .join('')

  const cta = opts.ctaUrl
    ? `<p style="margin:24px 0 8px;">
        <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:#1e88e5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:14px;">
          ${escapeHtml(opts.ctaLabel || 'Open record')}
        </a>
      </p>`
    : ''

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#edf1ff;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf1ff;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:620px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:linear-gradient(135deg,#1e88e5,#1565c0);padding:22px 24px;color:#fff;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">Refex Project Management</div>
          <div style="font-size:22px;font-weight:750;margin-top:6px;">${escapeHtml(opts.title)}</div>
        </td></tr>
        <tr><td style="padding:22px 24px 8px;color:#334155;font-size:15px;line-height:1.55;">
          ${escapeHtml(opts.intro)}
        </td></tr>
        <tr><td style="padding:0 24px 8px;">
          <table role="presentation" width="100%" style="border:1px solid #e8eef2;border-radius:10px;border-collapse:collapse;overflow:hidden;">
            ${rows}
          </table>
          ${cta}
          <p style="margin:18px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;">
            ${escapeHtml(opts.footerNote || 'You received this because of your role in Refex Project Management.')}
          </p>
        </td></tr>
        <tr><td style="padding:16px 24px 22px;color:#94a3b8;font-size:11px;">${escapeHtml(appBase())}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const text = [
    opts.title, '', opts.intro, '',
    ...opts.fields.filter((f) => f.value).map((f) => `${f.label}: ${f.value}`),
    opts.ctaUrl ? `\n${opts.ctaLabel || 'Open'}: ${opts.ctaUrl}` : '',
  ].join('\n')
  return { html, text }
}

async function logDedup(kind: string, itemType: string, itemId: number) {
  try {
    const day = now().slice(0, 10)
    await run(
      `INSERT IGNORE INTO notification_log (kind, item_type, item_id, notified_on, created_at) VALUES (?, ?, ?, ?, ?)`,
      [kind, itemType, itemId, day, now()],
    )
  } catch { /* non-fatal */ }
}

export type WorkflowNotifyInput = {
  category: EmailCategoryKey
  event: string
  subject: string
  title: string
  intro: string
  fields: NotifyField[]
  ctaPath?: string
  itemType?: string
  itemId?: number
  projectId?: number | null
  taskId?: number | null
  subtaskId?: number | null
  projectCode?: string | null
  taskCode?: string | null
  assigneeEmail?: string | null
  extraTo?: string[]
  skipOps?: boolean
  ctaLabel?: string
}

export function notifyWorkflow(input: WorkflowNotifyInput) {
  if (!notificationsEnabled()) return
  void (async () => {
    const to: string[] = []
    try {
      const enabled = await isEmailCategoryEnabled(input.category)
      if (input.assigneeEmail?.includes('@')) to.push(input.assigneeEmail)
      for (const extra of input.extraTo || []) {
        if (String(extra).includes('@')) to.push(String(extra))
      }
      if (!input.skipOps) {
        const ops = enabled ? await resolveWorkflowRecipients() : []
        to.push(...ops)
      }
      const unique = [...new Set(to.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')))]
      const { html, text } = brandedEmail({
        title: input.title,
        intro: input.intro,
        fields: input.fields,
        ctaLabel: input.ctaLabel || 'View record',
        ctaUrl: input.ctaPath ? `${appBase()}${input.ctaPath.startsWith('/') ? '' : '/'}${input.ctaPath}` : appBase(),
      })

      if (!unique.length || !enabled || !mailConfigured()) {
        await createEmailLog({
          emailType: input.event,
          status: !mailConfigured() ? 'skipped' : 'skipped',
          projectId: input.projectId,
          taskId: input.taskId,
          subtaskId: input.subtaskId,
          relatedId: input.itemId,
          projectCode: input.projectCode,
          taskCode: input.taskCode,
          toAddresses: unique,
          subject: input.subject,
          errorMessage: !mailConfigured() ? 'SMTP not configured' : (!enabled ? 'Category disabled' : 'No recipients'),
          meta: { category: input.category },
        })
        return
      }

      const logId = await createEmailLog({
        emailType: input.event,
        status: 'queued',
        projectId: input.projectId,
        taskId: input.taskId,
        subtaskId: input.subtaskId,
        relatedId: input.itemId,
        projectCode: input.projectCode,
        taskCode: input.taskCode,
        toAddresses: unique,
        subject: input.subject,
        meta: { category: input.category, title: input.title },
      })

      const errors: string[] = []
      for (const dest of unique) {
        try {
          await sendMail({ to: dest, subject: input.subject, html, text })
        } catch (e) {
          errors.push(`${dest}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      await updateEmailLog(logId, {
        status: errors.length === unique.length ? 'failed' : 'sent',
        errorMessage: errors.length ? errors.join('; ') : null,
      })

      if (input.itemType && input.itemId) await logDedup(input.event, input.itemType, input.itemId)
    } catch (e) {
      console.warn('[notify] workflow failed', input.event, e)
    }
  })()
}

export async function resolvePersonEmail(nameOrEmail?: string | null, employeeId?: number | null): Promise<string | null> {
  if (employeeId) {
    const row = await get<{ email?: string | null }>(`SELECT email FROM employees WHERE id = ? AND deleted_at IS NULL`, [employeeId])
    const e = String(row?.email || '').trim()
    if (e.includes('@')) return e
  }
  const raw = String(nameOrEmail || '').trim()
  if (raw.includes('@')) return raw
  if (raw) {
    const row = await get<{ email?: string | null }>(
      `SELECT email FROM employees WHERE deleted_at IS NULL AND (name = ? OR email = ?) LIMIT 1`,
      [raw, raw],
    )
    const e = String(row?.email || '').trim()
    if (e.includes('@')) return e
  }
  return null
}

export function actorLabel(user?: { first_name?: string; last_name?: string; email?: string | null; username?: string } | null) {
  if (!user) return 'System'
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim()
  return name || user.username || user.email || 'Admin'
}

export function val(row: Record<string, unknown> | null | undefined, key: string, fallback = '') {
  if (!row) return fallback
  const v = row[key]
  return v == null || v === '' ? fallback : String(v)
}

export async function alreadyNotifiedToday(kind: string, itemType: string, itemId: number) {
  const day = now().slice(0, 10)
  const row = await get(`SELECT id FROM notification_log WHERE kind = ? AND item_type = ? AND item_id = ? AND notified_on = ?`, [
    kind, itemType, itemId, day,
  ])
  return Boolean(row)
}

export async function isOverdueAssigneeEnabled() {
  const cfg = await getNotificationConfig()
  return cfg.overdue_to_assignee
}
