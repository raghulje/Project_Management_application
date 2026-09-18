import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useDebounced } from '../lib/useDebounced'
import { delayDays, fmt, isClosedStatus, OwnerAvatar, ProgressBar, Rag, ragTone, ReopenBadge, RevBadge, StatusPill } from '../pages/WorkspaceKit'
import { FrChips, FrHeader, FrPage, FrPager, FrPanel } from '../pages/FormReference'
import { navState } from '../lib/recordNav'
import { Alert } from '../pages/AdminKit'
import BulkActionMenu from './BulkActionMenu'

type Col = {
  key: string
  label: string
  href?: (row: Record<string, unknown>) => string
  kind?: 'status' | 'rag' | 'priority' | 'date' | 'revisions' | 'reopen' | 'name' | 'person' | 'progress' | 'text'
  subKey?: string
}

type Props = {
  title: string
  subtitle?: string
  createTo?: string
  createLabel?: string
  rows: Record<string, unknown>[]
  total?: number
  columns: Col[]
  search: string
  onSearch: (q: string) => void
  onDeleteMany?: (ids: number[]) => Promise<void>
  onExport?: (ids: number[]) => Promise<void>
  onBulkUpdate?: (ids: number[], patch: { status?: string; priority?: string }) => Promise<{
    payload?: { updated?: number; skipped?: number; errors?: Array<{ id: number; message: string }> }
  } | void>
  noun?: string
  extra?: ReactNode
  defaultSort?: { key: string; order: 'asc' | 'desc' }
}

const PAGE_SIZE = 20

function bulkNote(
  verb: string,
  payload: { updated?: number; skipped?: number; errors?: Array<{ id: number; message: string }> } | undefined,
  fallback: number,
) {
  const updated = payload?.updated ?? fallback
  const skipped = payload?.skipped || 0
  const first = payload?.errors?.[0]?.message
  return `${updated} ${verb}${skipped ? `, ${skipped} skipped` : ''}${first ? `. ${first}` : '.'}`
}
const WRAP_KEYS = new Set(['name', 'project_name', 'task_name', 'subject', 'notes', 'detail', 'description', 'title'])

function wrapCell(value: unknown) {
  return (
    <span className="fr-name-cell">
      <span className="fr-name">{fmt(value)}</span>
    </span>
  )
}

function nameSub(c: Col, r: Record<string, unknown>) {
  const parts = [
    c.subKey ? fmt(r[c.subKey]) : '',
    fmt(r.company_name),
    fmt(r.category),
    fmt(r.line_of_business),
  ].filter((v) => v && v !== '—')
  return [...new Set(parts)].slice(0, 2).join(' · ')
}

