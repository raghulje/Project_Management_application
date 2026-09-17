import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { subtasksApi, tasksApi } from '../api/client'
import { useAuth } from '../api/AuthContext'
import { PRIORITY_OPTS, STATUS_OPTS, dateInput } from './RecordUi'
import {
  AccessMark, PolicyBanner, RequestAccessModal, asPolicy, canSaveRecord, fieldAccess,
  useRequestAccess, type EditPolicy,
} from './FieldAccess'
import WsSelect from './WsSelect'
import WsDate from './WsDate'
import PersonPicker from './PersonPicker'
import { defaultList, fromState, pageCrumbs, stateFor } from '../lib/recordNav'
import { isClosedStatus, ReopenAction, ReopenBadge } from './WorkspaceKit'
import { FrAcc, FrField, FrFoot, FrGrid, FrSheet, FrSheetBody, FrSheetHead, FrSheetMain, FrSection } from './FormReference'

export default function SubtaskComposer() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const loc = useLocation()
  const { isEmployee } = useAuth()

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [policy, setPolicy] = useState<EditPolicy | null>(null)
  const req = useRequestAccess()
  const [tasks, setTasks] = useState<{ value: string; label: string }[]>([])
  const [form, setForm] = useState({
    name: '',
    summary: '',
    status: 'Open',
    priority: 'High',
    task_id: params.get('task_id') || '',
    assigned_to_name: '',
    start_date: '',
    end_date: '',
  })
  const [reopenCount, setReopenCount] = useState(0)

  useEffect(() => {
    tasksApi.selectlist().then((r) => {
      setTasks((r.results || []).map((o) => ({ value: String(o.id), label: o.text })))
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!id) return
    subtasksApi.get(id).then((r) => {
      setPolicy(asPolicy(r.edit_policy))
      setForm({
        name: String(r.name || ''),
        summary: String(r.summary || ''),
        status: String(r.status || 'Open'),
        priority: String(r.priority || 'High'),
        task_id: r.task_id != null ? String(r.task_id) : '',
        assigned_to_name: String(r.assigned_to_name || ''),
        start_date: dateInput(r.start_date),
        end_date: dateInput(r.end_date),
      })
      setReopenCount(Number(r.reopen_count || 0))
    })
  }, [id])

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const missing = useMemo(() => {
    const reqKeys = ['name', 'priority', 'assigned_to_name']
    return reqKeys.filter((k) => !String(form[k as keyof typeof form] || '').trim())
  }, [form])

  async function save(mode: 'save' | 'submit') {
    setErr('')
    if (missing.length) {
      setErr('Fill the required fields — name, priority, and assigned to.')
      return
    }
    setBusy(true)
    try {
      const body = { ...form, task_id: form.task_id ? Number(form.task_id) : null }
      let recordId = id || ''
      if (id) {
        await subtasksApi.update(id, body)
      } else {
        const created = await subtasksApi.create(body)
        recordId = String(created.payload?.id || '')
      }
      nav(mode === 'save' && recordId ? `/subtasks/${recordId}/edit` : `/subtasks/${recordId}`, { state: loc.state })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the subtask')
    } finally {
      setBusy(false)
    }
  }

  const from = fromState(loc)
  const list = defaultList('subtask', isEmployee)
  const back = from || (id ? `/subtasks/${id}` : (form.task_id ? `/tasks/${form.task_id}?tab=subtasks` : list))
  const lock = (f: string) => fieldAccess(policy, f).locked || (f === 'status' && isClosedStatus(form.status))
  const mark = (f: string) => <AccessMark policy={policy} field={f} onRequest={req.ask} />
  const readOnly = !canSaveRecord(policy)
  const taskLabel = tasks.find((t) => t.value === form.task_id)?.label
  const crumbs = pageCrumbs({
    loc,
    kind: 'subtask',
    isEmployee,
    current: id ? 'Edit' : 'New subtask',
    parents: [
      form.task_id ? { to: `/tasks/${form.task_id}?tab=subtasks`, label: taskLabel || 'Task' } : null,
      id ? { to: `/subtasks/${id}`, label: form.name || 'Subtask' } : null,
    ],
  })

  return (
    <FrSheet>
      <FrSheetHead title="Subtask" crumbs={crumbs} closeTo={back} closeState={stateFor(back, loc)}>
        {reopenCount > 0 ? <ReopenBadge count={reopenCount} /> : null}
        {id ? (
          <ReopenAction
            noun="subtask"
            status={form.status}
            onSubmit={async (reason) => {
              await subtasksApi.reopen(id, reason)
              const r = await subtasksApi.get(id)
              set('status', String(r.status || 'Open'))
              setReopenCount(Number(r.reopen_count || 0))
            }}
          />
        ) : null}
        {policy?.can_request ? (
          <button className="ws-btn ghost" type="button" onClick={() => req.ask([])}>
            <i className="ri-lock-unlock-line" />Request change
          </button>
        ) : null}
      </FrSheetHead>

      {err ? <div className="pc-alert">{err}</div> : null}
      <PolicyBanner policy={policy} />
      {id ? (
        <RequestAccessModal
          open={req.open}
          itemType="subtask"
          itemId={id}
          policy={policy}
          preset={req.preset}
          onClose={req.close}
          onDone={setPolicy}
        />
      ) : null}

      <FrSheetBody>
        <FrSheetMain>
      <FrAcc>
        <FrSection label="Overview">
          <FrGrid>
            <FrField label="Subtask name" required missing={missing.includes('name')} locked={lock('name')} mark={mark('name')} span={4}>
              <input value={form.name} disabled={lock('name')} onChange={(e) => set('name', e.target.value)} placeholder="What slice of work is this?" />
            </FrField>
            <FrField label="Priority" required missing={missing.includes('priority')} locked={lock('priority')} mark={mark('priority')}>
              <WsSelect value={form.priority} disabled={lock('priority')} options={PRIORITY_OPTS} onChange={(v) => set('priority', v)} />
            </FrField>
            <FrField label="Status" locked={lock('status')} mark={mark('status')}>
              <WsSelect value={form.status} disabled={lock('status')} options={STATUS_OPTS} onChange={(v) => set('status', v)} />
            </FrField>
            <FrField label="Parent task" locked={lock('task_id')} mark={mark('task_id')}>
              <WsSelect
                value={form.task_id}
                disabled={lock('task_id')}
                placeholder="Select..."
                options={[{ value: '', label: 'Select...' }, ...tasks]}
                onChange={(v) => set('task_id', v)}
              />
            </FrField>
            <FrField label="Assigned to" required missing={missing.includes('assigned_to_name')} locked={lock('assigned_to_name')} mark={mark('assigned_to_name')}>
              <PersonPicker value={form.assigned_to_name} disabled={lock('assigned_to_name')} onChange={(v) => set('assigned_to_name', v)} placeholder="Type a name..." />
            </FrField>
          </FrGrid>
        </FrSection>
        <FrSection label="Schedule">
          <FrGrid>
            <FrField label="Start date" locked={lock('start_date')} mark={mark('start_date')}>
              <WsDate value={form.start_date} disabled={lock('start_date')} onChange={(v) => set('start_date', v)} />
            </FrField>
            <FrField label="End date" locked={lock('end_date')} mark={mark('end_date')}>
              <WsDate value={form.end_date} disabled={lock('end_date')} min={form.start_date} onChange={(v) => set('end_date', v)} />
            </FrField>
            <FrField label="Summary" locked={lock('summary')} mark={mark('summary')} span={4}>
              <textarea rows={5} value={form.summary} disabled={lock('summary')} onChange={(e) => set('summary', e.target.value)} placeholder="Keep this small enough to finish in one cycle." />
            </FrField>
          </FrGrid>
        </FrSection>
      </FrAcc>
        </FrSheetMain>
      </FrSheetBody>
      <FrFoot>
        <button className="ws-btn ghost" type="button" disabled={busy || readOnly} onClick={() => void save('save')}>Save</button>
        <button className="ws-btn ghost" type="button" onClick={() => nav(back, { state: stateFor(back, loc) })}>Discard</button>
        <button className="ws-btn" type="button" disabled={busy || readOnly} onClick={() => void save('submit')}>{busy ? 'Saving...' : 'Submit'}</button>
      </FrFoot>
    </FrSheet>
  )
}
