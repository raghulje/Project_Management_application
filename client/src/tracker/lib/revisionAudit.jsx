export function auditRevisionEntries(row) {
  const history = Array.isArray(row?.revisionHistory) ? row.revisionHistory : []
  const fieldAudits = history.some((r) => Array.isArray(r.changes) && r.changes.length)
  if (fieldAudits) return history
  if (row?.hasRevision && history.length > 1) return history.slice(1)
  return Number(row?.revisedCount) > 0 ? history : []
}

function fmtWhen(value) {
  const raw = String(value || '').trim()
  if (!raw || raw === '—') return ''
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function RevisionChangeLines({ rev }) {
  const changes = Array.isArray(rev?.changes) ? rev.changes : []
  const when = fmtWhen(rev?.when) || rev?.date || '—'
  const who = rev?.revisedBy || 'Someone'
  const no = rev?.revisionNo

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-slate-800">
          {no ? `Revision #${no} · ` : ''}Updated by {who}
        </p>
        <p className="text-[11px] text-slate-500">{when}</p>
      </div>
      {changes.length ? changes.map((c, i) => (
        <div key={`${c.field || c.label}-${i}`} className="rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-2">
          <p className="mb-1.5 text-[11px] font-semibold text-slate-800">{c.label || c.field || 'Field'}</p>
          <div className="grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] items-start gap-2 text-[12px]">
            <div>
              <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Previous</span>
              <span className="break-words text-slate-500 line-through">{c.from || '—'}</span>
            </div>
            <i className="ri-arrow-right-line mt-4 text-[11px] text-[#FB8C00]" aria-hidden />
            <div>
              <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Updated</span>
              <span className="break-words font-semibold text-[#FB8C00]">{c.to || '—'}</span>
            </div>
          </div>
        </div>
      )) : (
        <div className="grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] items-start gap-2 text-[12px]">
          <div>
            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Previous</span>
            <span className="text-slate-500 line-through">{rev?.previousEndDate || '—'}</span>
          </div>
          <i className="ri-arrow-right-line mt-4 text-[11px] text-[#FB8C00]" aria-hidden />
          <div>
            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Updated</span>
            <span className="font-semibold text-[#FB8C00]">{rev?.newEndDate || '—'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
