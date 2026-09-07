export function auditRevisionEntries(row) {
  const history = Array.isArray(row?.revisionHistory) ? row.revisionHistory : []
  const fieldAudits = history.some((r) => Array.isArray(r.changes) && r.changes.length)
  if (fieldAudits) return history
  if (row?.hasRevision && history.length > 1) return history.slice(1)
  return Number(row?.revisedCount) > 0 ? history : []
}

export function RevisionChangeLines({ rev }) {
  if (Array.isArray(rev?.changes) && rev.changes.length) {
    return (
      <div className="mt-1.5 space-y-1">
        {rev.changes.map((c, i) => (
          <div key={`${c.field || c.label}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-600">
            <span className="font-medium text-slate-800">{c.label || c.field}</span>
            <span className="font-medium text-slate-500 line-through">{c.from || '—'}</span>
            <i className="ri-arrow-right-line text-[11px] text-[#FB8C00]" aria-hidden />
            <span className="font-semibold text-[#FB8C00]">{c.to || '—'}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-600">
      <p>
        Previous:{' '}
        <span className="font-medium text-slate-500 line-through">{rev?.previousEndDate || '—'}</span>
      </p>
      <i className="ri-arrow-right-line text-[11px] text-[#FB8C00]" aria-hidden />
      <p>
        Updated:{' '}
        <span className="font-semibold text-[#FB8C00]">{rev?.newEndDate || '—'}</span>
      </p>
    </div>
  )
}
