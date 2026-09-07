import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { tasksApi } from '../api/client'
import { StatusPill, fmt, initials } from './WorkspaceKit'

export const BOARD_COLS = [
  { id: 'Open', label: 'To do' },
  { id: 'In Progress', label: 'In progress' },
  { id: 'On Hold', label: 'On hold' },
  { id: 'Completed', label: 'Done' },
] as const

export function boardColumn(status: unknown) {
  const s = String(status || '').toLowerCase()
  if (s.includes('complete') || s.includes('closed') || s.includes('done')) return 'Completed'
  if (s.includes('hold') || s.includes('block')) return 'On Hold'
  if (s.includes('progress') || s.includes('review') || s.includes('active')) return 'In Progress'
  return 'Open'
}

type Card = Record<string, unknown>

export default function KanbanBoard({
  items, onChanged, hrefFor,
}: {
  items: Card[]
  onChanged?: () => void
  hrefFor?: (row: Card) => string
}) {
  const nav = useNavigate()
  const [over, setOver] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const grouped = useMemo(() => {
    const map: Record<string, Card[]> = { Open: [], 'In Progress': [], 'On Hold': [], Completed: [] }
    for (const row of items) map[boardColumn(row.status)].push(row)
    return map
  }, [items])

  async function move(row: Card, status: string) {
    const id = String(row.id || '')
    if (!id || boardColumn(row.status) === status) return
    setBusyId(id)
    try {
      await tasksApi.update(id, { status })
      onChanged?.()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="ws-kanban">
      {BOARD_COLS.map((col) => (
        <section
          key={col.id}
          className={`ws-col${over === col.id ? ' is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(col.id) }}
          onDragLeave={() => setOver((c) => (c === col.id ? null : c))}
          onDrop={(e) => {
            e.preventDefault()
            setOver(null)
            const raw = e.dataTransfer.getData('application/json')
            if (!raw) return
            try { void move(JSON.parse(raw), col.id) } catch { /* ignore */ }
          }}
        >
          <div className="ws-col-h">
            <b>{col.label}</b>
            <span>{grouped[col.id].length}</span>
          </div>
          {grouped[col.id].length === 0 ? <div className="ws-empty">Drop tasks here</div> : null}
          {grouped[col.id].map((row) => {
            const href = hrefFor?.(row) || `/tasks/${row.id}`
            return (
              <article
                key={String(row.id)}
                className="ws-card"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify(row))
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onClick={() => nav(href)}
                style={{ opacity: busyId === String(row.id) ? .55 : 1 }}
              >
                <h4>{String(row.name || 'Untitled')}</h4>
                <p>{[row.task_code, row.project_name].filter(Boolean).map(String).join(' · ') || 'No project'}</p>
                <p className="ws-due">{row.end_date ? `Due ${fmt(row.end_date)}` : 'No due date'}</p>
                <div className="ws-card-meta">
                  <StatusPill value={row.priority} />
                  <span className="ws-chip" style={{ padding: '2px 6px 2px 2px' }}>
                    <span className="ws-ava">{initials(row.assigned_to_name)}</span>
                    {String(row.assigned_to_name || 'Unassigned').split(' ')[0]}
                  </span>
                </div>
              </article>
            )
          })}
        </section>
      ))}
    </div>
  )
}
