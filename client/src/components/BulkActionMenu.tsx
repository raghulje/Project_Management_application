import { useEffect, useRef, useState } from 'react'
import { PRIORITY_OPTS, STATUS_OPTS } from '../pages/RecordUi'

type Props = {
  selectedCount: number
  pageCount: number
  allCount: number
  noun?: string
  busy?: boolean
  onSelectPage: () => void
  onSelectAll: () => void
  onDeselect: () => void
  onExport?: () => void
  onMarkClosed?: () => void
  onStatus?: (status: string) => void
  onPriority?: (priority: string) => void
  onDelete?: () => void
}

export default function BulkActionMenu({
  selectedCount,
  pageCount,
  allCount,
  noun = 'record',
  busy,
  onSelectPage,
  onSelectAll,
  onDeselect,
  onExport,
  onMarkClosed,
  onStatus,
  onPriority,
  onDelete,
}: Props) {
  const [open, setOpen] = useState<'select' | 'action' | ''>('')
  const box = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function hide(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen('')
    }
    document.addEventListener('mousedown', hide)
    return () => document.removeEventListener('mousedown', hide)
  }, [])

  function pick(fn?: () => void) {
    fn?.()
    setOpen('')
  }

  return (
    <div className="ba-bar" ref={box}>
      <div className="ba-group">
        <button type="button" className="ba-btn" disabled={!!busy} onClick={() => setOpen(open === 'select' ? '' : 'select')}>
          <i className="ri-checkbox-multiple-line" />
          {selectedCount ? `Selected: ${selectedCount}` : 'Select'}
          <i className="ri-arrow-down-s-line" />
        </button>
        {open === 'select' ? (
          <div className="ba-menu" role="menu">
            <button type="button" onClick={() => pick(onSelectPage)}>Select this page ({pageCount})</button>
            <button type="button" onClick={() => pick(onSelectAll)}>Select all open ({allCount})</button>
            <button type="button" disabled={!selectedCount} onClick={() => pick(onDeselect)}>Deselect all</button>
          </div>
        ) : null}
      </div>
      <div className="ba-group">
        <button type="button" className="ba-btn" disabled={!!busy} onClick={() => setOpen(open === 'action' ? '' : 'action')}>
          Bulk action
          <i className="ri-arrow-down-s-line" />
        </button>
        {open === 'action' ? (
          <div className="ba-menu" role="menu">
            {onMarkClosed ? (
              <button type="button" disabled={!selectedCount} onClick={() => pick(onMarkClosed)}>Mark closed</button>
            ) : null}
            {onStatus ? (
              <div className="ba-sub">
                <span>Mass update status</span>
                {STATUS_OPTS.map((s) => (
                  <button key={s} type="button" disabled={!selectedCount} onClick={() => { onStatus(s); setOpen('') }}>{s}</button>
                ))}
              </div>
            ) : null}
            {onPriority ? (
              <div className="ba-sub">
                <span>Mass update priority</span>
                {PRIORITY_OPTS.map((s) => (
                  <button key={s} type="button" disabled={!selectedCount} onClick={() => { onPriority(s); setOpen('') }}>{s}</button>
                ))}
              </div>
            ) : null}
            {onExport ? (
              <button type="button" disabled={!selectedCount && !allCount} onClick={() => pick(onExport)}>Export</button>
            ) : null}
            {onDelete ? (
              <button type="button" className="is-danger" disabled={!selectedCount} onClick={() => pick(onDelete)}>Delete</button>
            ) : null}
          </div>
        ) : null}
      </div>
      <span className="ba-hint">
        {selectedCount
          ? `${selectedCount} open ${selectedCount === 1 ? noun : `${noun}s`} selected`
          : 'Closed or completed rows are not selected.'}
      </span>
    </div>
  )
}
