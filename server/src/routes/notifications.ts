import { Router } from 'express'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { requirePerm } from '../services/permissions.js'
import { notificationAdminSnapshot, saveNotificationConfig } from '../services/notificationConfig.js'
import { run } from '../db/index.js'
import { now } from '../db/index.js'
import { getEmailLog, listEmailLogs } from '../services/emailLog.js'
import { brandedEmail } from '../services/notify.js'
import { runOverdueAlerts } from '../services/overdueAlerts.js'
import { sendMail } from '../services/mail.js'
import { updateEmailLog } from '../services/emailLog.js'

export const notificationsRouter = Router()

notificationsRouter.get('/settings/notifications', requirePerm('settings.view'), async (_req, res) => {
  return okItem(res, await notificationAdminSnapshot())
})

notificationsRouter.put('/settings/notifications', requirePerm('settings.edit'), async (req, res) => {
  const b = req.body || {}
  if (b.alert_email !== undefined) {
    await run(`UPDATE settings SET alert_email = ?, updated_at = ? WHERE id = 1`, [
      b.alert_email || null,
      now(),
    ])
  }
  await saveNotificationConfig({
    email_notifications: b.email_notifications,
    extra_ops_emails: b.extra_ops_emails,
    overdue_to_assignee: b.overdue_to_assignee,
    workflow_to_ops_roles: b.workflow_to_ops_roles,
  })
  return okMessage(res, 'Notification settings saved', await notificationAdminSnapshot())
})

notificationsRouter.post('/notifications/overdue/run', requirePerm('settings.edit'), async (_req, res) => {
  const result = await runOverdueAlerts()
  return okMessage(res, `Queued ${result.sent} overdue alert(s)`, result)
})

notificationsRouter.get('/admin/email-logs', requirePerm('settings.view'), async (req, res) => {
  const data = await listEmailLogs({
    status: String(req.query.status || ''),
    emailType: String(req.query.emailType || req.query.email_type || ''),
    search: String(req.query.search || ''),
    projectId: req.query.projectId ? Number(req.query.projectId) : undefined,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 50,
  })
  return okList(res, data.rows, data.total)
})

notificationsRouter.post('/admin/email-logs/:id/retrigger', requirePerm('settings.edit'), async (req, res) => {
  const log = await getEmailLog(Number(req.params.id))
  if (!log) return fail(res, 'Email log not found', 404)
  const extra = String(req.body?.extraTo || '').split(/[,;\n]+/).map((s) => s.trim()).filter((s) => s.includes('@'))
  const original = String(log.to_addresses || '').split(/[,;\n]+/).map((s) => s.trim()).filter((s) => s.includes('@'))
  const to = [...new Set([...original, ...extra])]
  if (!to.length) return fail(res, 'No recipients')
  const meta = typeof log.meta_json === 'string' ? JSON.parse(log.meta_json || '{}') : (log.meta_json || {})
  const { html, text } = brandedEmail({
    title: String(meta.title || log.email_type || 'Notification'),
    intro: 'Retriggered from email logs.',
    fields: [
      { label: 'Type', value: String(log.email_type || '') },
      { label: 'Project', value: String(log.project_code || '') },
      { label: 'Task', value: String(log.task_code || '') },
    ],
    ctaLabel: 'Open app',
  })
  const errors: string[] = []
  for (const dest of to) {
    try {
      await sendMail({ to: dest, subject: String(log.subject || '[PM] Retrigger'), html, text })
    } catch (e) {
      errors.push(`${dest}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  await updateEmailLog(Number(log.id), {
    status: errors.length === to.length ? 'failed' : 'sent',
    errorMessage: errors.length ? errors.join('; ') : null,
    toAddresses: to,
  })
  return okMessage(res, errors.length ? 'Retrigger completed with errors' : 'Email retriggered', {
    to,
    errors,
  })
})
