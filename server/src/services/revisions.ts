import { all, get, run, now } from '../db/index.js'
import { actorLabel } from './notify.js'

export type RevisionChange = {
  field: string
  label: string
  from: string
  to: string
}

export type RevisionRow = {
  id: number
  item_type: string
  item_id: number
  revision_no: number
  user_id: number | null
  user_name: string
  action: string
  reason: string
  changes: RevisionChange[]
  created_at: string
}

const SKIP = new Set([
  'id', 'created_at', 'updated_at', 'deleted_at',
  'created_by_user_id', 'updated_by_user_id',
  'closed_by_user_id', 'deleted_by_user_id', 'closed_at',
  'source', 'kissflow_id', 'kissflow_created_at', 'kissflow_modified_at',
  'hrms_payload', 'synced_at',
  'project_name', 'project_kissflow_id', 'task_name',
  'parent_task_code', 'parent_task_kissflow_id', 'parent_task_name',
])

const BOOL_FIELDS = new Set([
  'ai_usage', 'reports_available', 'integrated_with_tally', 'integrated_with_sap',
  'integrated_with_power_bi', 'brd_available', 'process_document', 'support_available',
  'cb_analysis_available', 'risk_mitigation', 'requires_approval', 'is_dependent',
])

const LABELS: Record<string, string> = {
  name: 'Name',
  project_code: 'Project code',
  task_code: 'Task code',
  subtask_code: 'Subtask code',
  status: 'Status',
  priority: 'Priority',
  rag: 'RAG',
  risk: 'Risk',
  detail: 'Detail',
  summary: 'Summary',
  objectives: 'Objectives',
  start_date: 'Start date',
  end_date: 'End date',
  assigned_to_name: 'Assignee',
  assignee_name: 'Assignee',
  project_owner_name: 'Project owner',
  project_manager_name: 'Project manager',
  business_owner_name: 'Business owner',
  sponsor_name: 'Sponsor',
  requester_name: 'Requester',
  developer_name: 'Developer',
  cos_owner_name: 'COS owner',
  secondary_assignee_name: 'Secondary assignee',
  created_by_name: 'Created by',
  company_name: 'Company',
  vendor_name: 'Vendor',
  application_name: 'Application',
  project_type: 'Project type',
  project_request: 'Request type',
  function_type: 'Function type',
  function_category: 'Function category',
  function_sub_category: 'Function sub-category',
  category: 'Category',
  entity: 'Entity',
  business: 'Business',
  tech_stack: 'Tech stack',
  governance_frequency: 'Governance',
  risk_mitigation_details: 'Risk mitigation details',
  ai_details: 'AI details',
  tco_efforts: 'TCO / efforts',
  hours: 'Hours',
  tat_days: 'TAT days',
  aging_days: 'Aging days',
  completion: 'Completion',
  task_type: 'Task type',
  workflow_status: 'Workflow status',
  project_id: 'Project',
  task_id: 'Parent task',
  access_request: 'Access request',
  access_grant: 'Access granted',
  access_deny: 'Access denied',
  reopen_reason: 'Re-open reason',
  reopen_count: 'Re-opened',
}

function labelOf(field: string) {
  if (LABELS[field]) return LABELS[field]
  return field
    .replace(/_employee_id$/, '')
    .replace(/_id$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function isBlank(value: unknown) {
  return value == null || value === '' || value === 'null' || value === 'undefined'
}

function norm(field: string, value: unknown) {
  if (isBlank(value)) return '—'
  if (BOOL_FIELDS.has(field) || typeof value === 'boolean') {
    if (value === true || value === 1 || value === '1' || value === 'true') return 'Yes'
    if (value === false || value === 0 || value === '0' || value === 'false') return 'No'
  }
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  if ((s.startsWith('{') || s.startsWith('[')) && (s.endsWith('}') || s.endsWith(']'))) {
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String).join(', ') || '—'
    } catch { /* keep raw */ }
  }
  return s || '—'
}

function shouldSkipField(field: string) {
  if (SKIP.has(field)) return true
  if (/_employee_id$/.test(field)) return true
  return false
}

