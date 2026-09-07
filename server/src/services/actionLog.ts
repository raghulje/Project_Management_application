import { run, now } from '../db/index.js'

export async function logAction(opts: {
  userId?: number | null
  actionType: string
  itemType?: string | null
  itemId?: number | null
  targetType?: string | null
  targetId?: number | null
  locationId?: number | null
  note?: string | null
  meta?: unknown
}) {
  const ts = now()
  await run(`
    INSERT INTO action_logs (
      user_id, action_type, target_id, target_type, item_id, item_type,
      location_id, note, log_meta, action_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    opts.userId ?? null,
    opts.actionType,
    opts.targetId ?? null,
    opts.targetType ?? null,
    opts.itemId ?? null,
    opts.itemType ?? null,
    opts.locationId ?? null,
    opts.note ?? null,
    opts.meta ? JSON.stringify(opts.meta) : null,
    ts,
    ts,
    ts,
  ])
}
