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
  changes: RevisionChange[]
  created_at: string
}

const SKIP = new Set([
  'id', 'created_at', 'updated_at', 'deleted_at',
  'created_by_user_id', 'updated_by_user_id',
  'kissflow_created_at', 'kissflow_modified_at',
  'hrms_payload', 'synced_at',
  'project_name', 'project_kissflow_id', 'task_name', 'task_code',
])

function labelOf(field: string) {
  return field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function norm(value: unknown) {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean' || value === 0 || value === 1) {
    if (value === true || value === 1) return 'Yes'
    if (value === false || value === 0) return 'No'
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

export function diffRecords(before: Record<string, unknown>, after: Record<string, unknown>, keys?: string[]) {
  const watch = keys?.length ? keys : Object.keys(after)
  const changes: RevisionChange[] = []
  for (const field of watch) {
    if (SKIP.has(field)) continue
    const from = norm(before[field])
    const to = norm(after[field])
    if (from === to) continue
    changes.push({ field, label: labelOf(field), from, to })
  }
  return changes
}

export async function recordRevision(opts: {
  itemType: 'project' | 'task' | 'subtask'
  itemId: number
  user?: { id?: number; first_name?: string; last_name?: string; username?: string; email?: string | null } | null
  changes: RevisionChange[]
}) {
  if (!opts.changes.length) return null
  const last = await get<{ n: number | null }>(
    `SELECT MAX(revision_no) as n FROM record_revisions WHERE item_type = ? AND item_id = ?`,
    [opts.itemType, opts.itemId],
  )
  const revisionNo = Number(last?.n || 0) + 1
  const ts = now()
  await run(`
    INSERT INTO record_revisions (item_type, item_id, revision_no, user_id, user_name, changes_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    opts.itemType,
    opts.itemId,
    revisionNo,
    opts.user?.id ?? null,
    actorLabel(opts.user),
    JSON.stringify(opts.changes),
    ts,
  ])
  return revisionNo
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
    changes: parseChanges(r.changes_json),
    created_at: String(r.created_at || ''),
  }
}

export async function listRevisions(itemType: string, itemId: number): Promise<RevisionRow[]> {
  const rows = await all<Record<string, unknown>>(`
    SELECT id, item_type, item_id, revision_no, user_id, user_name, changes_json, created_at
    FROM record_revisions
    WHERE item_type = ? AND item_id = ?
    ORDER BY revision_no DESC
  `, [itemType, itemId])
  return rows.map(mapRevisionRow)
}

export async function loadRevisionIndex() {
  const rows = await all<Record<string, unknown>>(`
    SELECT id, item_type, item_id, revision_no, user_id, user_name, changes_json, created_at
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

export async function attachRevisionCounts<T extends Record<string, unknown>>(
  itemType: string,
  rows: T[],
): Promise<Array<T & { revision_count: number }>> {
  const counts = await revisionCounts(itemType, rows.map((r) => Number(r.id)))
  return rows.map((r) => ({ ...r, revision_count: counts.get(Number(r.id)) || 0 }))
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
      const next = norm(entry.revised_end_date)
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
        JSON.stringify([{ field: 'end_date', label: 'end date', from: prev, to: next }]),
        entry.changed_on || entry.created_at || now(),
      ])
      prev = next
    }
  }
}
