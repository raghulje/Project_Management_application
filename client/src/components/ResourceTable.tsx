import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDebounced } from '../lib/useDebounced'
import { Rag, RevBadge, StatusPill, fmt } from '../pages/WorkspaceKit'

type Col = { key: string; label: string; href?: (row: Record<string, unknown>) => string; kind?: 'status' | 'rag' | 'priority' | 'date' | 'revisions' }

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
}

export default function ResourceTable({
  title, subtitle, createTo, createLabel = 'Create', rows, total, columns, search, onSearch, onDeleteMany, extra,
}: Props) {
  const nav = useNavigate()
  const [sel, setSel] = useState<number[]>([])
  const [localSearch, setLocalSearch] = useState(search)
  const debounced = useDebounced(localSearch)
  useEffect(() => { setSel([]) }, [rows])
  useEffect(() => { setLocalSearch(search) }, [search])
  useEffect(() => { if (debounced !== search) onSearch(debounced) }, [debounced])
  const ids = rows.map((r) => Number(r.id)).filter((n) => n > 0)
  const rowHref = (r: Record<string, unknown>) => columns.find((c) => c.href)?.href?.(r)
  const allOn = ids.length > 0 && ids.every((id) => sel.includes(id))

  return (
    <div className="ws">
      <div className="pm-page-head">
        <div>
          <h1>{title}</h1>
          <p>{subtitle || `${total ?? rows.length} records`}</p>
        </div>
        <div className="ws-actions">
          {extra}
          {createTo ? <Link className="ws-btn" to={createTo}><i className="ri-add-line" />{createLabel}</Link> : null}
        </div>
      </div>
      <div className="pm-card">
        <div className="pm-toolbar">
          <input placeholder="Search records" value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} />
        </div>
        {sel.length > 0 && onDeleteMany ? (
          <div className="pm-bulk">
            {sel.length} selected
            <button className="pm-btn danger" type="button" onClick={async () => {
              if (!confirm(`Delete ${sel.length} record(s)?`)) return
              await onDeleteMany(sel)
              setSel([])
            }}>Delete selected</button>
          </div>
        ) : null}
        <div className="ak-table-wrap">
        <table className="pm-table">
          <thead>
            <tr>
              {onDeleteMany ? (
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? [] : ids)} />
                </th>
              ) : null}
              {columns.map((c) => <th key={c.key}>{c.label}</th>)}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length + (onDeleteMany ? 2 : 1)} className="ws-empty">No records match this view.</td></tr>
            ) : null}
            {rows.map((r) => {
              const id = Number(r.id)
              const href = rowHref(r)
              return (
                <tr
                  key={String(r.id)}
                  className={href ? 'is-clickable' : undefined}
                  onClick={(e) => {
                    if (!href) return
                    const target = e.target as HTMLElement
                    if (target.closest('a, input, button')) return
                    nav(href)
                  }}
                >
                  {onDeleteMany ? (
                    <td>
                      <input
                        type="checkbox"
                        checked={sel.includes(id)}
                        onChange={() => setSel((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
                      />
                    </td>
                  ) : null}
                  {columns.map((c) => {
                    const href = c.href?.(r)
                    const kind = c.kind || (c.key === 'status' ? 'status' : c.key === 'rag' ? 'rag' : c.key === 'priority' ? 'priority' : c.key === 'revision_count' ? 'revisions' : /date/.test(c.key) ? 'date' : undefined)
                    const raw = r[c.key]
                    const cell = kind === 'status' || kind === 'priority'
                      ? <StatusPill value={raw} />
                      : kind === 'rag'
                        ? <Rag value={raw} />
                        : kind === 'revisions'
                          ? <RevBadge count={raw} />
                        : kind === 'date'
                          ? fmt(raw)
                          : String(raw ?? '—')
                    return <td key={c.key}>{href ? <Link to={href}>{cell}</Link> : cell}</td>
                  })}
                  <td className="ak-acts" onClick={(e) => e.stopPropagation()}>
                    {href ? <Link className="emp-act view" to={href} title="View"><i className="ri-eye-line" /></Link> : null}
                    {href ? <Link className="emp-act edit" to={`${href}/edit`} title="Edit"><i className="ri-pencil-line" /></Link> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
