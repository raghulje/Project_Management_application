import { Router } from 'express'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { actorLabel, notifyWorkflow, val } from '../services/notify.js'
import {
  buildEditPolicy,
  createAccessRequest,
  decideAccessRequest,
  inboxCount,
  isItemType,
  listInbox,
  listMine,
  loadItem,
  recordPath,
} from '../services/fieldAccess.js'

export const fieldAccessRouter = Router()

fieldAccessRouter.get('/inbox', async (req, res) => {
  if (!req.user) return fail(res, 'Unauthorized', 401)
  const status = String(req.query.status || 'pending')
  const rows = await listInbox(req.user, status === 'all' ? '' : status)
  return okList(res, rows, rows.length)
})

fieldAccessRouter.get('/mine', async (req, res) => {
  if (!req.user) return fail(res, 'Unauthorized', 401)
  const rows = await listMine(req.user)
  return okList(res, rows, rows.length)
})

fieldAccessRouter.get('/count', async (req, res) => {
  if (!req.user) return fail(res, 'Unauthorized', 401)
  return okItem(res, { pending: await inboxCount(req.user) })
})

fieldAccessRouter.post('/requests', async (req, res) => {
  if (!req.user) return fail(res, 'Unauthorized', 401)
  const itemType = req.body?.item_type
  const itemId = Number(req.body?.item_id)
  if (!isItemType(itemType) || !itemId) return fail(res, 'item_type and item_id are required')
  const fields = Array.isArray(req.body?.fields) ? req.body.fields : []
  const result = await createAccessRequest({
    user: req.user,
    itemType,
    itemId,
    fields,
    reason: String(req.body?.reason || ''),
  })
  if (!result.ok) return fail(res, result.message, result.status)

  notifyWorkflow({
    category: 'approval_request',
    event: 'field_access.requested',
    subject: `[PM] Field change request: ${val(result.record, 'name')}`,
    title: 'Field change request',
    intro: `${actorLabel(req.user)} asked to edit locked fields on this ${itemType}.`,
    fields: [
      { label: 'Record', value: val(result.record, 'name') },
      { label: 'Fields', value: result.request.field_labels.join(', ') },
      { label: 'Reason', value: result.request.reason },
      { label: 'Requested by', value: actorLabel(req.user) },
    ],
    ctaPath: '/approvals',
    ctaLabel: 'Review request',
    itemType,
    itemId,
    projectId: itemType === 'project' ? itemId : (result.record.project_id != null ? Number(result.record.project_id) : null),
    taskId: itemType === 'task' ? itemId : (result.record.task_id != null ? Number(result.record.task_id) : null),
    subtaskId: itemType === 'subtask' ? itemId : null,
    projectCode: val(result.record, 'project_code'),
    taskCode: val(result.record, 'task_code'),
    assigneeEmail: result.l1.email,
    skipOps: true,
  })

  return okMessage(res, 'Request sent to your L1', {
    request: result.request,
    edit_policy: result.edit_policy,
  }, 201)
})

fieldAccessRouter.post('/requests/:id/grant', async (req, res) => {
  if (!req.user) return fail(res, 'Unauthorized', 401)
  const result = await decideAccessRequest({
    user: req.user,
    id: Number(req.params.id),
    decision: 'granted',
    note: String(req.body?.note || ''),
    hours: req.body?.hours != null ? Number(req.body.hours) : 48,
  })
  if (!result.ok) return fail(res, result.message, result.status)

  notifyWorkflow({
    category: 'approval_request',
    event: 'field_access.granted',
    subject: `[PM] Field access granted: ${val(result.record, 'name')}`,
    title: 'Field access granted',
    intro: `${actorLabel(req.user)} granted your request. You can edit the approved fields for 48 hours.`,
    fields: [
      { label: 'Record', value: val(result.record, 'name') },
      { label: 'Fields', value: result.request.field_labels.join(', ') },
      { label: 'Expires', value: result.request.expires_at || '48 hours' },
      { label: 'Note', value: result.request.decision_note },
    ],
    ctaPath: recordPath(result.itemType, result.itemId),
    ctaLabel: 'Open record',
    itemType: result.itemType,
    itemId: result.itemId,
    assigneeEmail: result.request.requested_by_email,
    skipOps: true,
  })

  return okMessage(res, 'Access granted', { request: result.request })
})

fieldAccessRouter.post('/requests/:id/deny', async (req, res) => {
  if (!req.user) return fail(res, 'Unauthorized', 401)
  const result = await decideAccessRequest({
    user: req.user,
    id: Number(req.params.id),
    decision: 'denied',
    note: String(req.body?.note || ''),
  })
  if (!result.ok) return fail(res, result.message, result.status)

  notifyWorkflow({
    category: 'approval_request',
    event: 'field_access.denied',
    subject: `[PM] Field access denied: ${val(result.record, 'name')}`,
    title: 'Field access denied',
    intro: `${actorLabel(req.user)} declined your request to edit locked fields.`,
    fields: [
      { label: 'Record', value: val(result.record, 'name') },
      { label: 'Fields', value: result.request.field_labels.join(', ') },
      { label: 'Note', value: result.request.decision_note || 'No note' },
    ],
    ctaPath: recordPath(result.itemType, result.itemId),
    ctaLabel: 'Open record',
    itemType: result.itemType,
    itemId: result.itemId,
    assigneeEmail: result.request.requested_by_email,
    skipOps: true,
  })

  return okMessage(res, 'Request denied', { request: result.request })
})

fieldAccessRouter.get('/policy/:itemType/:id', async (req, res) => {
  if (!req.user) return fail(res, 'Unauthorized', 401)
  if (!isItemType(req.params.itemType)) return fail(res, 'Invalid item type')
  const record = await loadItem(req.params.itemType, Number(req.params.id))
  if (!record) return fail(res, 'Record not found', 404)
  return okItem(res, await buildEditPolicy(req.user, req.params.itemType, record))
})