export function diffRecords(before: Record<string, unknown>, after: Record<string, unknown>, keys?: string[]) {
  const watch = keys?.length ? keys : [...new Set([...Object.keys(before), ...Object.keys(after)])]
  const changes: RevisionChange[] = []
  for (const field of watch) {
    if (shouldSkipField(field)) continue
    const from = norm(field, before[field])
    const to = norm(field, after[field])
    if (from === to) continue
    changes.push({ field, label: labelOf(field), from, to })
  }
  const named = new Set(changes.map((c) => c.field.replace(/_name$/, '')))
  return changes.filter((c) => {
    if (c.field.endsWith('_id') && named.has(c.field.replace(/_id$/, ''))) return false
    return true
  })
}

function actorAudit(user?: {
  id?: number
  first_name?: string
  last_name?: string
  username?: string
  email?: string | null
} | null) {
  const name = actorLabel(user)
  const email = String(user?.email || '').trim()
  if (email && !name.toLowerCase().includes(email.toLowerCase())) return `${name} · ${email}`
  return name
}

const CREATE_FIELDS: Record<'project' | 'task' | 'subtask', string[]> = {
  project: ['name', 'project_code', 'status', 'priority', 'company_name', 'project_owner_name'],
  task: ['name', 'task_code', 'status', 'priority', 'assigned_to_name', 'project_id'],
  subtask: ['name', 'subtask_code', 'status', 'priority', 'assigned_to_name', 'task_id'],
}

