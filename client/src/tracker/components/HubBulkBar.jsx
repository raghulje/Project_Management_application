import { useMemo, useState } from 'react'
import BulkActionMenu from '../../components/BulkActionMenu'
import { projectsApi, subtasksApi, tasksApi } from '../../api/client'
import { resolvePmRecordId } from '../pmApi.js'

const API = { project: projectsApi, task: tasksApi, subtask: subtasksApi }
const LABELS = { project: 'project', task: 'task', subtask: 'subtask' }

export function isFinishedStatus(status) {
  const s = String(status || '').toLowerCase()
  return s.includes('closed') || s.includes('complete') || s.includes('cancel') || s === 'done'
}

export function recordDbId(row) {
  const n = Number(resolvePmRecordId(row) || row?.dbId || row?.recordId)
  return Number.isInteger(n) && n > 0 ? n : 0
}

export function rowSelectKey(row) {
  return String(resolvePmRecordId(row) || row?.dbId || row?.id || row?.InstanceID || '').trim()
}

export function openRowsOf(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !isFinishedStatus(row?.status))
}

function noteFor(payload, verb, fallback) {
  const updated = Number(payload?.updated ?? fallback) || 0
  const skipped = Number(payload?.skipped) || 0
  const first = payload?.errors?.[0]?.message
  return `${updated} ${verb}${skipped ? `, ${skipped} skipped` : ''}${first ? `. ${first}` : '.'}`
}

export default function HubBulkBar({
  kind = 'task',
  pageRows = [],
  allRows = [],
  selected,
  onSelected,
  onChanged,
  onDelete,
}) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const api = API[kind]
  const noun = LABELS[kind] || 'record'
  const selectedSet = selected instanceof Set ? selected : new Set(selected || [])

  const pageOpen = useMemo(() => openRowsOf(pageRows), [pageRows])
  const allOpen = useMemo(() => openRowsOf(allRows), [allRows])
  const pageKeys = pageOpen.map(rowSelectKey).filter(Boolean)
  const allKeys = allOpen.map(rowSelectKey).filter(Boolean)

  function setKeys(keys) {
    onSelected?.(new Set(keys))
  }

  function selectedTargets() {
    const ids = []
    const refs = []
    for (const row of allRows) {
      const key = rowSelectKey(row)
      if (!key || !selectedSet.has(key) || isFinishedStatus(row.status)) continue
      const id = recordDbId(row)
      if (id) ids.push(id)
      else refs.push(String(row.InstanceID || row.kissflow_id || row.taskId || row.taskBusinessId || row.displayId || key))
    }
    return { ids: [...new Set(ids)], refs: [...new Set(refs.filter(Boolean))] }
  }

  async function run(label, work) {
    setBusy(label)
    setErr('')
    setMsg('')
    try {
      await work()
    } catch (e) {
      setErr(e instanceof Error ? e.message : `${label} failed`)
    } finally {
      setBusy('')
    }
  }

  async function apply(patch, verb) {
    const { ids, refs } = selectedTargets()
    if (!ids.length && !refs.length) throw new Error('No open records to update')
    const r = await api.bulkUpdate(ids, { ...patch, refs })
    if (!Number(r?.payload?.updated) && Number(r?.payload?.skipped)) {
      throw new Error(noteFor(r.payload, verb, 0))
    }
    setMsg(noteFor(r.payload, verb, ids.length + refs.length))
    onSelected?.(new Set())
    window.dispatchEvent(new CustomEvent('pm-records-changed', { detail: { kind } }))
    await onChanged?.()
  }

  if (!allOpen.length && !selectedSet.size) return null

  return (
    <div className="hub-bulk">
      <BulkActionMenu
        selectedCount={selectedSet.size}
        pageCount={pageKeys.length}
        allCount={allKeys.length}
        noun={noun}
        busy={!!busy}
        onSelectPage={() => setKeys(pageKeys)}
        onSelectAll={() => setKeys(allKeys)}
        onDeselect={() => setKeys([])}
        onExport={() => run('Export', async () => {
          const { ids, refs } = selectedTargets()
          const useIds = ids.length ? ids : allOpen.map(recordDbId).filter(Boolean)
          if (!useIds.length && !refs.length) throw new Error('No records to export')
          await api.exportFile(useIds)
          setMsg(`Exported ${useIds.length || selectedSet.size} ${noun}s.`)
        })}
        onMarkClosed={() => run('Close', () => apply({ status: 'Closed' }, 'marked closed'))}
        onStatus={(status) => run('Update', () => apply({ status }, `set to ${status}`))}
        onPriority={(priority) => run('Update', () => apply({ priority }, `set to ${priority}`))}
        onDelete={onDelete ? () => run('Delete', onDelete) : undefined}
      />
      {err ? <p className="hub-bulk-err">{err}</p> : null}
      {msg ? <p className="hub-bulk-ok">{msg}</p> : null}
    </div>
  )
}
