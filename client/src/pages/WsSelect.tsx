import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

export type WsOption = { value: string; label: string; disabled?: boolean }

function normalize(options: Array<string | WsOption>): WsOption[] {
  return options.map((opt) => {
    if (typeof opt === 'string') return { value: opt, label: opt }
    return { value: String(opt.value), label: String(opt.label ?? opt.value), disabled: opt.disabled }
  })
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: Array<string | WsOption>
  placeholder?: string
  disabled?: boolean
  searchable?: boolean
  size?: 'md' | 'sm'
  ariaLabel?: string
  className?: string
}

export default function WsSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  searchable,
  size = 'md',
  ariaLabel,
  className = '',
}: Props) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [query, setQuery] = useState('')
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)

  const items = useMemo(() => normalize(options), [options])
  const showSearch = searchable ?? items.length > 8
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [items, query])
  const selected = items.find((o) => o.value !== '' && o.value === String(value)) || null

  const close = useCallback(() => {
    setOpen(false)
    setHighlight(-1)
    setQuery('')
  }, [])

  const place = useCallback(() => {
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const vh = window.innerHeight
    const below = Math.max(120, vh - Math.min(rect.bottom, vh) - 12)
    const above = Math.max(120, Math.max(rect.top, 0) - 12)
    const up = below < 220 && above > below
    const maxH = Math.min(320, up ? above : below)
    setMenuStyle({
      position: 'fixed',
      left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - Math.max(rect.width, 180) - 8)),
      width: Math.max(rect.width, 180),
      top: up ? undefined : Math.min(vh - maxH - 8, Math.max(8, rect.bottom + 6)),
      bottom: up ? Math.min(vh - 8, Math.max(8, vh - rect.top + 6)) : undefined,
      maxHeight: Math.max(140, maxH),
    })
  }, [])

  const openMenu = useCallback(() => {
    if (disabled) return
    place()
    const idx = items.findIndex((o) => o.value !== '' && o.value === String(value) && !o.disabled)
    const first = items.findIndex((o) => o.value !== '' && !o.disabled)
    setHighlight(idx >= 0 ? idx : Math.max(0, first))
    setOpen(true)
  }, [disabled, items, value, place])

  const pick = useCallback((opt: WsOption) => {
    if (!opt || opt.disabled) return
    onChange(opt.value)
    close()
    buttonRef.current?.focus()
  }, [onChange, close])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      close()
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, close, place])

  useLayoutEffect(() => {
    if (open && showSearch) searchRef.current?.focus()
  }, [open, showSearch])

  useEffect(() => {
    if (!open || highlight < 0) return
    const el = listRef.current?.querySelector(`[data-ws-opt="${highlight}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, highlight])

  function move(delta: number) {
    if (!filtered.length) return
    setHighlight((h) => {
      let next = h
      for (let i = 0; i < filtered.length; i += 1) {
        next = (next + delta + filtered.length) % filtered.length
        if (!filtered[next]?.disabled) return next
      }
      return h
    })
  }

  function onButtonKey(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) openMenu()
      else move(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!open) openMenu()
      else if (filtered[highlight]) pick(filtered[highlight])
    }
  }

  return (
    <div ref={rootRef} className={`ws-select ${size === 'sm' ? 'is-sm' : ''} ${className}`.trim()}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={`ws-select-btn${open ? ' is-open' : ''}${selected ? '' : ' is-ph'}`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onButtonKey}
      >
        <span>{selected?.label || placeholder}</span>
        <i className={`ri-arrow-down-s-line${open ? ' is-open' : ''}`} aria-hidden />
      </button>
      {open && menuStyle && typeof document !== 'undefined'
        ? createPortal(
          <div ref={menuRef} className="ws-select-menu" style={menuStyle} role="presentation">
            {showSearch ? (
              <div className="ws-select-search-wrap">
                <i className="ri-search-line" aria-hidden />
                <input
                  ref={searchRef}
                  type="text"
                  className="ws-select-search"
                  value={query}
                  placeholder="Search..."
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Search options"
                  onChange={(e) => { setQuery(e.target.value); setHighlight(0) }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
                    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
                    if (e.key === 'Enter' && filtered[highlight]) { e.preventDefault(); pick(filtered[highlight]) }
                  }}
                />
              </div>
            ) : null}
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              className="ws-select-list"
            >
              {filtered.length === 0 ? (
                <li className="ws-select-empty">No matches</li>
              ) : filtered.map((opt, idx) => {
                const on = Boolean(opt.value) && opt.value === String(value)
                return (
                  <li
                    key={`${opt.value}-${idx}`}
                    data-ws-opt={idx}
                    role="option"
                    aria-selected={on}
                    className={`ws-select-opt${on ? ' is-on' : ''}${idx === highlight ? ' is-hi' : ''}${opt.disabled ? ' is-off' : ''}`}
                    onMouseEnter={() => !opt.disabled && setHighlight(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(opt)}
                  >
                    <span>{opt.label}</span>
                    {on ? <i className="ri-check-line" aria-hidden /> : null}
                  </li>
                )
              })}
            </ul>
          </div>,
          document.body,
        )
        : null}
    </div>
  )
}