export async function recordRevision(opts: {
  itemType: 'project' | 'task' | 'subtask'
  itemId: number
  user?: { id?: number; first_name?: string; last_name?: string; username?: string; email?: string | null } | null
  changes: RevisionChange[]
  action?: string
  reason?: string | null
}) {
  if (!opts.changes.length) return null
  const last = await get<{ n: number | null }>(
    `SELECT MAX(revision_no) as n FROM record_revisions WHERE item_type = ? AND item_id = ?`,
    [opts.itemType, opts.itemId],
  )
  const revisionNo = Number(last?.n || 0) + 1
  const ts = now()
  await run(`
    INSERT INTO record_revisions (item_type, item_id, revision_no, user_id, user_name, action, reason, changes_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    opts.itemType,
    opts.itemId,
    revisionNo,
    opts.user?.id ?? null,
    actorAudit(opts.user),
    opts.action || 'update',
    opts.reason || null,
    JSON.stringify(opts.changes),
    ts,
  ])
  return revisionNo
}

export async function recordCreated(opts: {
  itemType: 'project' | 'task' | 'subtask'
  itemId: number
  user?: { id?: number; first_name?: string; last_name?: string; username?: string; email?: string | null } | null
  row: Record<string, unknown>
  action?: string
}) {
  const changes = diffRecords({}, opts.row, CREATE_FIELDS[opts.itemType])
  if (!changes.length) {
    changes.push({ field: 'record', label: 'Record', from: '—', to: 'Created' })
  }
  return recordRevision({ ...opts, action: opts.action || 'create', changes })
}

export async function recordDeleted(opts: {
  itemType: 'project' | 'task' | 'subtask'
  itemId: number
  user?: { id?: number; first_name?: string; last_name?: string; username?: string; email?: string | null } | null
  row?: Record<string, unknown> | null
}) {
  return recordRevision({
    itemType: opts.itemType,
    itemId: opts.itemId,
    user: opts.user,
    action: 'delete',
    changes: [
      { field: 'deleted', label: 'Deleted', from: 'No', to: 'Yes' },
      { field: 'name', label: 'Name', from: String(opts.row?.name || '—'), to: '—' },
    ],
  })
}

function parseChanges(raw: unknown): RevisionChange[] {
  if (Array.isArray(raw)) return raw as RevisionChange[]
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as RevisionChange[] } catch { return [] }
  }
  return []
}

function mapRevisionRow(r: Record<string, unknown>): RevisionRow {
  return {
    id: Number(r.id),
    item_type: String(r.item_type),
    item_id: Number(r.item_id),
    revision_no: Number(r.revision_no),
    user_id: r.user_id == null ? null : Number(r.user_id),
    user_name: String(r.user_name || 'Someone'),
    action: String(r.action || (isReopenRevision({ changes: parseChanges(r.changes_json) }) ? 'reopen' : 'update')),
    reason: String(r.reason || ''),
    changes: parseChanges(r.changes_json),
    created_at: String(r.created_at || ''),
  }
}

export function isReopenRevision(row: { changes?: RevisionChange[] }) {
  return (row.changes || []).some((c) => c.field === 'reopen_reason')
}

export async function listRevisions(itemType: string, itemId: number): Promise<RevisionRow[]> {
  const rows = await all<Record<string, unknown>>(`
    SELECT id, item_type, item_id, revision_no, user_id, user_name, action, reason, changes_json, created_at
    FROM record_revisions
    WHERE item_type = ? AND item_id = ?
    ORDER BY revision_no DESC
  `, [itemType, itemId])
  return rows.map(mapRevisionRow)
}

export async function loadRevisionIndex() {
  const rows = await all<Record<string, unknown>>(`
    SELECT id, item_type, item_id, revision_no, user_id, user_name, action, reason, changes_json, created_at
    FROM record_revisions
    ORDER BY item_type ASC, item_id ASC, revision_no ASC
  `).catch(() => [] as Record<string, unknown>[])
  const map = new Map<string, RevisionRow[]>()
  for (const row of rows) {
    const mapped = mapRevisionRow(row)
    const key = `${mapped.item_type}:${mapped.item_id}`
    const list = map.get(key) || []
    list.push(mapped)
    map.set(key, list)
  }
  return map
}

export async function revisionCounts(itemType: string, ids: number[]) {
  const unique = [...new Set(ids.map(Number).filter((n) => n > 0))]
  const map = new Map<number, number>()
  if (!unique.length) return map
  const placeholders = unique.map(() => '?').join(',')
  const rows = await all<{ item_id: number; c: number }>(`
    SELECT item_id, COUNT(*) as c
    FROM record_revisions
    WHERE item_type = ? AND item_id IN (${placeholders})
    GROUP BY item_id
  `, [itemType, ...unique])
  for (const r of rows) map.set(Number(r.item_id), Number(r.c || 0))
  return map
}

export async function reopenCounts(itemType: string, ids: number[]) {
  const unique = [...new Set(ids.map(Number).filter((n) => n > 0))]
  const map = new Map<number, number>()
  if (!unique.length) return map
  const placeholders = unique.map(() => '?').join(',')
  const rows = await all<{ item_id: number; c: number }>(`
    SELECT item_id, COUNT(*) as c
    FROM record_revisions
    WHERE item_type = ? AND item_id IN (${placeholders})
      AND changes_json LIKE '%"field":"reopen_reason"%'
    GROUP BY item_id
  `, [itemType, ...unique])
  for (const r of rows) map.set(Number(r.item_id), Number(r.c || 0))
  return map
}

export async function attachRevisionCounts<T extends Record<string, unknown>>(
  itemType: string,
  rows: T[],
): Promise<Array<T & { revision_count: number; reopen_count: number }>> {
  const ids = rows.map((r) => Number(r.id))
  const [counts, reopens] = await Promise.all([revisionCounts(itemType, ids), reopenCounts(itemType, ids)])
  return rows.map((r) => ({
    ...r,
    revision_count: counts.get(Number(r.id)) || 0,
    reopen_count: reopens.get(Number(r.id)) || 0,
  }))
}

export async function backfillTimelineRevisions() {
  const existing = await get<{ c: number }>(`SELECT COUNT(*) as c FROM record_revisions WHERE item_type = 'project'`)
  if (Number(existing?.c || 0) > 0) return
  const rows = await all<Record<string, unknown>>(`
    SELECT id, project_id, revised_end_date, changed_on, created_by_name, created_at
    FROM project_timeline_history
    ORDER BY project_id ASC, id ASC
  `)
  const byProject = new Map<number, Record<string, unknown>[]>()
  for (const row of rows) {
    const pid = Number(row.project_id)
    if (!byProject.has(pid)) byProject.set(pid, [])
    byProject.get(pid)!.push(row)
  }
  for (const [projectId, hist] of byProject) {
    let prev = '—'
    let n = 0
    for (const entry of hist) {
      const next = norm('end_date', entry.revised_end_date)
      if (next === prev) continue
      n += 1
      await run(`
        INSERT IGNORE INTO record_revisions (item_type, item_id, revision_no, user_id, user_name, changes_json, created_at)
        VALUES (?, ?, ?, NULL, ?, ?, ?)
      `, [
        'project',
        projectId,
        n,
        String(entry.created_by_name || 'Imported'),
        JSON.stringify([{ field: 'end_date', label: 'End date', from: prev, to: next }]),
        entry.changed_on || entry.created_at || now(),
      ])
      prev = next
    }
  }
}
