import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { employeesApi } from '../api/client'
import { useDebounced } from '../lib/useDebounced'
import { initials } from './WorkspaceKit'

function cleanName(text: string) {
  return String(text || '').replace(/\s+\([^)]+\)\s*$/, '').trim()
}

function codeOf(text: string) {
  const m = String(text || '').match(/\(([^)]+)\)\s*$/)
  return m ? m[1] : ''
}

type Hit = { id: number; name: string; text: string; code: string }

export default function PersonPicker({
  value,
  onChange,
  onSelect,
  disabled,
  placeholder = 'Type a name...',
}: {
  value: string
  onChange: (name: string) => void
  onSelect?: (name: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const q = useDebounced(value, 160)

  const place = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = Math.max(rect.width, 260)
    setMenuStyle({
      position: 'fixed',
      left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8)),
      width,
      top: Math.min(window.innerHeight - 12, rect.bottom + 6),
      maxHeight: Math.max(160, Math.min(320, window.innerHeight - rect.bottom - 16)),
      zIndex: 90,
    })
  }, [])

  useEffect(() => {
    if (!open) return undefined
    let live = true
    setLoading(true)
    employeesApi.selectlist(q || undefined, 40)
      .then((r) => {
        if (!live) return
        setHits((r.results || []).map((o) => ({
          id: Number(o.id),
          name: cleanName(o.text),
          text: o.text,
          code: codeOf(o.text),
        })).filter((h) => h.name))
        setHighlight(0)
      })
      .catch(() => { if (live) setHits([]) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [open, q])

  useEffect(() => {
    if (!open) return undefined
    place()
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  function pick(hit: Hit) {
    onChange(hit.name)
    onSelect?.(hit.name)
    setOpen(false)
  }

  function onKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, Math.max(0, hits.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter' && open && hits[highlight]) {
      e.preventDefault()
      pick(hits[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="pp">
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onFocus={() => { setOpen(true); place() }}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onKeyDown={onKey}
      />
      {open && menuStyle && typeof document !== 'undefined'
        ? createPortal(
          <ul ref={listRef} id={listId} role="listbox" className="pp-menu" style={menuStyle}>
            {loading && hits.length === 0 ? <li className="pp-empty">Searching employees...</li> : null}
            {!loading && hits.length === 0 ? <li className="pp-empty">No matching people</li> : null}
            {hits.map((hit, idx) => (
              <li
                key={`${hit.id}-${idx}`}
                role="option"
                aria-selected={hit.name === value}
                className={`pp-opt${idx === highlight ? ' is-hi' : ''}${hit.name === value ? ' is-on' : ''}`}
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(hit)}
              >
                <span className="ws-ava">{initials(hit.name)}</span>
                <span>
                  <b>{hit.name}</b>
                  {hit.code ? <em>{hit.code}</em> : null}
                </span>
              </li>
            ))}
          </ul>,
          document.body,
        )
        : null}
    </div>
  )
}
