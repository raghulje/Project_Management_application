import { all } from '../db/index.js'
import { alreadyNotifiedToday, isOverdueAssigneeEnabled, notifyWorkflow, resolvePersonEmail, val } from './notify.js'
import { isEmailCategoryEnabled } from './notificationConfig.js'

export async function runOverdueAlerts() {
  if (!(await isEmailCategoryEnabled('overdue'))) {
    return { sent: 0, skipped: 0, reason: 'overdue category disabled or SMTP off' }
  }
  const notifyAssignee = await isOverdueAssigneeEnabled()
  let sent = 0
  let skipped = 0

  const tasks = await all<Record<string, unknown>>(`
    SELECT t.*, p.name as project_name, p.project_code, p.id as project_db_id
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.deleted_at IS NULL
      AND t.end_date IS NOT NULL AND t.end_date < CURDATE()
      AND t.status NOT IN ('Completed','Closed','Cancelled','Done')
  `)
  for (const t of tasks) {
    const id = Number(t.id)
    if (await alreadyNotifiedToday('task.overdue', 'task', id)) { skipped += 1; continue }
    const assignee = notifyAssignee
      ? await resolvePersonEmail(val(t, 'assigned_to_name'), t.assigned_to_employee_id as number | null)
      : null
    notifyWorkflow({
      category: 'overdue',
      event: 'task.overdue',
      subject: `[PM] Overdue task: ${val(t, 'task_code') || val(t, 'name')}`,
      title: 'Task is overdue',
      intro: `${val(t, 'name')} is past its end date and still open.`,
      fields: [
        { label: 'Task', value: val(t, 'name') },
        { label: 'Code', value: val(t, 'task_code') },
        { label: 'Project', value: val(t, 'project_name') },
        { label: 'Assignee', value: val(t, 'assigned_to_name') },
        { label: 'Due', value: val(t, 'end_date') },
        { label: 'Status', value: val(t, 'status') },
      ],
      ctaPath: `/tasks/${id}`,
      itemType: 'task',
      itemId: id,
      projectId: t.project_id != null ? Number(t.project_id) : null,
      taskId: id,
      projectCode: val(t, 'project_code') || null,
      taskCode: val(t, 'task_code') || null,
      assigneeEmail: assignee,
    })
    sent += 1
  }

  const subs = await all<Record<string, unknown>>(`
    SELECT s.*, t.name as task_name, t.task_code, p.name as project_name, p.project_code, t.project_id
    FROM subtasks s
    LEFT JOIN tasks t ON t.id = s.task_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE s.deleted_at IS NULL
      AND s.end_date IS NOT NULL AND s.end_date < CURDATE()
      AND s.status NOT IN ('Completed','Closed','Cancelled','Done')
  `)
  for (const s of subs) {
    const id = Number(s.id)
    if (await alreadyNotifiedToday('subtask.overdue', 'subtask', id)) { skipped += 1; continue }
    const assignee = notifyAssignee
      ? await resolvePersonEmail(val(s, 'assigned_to_name'), s.assigned_to_employee_id as number | null)
      : null
    notifyWorkflow({
      category: 'overdue',
      event: 'subtask.overdue',
      subject: `[PM] Overdue subtask: ${val(s, 'name')}`,
      title: 'Subtask is overdue',
      intro: `${val(s, 'name')} is past its end date and still open.`,
      fields: [
        { label: 'Subtask', value: val(s, 'name') },
        { label: 'Task', value: val(s, 'task_name') },
        { label: 'Project', value: val(s, 'project_name') },
        { label: 'Assignee', value: val(s, 'assigned_to_name') },
        { label: 'Due', value: val(s, 'end_date') },
        { label: 'Status', value: val(s, 'status') },
      ],
      ctaPath: `/subtasks/${id}`,
      itemType: 'subtask',
      itemId: id,
      projectId: s.project_id != null ? Number(s.project_id) : null,
      taskId: s.task_id != null ? Number(s.task_id) : null,
      subtaskId: id,
      projectCode: val(s, 'project_code') || null,
      taskCode: val(s, 'task_code') || null,
      assigneeEmail: assignee,
    })
    sent += 1
  }

  return { sent, skipped }
}