export default function ResourceTable({
  title, subtitle, createTo, createLabel = 'Create', rows, total, columns, search, onSearch,
  onDeleteMany, onExport, onBulkUpdate, noun = 'record', extra, defaultSort,
}: Props) {
  const nav = useNavigate()
  const loc = useLocation()
  const from = navState(loc)
  const [sel, setSel] = useState<number[]>([])
  const [localSearch, setLocalSearch] = useState(search)
  const [status, setStatus] = useState('')
  const [sortBy, setSortBy] = useState(defaultSort?.key || columns[0]?.key || 'name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(defaultSort?.order || 'asc')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const selectable = Boolean(onDeleteMany || onExport || onBulkUpdate)
  const debounced = useDebounced(localSearch)
  useEffect(() => { setSel([]) }, [rows])
  useEffect(() => { setLocalSearch(search) }, [search])
  useEffect(() => { if (debounced !== search) onSearch(debounced) }, [debounced])
  useEffect(() => { setPage(1) }, [search, status, sortBy, sortOrder])

  const statusKey = columns.find((c) => c.key === 'status' || c.kind === 'status')?.key
  const chips = useMemo(() => {
    if (!statusKey) return []
    const counts = new Map<string, number>()
    for (const r of rows) {
      const v = String(r[statusKey] || 'Blank')
      counts.set(v, (counts.get(v) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count, value: label }))
  }, [rows, statusKey])

  const filtered = useMemo(() => {
    let next = rows
    if (status && statusKey) {
      next = next.filter((r) => String(r[statusKey] || 'Blank') === status)
    }
    const dir = sortOrder === 'asc' ? 1 : -1
    return [...next].sort((a, b) => {
      const av = String(a[sortBy] ?? '')
      const bv = String(b[sortBy] ?? '')
      return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) * dir
    })
  }, [rows, status, statusKey, sortBy, sortOrder])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pages)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const pageOpenIds = pageRows.filter((r) => !isClosedStatus(r.status)).map((r) => Number(r.id)).filter((n) => n > 0)
  const allOpenIds = filtered.filter((r) => !isClosedStatus(r.status)).map((r) => Number(r.id)).filter((n) => n > 0)
  const rowHref = (r: Record<string, unknown>) => columns.find((c) => c.href)?.href?.(r)
  const allOn = pageOpenIds.length > 0 && pageOpenIds.every((id) => sel.includes(id))
  const countLabel = subtitle || `${total ?? rows.length} total records`
  const targetIds = sel.length ? sel : allOpenIds
  const nounLabel = sel.length === 1 ? noun : `${noun}s`

  async function runAction(label: string, work: () => Promise<void>) {
    setBusy(label)
    setErr('')
    setNote('')
    try {
      await work()
    } catch (e) {
      setErr(e instanceof Error ? e.message : `${label} failed`)
    } finally {
      setBusy('')
    }
  }

  function toggleSort(key: string) {
    if (sortBy === key) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(key)
      setSortOrder('asc')
    }
  }

  function cell(c: Col, r: Record<string, unknown>) {
    const kind = c.kind || (
      c.key === 'status' ? 'status'
      : c.key === 'rag' ? 'rag'
      : c.key === 'priority' ? 'priority'
      : c.key === 'revision_count' ? 'revisions'
      : c.key === 'reopen_count' ? 'reopen'
      : c.key === 'name' ? 'name'
      : WRAP_KEYS.has(c.key) ? 'text'
      : /(_name$|assigned_to|owner)/.test(c.key) ? 'person'
      : /date/.test(c.key) ? 'date'
      : undefined
    )
    const raw = r[c.key]
    if (kind === 'status' || kind === 'priority') return <StatusPill value={raw} />
    if (kind === 'rag') return <Rag value={raw} />
    if (kind === 'revisions') return <RevBadge count={raw} />
    if (kind === 'reopen') return <ReopenBadge count={raw} />
    if (kind === 'person') return <OwnerAvatar name={raw} />
    if (kind === 'progress') return <ProgressBar value={raw} />
    if (kind === 'name') {
      const sub = nameSub(c, r)
      return (
        <span className="fr-name-cell">
          <span className="fr-name">{fmt(raw)}</span>
          {sub ? <span className="fr-sub">{sub}</span> : null}
        </span>
      )
    }
    if (kind === 'text') return wrapCell(raw)
    if (kind === 'date') {
      const late = /end/.test(c.key) ? delayDays(r.status, raw) : 0
      return (
        <span className="fr-date">
          <span>{fmt(raw)}</span>
          {late > 0 ? <small>+{late}d delay</small> : null}
        </span>
      )
    }
    return fmt(raw)
  }

  return (
    <FrPage>
      <FrHeader title={title} count={countLabel}>
        <input className="fr-search" placeholder="Search records..." value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} />
        {extra}
        {createTo ? <Link className="ws-btn" to={createTo} state={from}><i className="ri-add-line" />{createLabel}</Link> : null}
      </FrHeader>
      {err ? <Alert kind="err">{err}</Alert> : null}
      {note ? <Alert kind="ok">{note}</Alert> : null}
      {selectable && allOpenIds.length ? (
        <BulkActionMenu
          selectedCount={sel.length}
          pageCount={pageOpenIds.length}
          allCount={allOpenIds.length}
          noun={noun}
          busy={!!busy}
          onSelectPage={() => setSel(pageOpenIds)}
          onSelectAll={() => setSel(allOpenIds)}
          onDeselect={() => setSel([])}
          onExport={onExport ? () => runAction('Export', async () => {
            await onExport(targetIds)
            setNote(`Exported ${targetIds.length} ${targetIds.length === 1 ? noun : `${noun}s`}.`)
          }) : undefined}
          onMarkClosed={onBulkUpdate ? () => runAction('Close', async () => {
            const r = await onBulkUpdate(sel, { status: 'Closed' })
            if (!Number(r?.payload?.updated) && Number(r?.payload?.skipped)) throw new Error(bulkNote('marked closed', r?.payload, 0))
            setNote(bulkNote('marked closed', r?.payload, sel.length))
            setSel([])
          }) : undefined}
          onStatus={onBulkUpdate ? (next) => runAction('Update', async () => {
            const r = await onBulkUpdate(sel, { status: next })
            if (!Number(r?.payload?.updated) && Number(r?.payload?.skipped)) throw new Error(bulkNote(`set to ${next}`, r?.payload, 0))
            setNote(bulkNote(`set to ${next}`, r?.payload, sel.length))
            setSel([])
          }) : undefined}
          onPriority={onBulkUpdate ? (next) => runAction('Update', async () => {
            const r = await onBulkUpdate(sel, { priority: next })
            if (!Number(r?.payload?.updated) && Number(r?.payload?.skipped)) throw new Error(bulkNote(`set to ${next}`, r?.payload, 0))
            setNote(bulkNote(`set to ${next}`, r?.payload, sel.length))
            setSel([])
          }) : undefined}
          onDelete={onDeleteMany ? () => runAction('Delete', async () => {
            if (!confirm(`Delete ${sel.length} ${nounLabel}?`)) return
            await onDeleteMany(sel)
            setNote(`${sel.length} deleted.`)
            setSel([])
          }) : undefined}
        />
      ) : null}
      <FrChips items={chips} value={status} onChange={setStatus} />
      <FrPanel>
        <div className="fr-table-wrap is-cards">
          <table className="fr-table">
            <thead>
              <tr>
                {selectable ? (
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input type="checkbox" aria-label="Select open records on this page" checked={allOn} onChange={() => setSel(allOn ? sel.filter((id) => !pageOpenIds.includes(id)) : [...new Set([...sel, ...pageOpenIds])])} />
                  </th>
                ) : null}
                {columns.map((c) => (
                  <th key={c.key} className="is-sort" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    {sortBy === c.key ? <span className="fr-sort">{sortOrder === 'asc' ? '▲' : '▼'}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="fr-empty">No records found</td></tr>
              ) : pageRows.map((r) => {
                const id = Number(r.id)
                const href = rowHref(r)
                const rag = ragTone(r.rag)
                return (
                  <tr
                    key={String(r.id)}
                    className={`${href ? 'is-clickable' : ''}${sel.includes(id) ? ' is-on' : ''}${rag ? ` is-rag-${rag}` : ''}`}
                    onClick={(e) => {
                      if (!href) return
                      const target = e.target as HTMLElement
                      if (target.closest('a, input, button')) return
                      nav(href, { state: from })
                    }}
                  >
                    {selectable ? (
                      <td className="fr-select-cell" data-label="Select" style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          aria-label={isClosedStatus(r.status) ? 'Already closed' : 'Select open record'}
                          disabled={isClosedStatus(r.status)}
                          checked={sel.includes(id)}
                          onChange={() => {
                            if (isClosedStatus(r.status)) return
                            setSel((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
                          }}
                        />
                      </td>
                    ) : null}
                    {columns.map((c, idx) => {
                      const href = c.href?.(r) || (idx === 0 ? rowHref(r) : undefined)
                      const value = cell(c, r)
                      return <td key={c.key} data-label={c.label}>{href ? <Link to={href} state={from}>{value}</Link> : value}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <FrPager page={safePage} pages={pages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
      </FrPanel>
    </FrPage>
  )
}
