import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useDebounced } from '../lib/useDebounced'
import { delayDays, fmt, OwnerAvatar, ProgressBar, Rag, ragTone, RevBadge, StatusPill } from '../pages/WorkspaceKit'
import { FrChips, FrHeader, FrPage, FrPager, FrPanel } from '../pages/FormReference'
import { navState } from '../lib/recordNav'

type Col = {
  key: string
  label: string
  href?: (row: Record<string, unknown>) => string
  kind?: 'status' | 'rag' | 'priority' | 'date' | 'revisions' | 'name' | 'person' | 'progress'
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
  extra?: ReactNode
  defaultSort?: { key: string; order: 'asc' | 'desc' }
}

const PAGE_SIZE = 20

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
  title, subtitle, createTo, createLabel = 'Create', rows, total, columns, search, onSearch, onDeleteMany, extra, defaultSort,
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
  const ids = pageRows.map((r) => Number(r.id)).filter((n) => n > 0)
  const rowHref = (r: Record<string, unknown>) => columns.find((c) => c.href)?.href?.(r)
  const allOn = ids.length > 0 && ids.every((id) => sel.includes(id))
  const countLabel = subtitle || `${total ?? rows.length} total records`

  function toggleSort(key: string) {
    if (sortBy === key) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(key)
      setSortOrder('asc')
    }
  }

  function cell(c: Col, r: Record<string, unknown>) {
    const kind = c.kind || (c.key === 'status' ? 'status' : c.key === 'rag' ? 'rag' : c.key === 'priority' ? 'priority' : c.key === 'revision_count' ? 'revisions' : c.key === 'name' ? 'name' : /(_name$|assigned_to|owner)/.test(c.key) && c.key !== 'project_name' && c.key !== 'task_name' ? 'person' : /date/.test(c.key) ? 'date' : undefined)
    const raw = r[c.key]
    if (kind === 'status' || kind === 'priority') return <StatusPill value={raw} />
    if (kind === 'rag') return <Rag value={raw} />
    if (kind === 'revisions') return <RevBadge count={raw} />
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
        {sel.length > 0 && onDeleteMany ? (
          <button className="ws-btn danger" type="button" onClick={async () => {
            if (!confirm(`Delete ${sel.length} record(s)?`)) return
            await onDeleteMany(sel)
            setSel([])
          }}>✕ Delete ({sel.length})</button>
        ) : null}
        {createTo ? <Link className="ws-btn" to={createTo} state={from}><i className="ri-add-line" />{createLabel}</Link> : null}
      </FrHeader>
      <FrChips items={chips} value={status} onChange={setStatus} />
      <FrPanel>
        <div className="fr-table-wrap">
          <table className="fr-table">
            <thead>
              <tr>
                {onDeleteMany ? (
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? [] : ids)} />
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
                <tr><td colSpan={columns.length + (onDeleteMany ? 1 : 0)} className="fr-empty">No records found</td></tr>
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
                    {onDeleteMany ? (
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={sel.includes(id)}
                          onChange={() => setSel((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
                        />
                      </td>
                    ) : null}
                    {columns.map((c, idx) => {
                      const href = c.href?.(r) || (idx === 0 ? rowHref(r) : undefined)
                      const value = cell(c, r)
                      return <td key={c.key}>{href ? <Link to={href} state={from}>{value}</Link> : value}</td>
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
