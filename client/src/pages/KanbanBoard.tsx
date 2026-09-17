import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { tasksApi } from '../api/client'
import { ReopenBadge, ReopenDialog, StatusPill, fmt, initials, isClosedStatus } from './WorkspaceKit'
import { navState } from '../lib/recordNav'
import { FrPager } from './FormReference'

export const BOARD_COLS = [
  { id: 'Open', label: 'To do' },
  { id: 'In Progress', label: 'In progress' },
  { id: 'On Hold', label: 'On hold' },
  { id: 'Completed', label: 'Done' },
] as const

export const BOARD_PAGE_SIZE = 20

export function boardColumn(status: unknown) {
  const s = String(status || '').toLowerCase()
  if (s.includes('complete') || s.includes('closed') || s.includes('done') || s.includes('cancel')) return 'Completed'
  if (s.includes('hold') || s.includes('block')) return 'On Hold'
  if (s.includes('progress') || s.includes('review') || s.includes('active')) return 'In Progress'
  return 'Open'
}

type Card = Record<string, unknown>

export default function KanbanBoard({
  items, onChanged, hrefFor, onMove, onReopen, noun = 'task', filterKey,
}: {
  items: Card[]
  onChanged?: () => void
  hrefFor?: (row: Card) => string
  onMove?: (row: Card, status: string) => Promise<void>
  onReopen?: (row: Card, reason: string, status: string) => Promise<void>
  noun?: string
  filterKey?: string
  from?: string
}) {
  const nav = useNavigate()
  const loc = useLocation()
  const hereState = navState(loc)
  const [over, setOver] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ row: Card; status: string } | null>(null)
  const [reopenBusy, setReopenBusy] = useState(false)
  const [reopenErr, setReopenErr] = useState('')
  const [page, setPage] = useState(1)
  const grouped = useMemo(() => {
    const map: Record<string, Card[]> = { Open: [], 'In Progress': [], 'On Hold': [], Completed: [] }
    for (const row of items) map[boardColumn(row.status)].push(row)
    return map
  }, [items])
  const pages = Math.max(1, ...BOARD_COLS.map((col) => Math.ceil(grouped[col.id].length / BOARD_PAGE_SIZE)))
  const safePage = Math.min(page, pages)

  useEffect(() => { setPage(1) }, [filterKey])
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])

  async function move(row: Card, status: string) {
    const id = String(row.id || '')
    if (!id || boardColumn(row.status) === status) return
    if (isClosedStatus(row.status) && !isClosedStatus(status)) {
      setReopenErr('')
      setPending({ row, status })
      return
    }
    setBusyId(id)
    try {
      if (onMove) await onMove(row, status)
      else await tasksApi.update(id, { status })
      onChanged?.()
    } finally {
      setBusyId(null)
    }
  }

  async function confirmReopen(reason: string) {
    if (!pending) return
    setReopenBusy(true)
    setReopenErr('')
    try {
      if (onReopen) await onReopen(pending.row, reason, pending.status)
      else await tasksApi.reopen(String(pending.row.id), reason, pending.status)
      setPending(null)
      onChanged?.()
    } catch (e) {
      setReopenErr(e instanceof Error ? e.message : 'Could not re-open')
    } finally {
      setReopenBusy(false)
    }
  }

  return (
    <div className="fr-board-work">
      <div className="ws-kanban">
        {BOARD_COLS.map((col) => {
          const all = grouped[col.id]
          const visible = all.slice((safePage - 1) * BOARD_PAGE_SIZE, safePage * BOARD_PAGE_SIZE)
          return (
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
                <span>{all.length}</span>
              </div>
              <div className="ws-col-body">
                {visible.length === 0 ? <div className="ws-empty">Drop cards here</div> : null}
                {visible.map((row) => {
                  const href = hrefFor?.(row) || `/tasks/${row.id}`
                  const code = row.task_code || row.kissflow_id || row.project_code
                  const parent = row.project_name || row.company_name || row.category
                  const owner = row.assigned_to_name || row.project_owner_name
                  return (
                    <article
                      key={String(row.id)}
                      className="ws-card"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify(row))
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onClick={() => nav(href, { state: hereState })}
                      style={{ opacity: busyId === String(row.id) ? .55 : 1 }}
                    >
                      <h4>{String(row.name || 'Untitled')}</h4>
                      <p>{[code, parent].filter(Boolean).map(String).join(' · ') || 'No project'}</p>
                      <p className="ws-due">{row.end_date ? `Due ${fmt(row.end_date)}` : 'No due date'}</p>
                      <div className="ws-card-meta">
                        <StatusPill value={row.priority || row.status} />
                        {Number(row.reopen_count) > 0 ? <ReopenBadge count={row.reopen_count} /> : null}
                        <span className="ws-chip" style={{ padding: '2px 6px 2px 2px' }}>
                          <span className="ws-ava">{initials(owner)}</span>
                          {String(owner || 'Unassigned').split(' ')[0]}
                        </span>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
      <FrPager page={safePage} pages={pages} total={items.length} pageSize={BOARD_PAGE_SIZE} unit="column" onPage={setPage} />
      <ReopenDialog
        open={Boolean(pending)}
        noun={noun}
        busy={reopenBusy}
        error={reopenErr}
        onClose={() => { if (!reopenBusy) setPending(null) }}
        onSubmit={confirmReopen}
      />
    </div>
  )
}
