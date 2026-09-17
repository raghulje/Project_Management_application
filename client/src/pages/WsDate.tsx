import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function parseDate(value: string) {
  if (!value) return null
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function sameDay(a: Date | null, b: Date | null) {
  return Boolean(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate())
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export default function WsDate({
  value,
  onChange,
  disabled = false,
  placeholder = 'Pick a date',
  min,
  max,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  min?: string
  max?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const selected = parseDate(value)
  const minDate = parseDate(min || '')
  const maxDate = parseDate(max || '')
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => selected || new Date())
  const [popStyle, setPopStyle] = useState<CSSProperties | null>(null)

  useEffect(() => {
    if (selected) setView(selected)
  }, [value])

  const cells = useMemo(() => {
    const y = view.getFullYear()
    const m = view.getMonth()
    const first = new Date(y, m, 1)
    const start = first.getDay()
    const days = new Date(y, m + 1, 0).getDate()
    const prevDays = new Date(y, m, 0).getDate()
    const list: Array<{ date: Date; outside: boolean }> = []
    for (let i = start; i > 0; i -= 1) list.push({ date: new Date(y, m - 1, prevDays - i + 1), outside: true })
    for (let d = 1; d <= days; d += 1) list.push({ date: new Date(y, m, d), outside: false })
    while (list.length < 42) {
      const last = list[list.length - 1].date
      list.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), outside: true })
    }
    return list
  }, [view])

  const close = useCallback(() => setOpen(false), [])

  const place = useCallback(() => {
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const width = 308
    const height = 360
    const vh = window.innerHeight
    const below = vh - rect.bottom - 12
    const up = below < height && rect.top > below
    setPopStyle({
      position: 'fixed',
      left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8)),
      width,
      top: up ? undefined : Math.min(vh - height - 8, Math.max(8, rect.bottom + 6)),
      bottom: up ? Math.min(vh - 8, Math.max(8, vh - rect.top + 6)) : undefined,
      zIndex: 11050,
    })
  }, [])

  const openPop = useCallback(() => {
    if (disabled) return
    setView(selected || new Date())
    place()
    setOpen(true)
  }, [disabled, selected, place])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
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
    if (open) place()
  }, [open, place])

  function blocked(day: Date) {
    const t = startOfDay(day).getTime()
    if (minDate && t < startOfDay(minDate).getTime()) return true
    if (maxDate && t > startOfDay(maxDate).getTime()) return true
    return false
  }

  function pick(day: Date) {
    if (blocked(day)) return
    onChange(iso(day))
    close()
    buttonRef.current?.focus()
  }

  const today = startOfDay(new Date())
  const label = selected
    ? selected.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    : placeholder

  return (
    <div ref={rootRef} className="ws-date">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        className={`ws-date-btn${open ? ' is-open' : ''}${selected ? '' : ' is-ph'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : openPop())}
      >
        <span>{label}</span>
        <i className="ri-calendar-line" aria-hidden />
      </button>
      {open && popStyle && typeof document !== 'undefined'
        ? createPortal(
          <div ref={popRef} className="ws-date-pop" style={popStyle} role="dialog" aria-label="Choose date">
            <div className="ws-date-nav">
              <button type="button" aria-label="Previous month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>
                <i className="ri-arrow-left-s-line" aria-hidden />
              </button>
              <strong>{view.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</strong>
              <button type="button" aria-label="Next month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>
                <i className="ri-arrow-right-s-line" aria-hidden />
              </button>
            </div>
            <div className="ws-date-dow">
              {DOW.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="ws-date-grid">
              {cells.map(({ date, outside }) => {
                const off = blocked(date)
                const on = sameDay(date, selected)
                const isToday = sameDay(date, today)
                return (
                  <button
                    key={iso(date)}
                    type="button"
                    disabled={off}
                    className={`ws-date-day${outside ? ' is-out' : ''}${isToday ? ' is-today' : ''}${on ? ' is-on' : ''}`}
                    onClick={() => {
                      if (outside) setView(new Date(date.getFullYear(), date.getMonth(), 1))
                      pick(date)
                    }}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>
            <div className="ws-date-actions">
              <button
                type="button"
                className="is-clear"
                onClick={() => {
                  onChange('')
                  close()
                }}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  if (blocked(today)) {
                    setView(today)
                    return
                  }
                  pick(today)
                }}
              >
                Today
              </button>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  )
}
