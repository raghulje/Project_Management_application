import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { activityApi, employeesApi, projectsApi, tasksApi } from '../api/client'
import { useAuth } from '../api/AuthContext'
import { COMPANY_OPTS, PRIORITY_OPTS, STATUS_OPTS, TASK_TYPE_OPTS, dateInput } from './RecordUi'
import { initials } from './WorkspaceKit'
import {
  AccessMark, PolicyBanner, RequestAccessModal, asPolicy, canSaveRecord, fieldAccess,
  useRequestAccess, type EditPolicy,
} from './FieldAccess'
import WsSelect from './WsSelect'
import WsDate from './WsDate'
import PersonPicker from './PersonPicker'
import StatusTracker, { type StatusRevision } from './StatusTracker'
import { defaultList, fromState, pageCrumbs, stateFor } from '../lib/recordNav'
import { FrAcc, FrField, FrFoot, FrGrid, FrSheet, FrSheetBody, FrSheetHead, FrSheetMain, FrSection, FrYesNo } from './FormReference'

type Comment = { id?: number; body: string; created_by_name?: string; created_at?: string; local?: boolean }
type FileRow = { id?: number; file_name: string; size_bytes?: number; created_by_name?: string; created_at?: string; file?: File }

function when(ts?: string) {
  if (!ts) return 'Just now'
  const d = new Date(ts.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function TaskComposer() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const loc = useLocation()
  const { user, isEmployee } = useAuth()
  const me = user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'You'
  const detailRef = useRef<HTMLTextAreaElement>(null)
  const commentRef = useRef<HTMLTextAreaElement>(null)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [policy, setPolicy] = useState<EditPolicy | null>(null)
  const req = useRequestAccess()
  const [projects, setProjects] = useState<{ value: string; label: string }[]>([])
  const [siblings, setSiblings] = useState<{ value: string; label: string }[]>([])
  const [tab, setTab] = useState<'status' | 'comments' | 'files'>('status')
  const [rail, setRail] = useState<'open' | 'min'>('open')
  const [mentionQ, setMentionQ] = useState('')
  const [mentionFor, setMentionFor] = useState<'comment' | null>(null)
  const [mentionHits, setMentionHits] = useState<string[]>([])

  const [form, setForm] = useState({
    name: '',
    priority: 'Low',
    project_id: params.get('project_id') || '',
    project_name: '',
    task_type: '',
    entity: '',
    is_dependent: '0',
    dependent_on_task_id: '',
    start_date: '',
    end_date: '',
    assigned_to_name: '',
    secondary_assignee_name: '',
    detail: '',
    status: 'Open',
    created_by_name: me,
  })
  const [tagged, setTagged] = useState<string[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [draft, setDraft] = useState('')
  const [createdAt, setCreatedAt] = useState('')
  const [revisions, setRevisions] = useState<StatusRevision[]>([])

  useEffect(() => {
    projectsApi.selectlist().then((r) => {
      setProjects((r.results || []).map((o) => ({ value: String(o.id), label: o.text })))
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!form.project_id) { setSiblings([]); return }
    tasksApi.list({ project_id: form.project_id, limit: 200 }).then((r) => {
      setSiblings(r.rows.filter((o) => String(o.id) !== String(id)).map((o) => ({ value: String(o.id), label: String(o.name) })))
    }).catch(() => undefined)
  }, [form.project_id, id])

  useEffect(() => {
    if (!id) return
    tasksApi.get(id).then((r) => {
      setPolicy(asPolicy(r.edit_policy))
      setForm({
        name: String(r.name || ''),
        priority: String(r.priority || 'Low'),
        project_id: r.project_id != null ? String(r.project_id) : '',
        project_name: String(r.project_name || ''),
        task_type: String(r.task_type || ''),
        entity: String(r.entity || ''),
        is_dependent: r.is_dependent ? '1' : '0',
        dependent_on_task_id: r.dependent_on_task_id != null ? String(r.dependent_on_task_id) : '',
        start_date: dateInput(r.start_date),
        end_date: dateInput(r.end_date),
        assigned_to_name: String(r.assigned_to_name || ''),
        secondary_assignee_name: String(r.secondary_assignee_name || ''),
        detail: String(r.detail || ''),
        status: String(r.status || 'Open'),
        created_by_name: String(r.created_by_name || me),
      })
      setCreatedAt(String(r.created_at || r.kissflow_created_at || ''))
      setRevisions((r.revisions as StatusRevision[]) || [])
      if (r.assigned_to_name) setTagged((prev) => prev.includes(String(r.assigned_to_name)) ? prev : [...prev, String(r.assigned_to_name)])
    })
    activityApi.bundle('task', id).then((b) => {
      setComments(b.comments as Comment[])
      setFiles(b.files as FileRow[])
      setTagged((b.assignees || []).map((a) => String(a.person_name)))
    }).catch(() => undefined)
  }, [id, me])

  function set<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  function addAssignee(name: string) {
    const n = name.trim()
    if (!n) return
    setTagged((prev) => prev.includes(n) ? prev : [...prev, n])
    if (!form.assigned_to_name) set('assigned_to_name', n)
  }

  function removeAssignee(name: string) {
    setTagged((prev) => prev.filter((n) => n !== name))
    if (form.assigned_to_name === name) set('assigned_to_name', '')
    if (form.secondary_assignee_name === name) set('secondary_assignee_name', '')
  }

  function wrap(mark: string) {
    const el = detailRef.current
    if (!el) return
    const a = el.selectionStart
    const b = el.selectionEnd
    const next = form.detail.slice(0, a) + mark + form.detail.slice(a, b) + mark + form.detail.slice(b)
    set('detail', next)
  }

  const missing = useMemo(() => {
    const req = ['name', 'priority', 'start_date', 'end_date', 'assigned_to_name']
    return req.filter((k) => !String(form[k as keyof typeof form] || '').trim())
  }, [form])

  const assignees = useMemo(
    () => [...new Set([form.assigned_to_name, form.secondary_assignee_name, ...tagged].filter(Boolean))],
    [tagged, form.assigned_to_name, form.secondary_assignee_name],
  )
  const mentionSearch = mentionQ

  useEffect(() => {
    if (!mentionFor) {
      setMentionHits([])
      return
    }
    let live = true
    employeesApi.selectlist(mentionSearch || undefined, 8).then((r) => {
      if (!live) return
      setMentionHits((r.results || []).map((o) => String(o.text || '').replace(/\s+\([^)]+\)\s*$/, '')).filter(Boolean))
    }).catch(() => { if (live) setMentionHits([]) })
    return () => { live = false }
  }, [mentionFor, mentionSearch])

  function onDraft(v: string) {
    setDraft(v)
    const at = v.lastIndexOf('@')
    if (at >= 0 && !v.slice(at).includes(' ')) {
      setMentionFor('comment')
      setMentionQ(v.slice(at + 1))
    } else {
      setMentionFor(null)
      setMentionQ('')
    }
  }

  function pickMention(name: string) {
    const at = draft.lastIndexOf('@')
    const next = `${draft.slice(0, at)}@${name} `
    setDraft(next)
    addAssignee(name)
    setMentionFor(null)
    commentRef.current?.focus()
  }

  async function persistExtras(taskId: string) {
    const pendingComments = comments.filter((c) => c.local)
    const pendingFiles = files.filter((f) => f.file)
    await activityApi.setAssignees('task', taskId, assignees)
    for (const c of pendingComments) await activityApi.comment('task', taskId, c.body)
    for (const f of pendingFiles) if (f.file) await activityApi.upload('task', taskId, f.file)
    const b = await activityApi.bundle('task', taskId)
    setComments(b.comments as Comment[])
    setFiles(b.files as FileRow[])
    setTagged((b.assignees || []).map((a) => String(a.person_name)))
  }

  async function save(mode: 'save' | 'submit') {
    setErr('')
    if (missing.length) {
      setErr('Fill the required fields - name, priority, dates, and assigned to.')
      return
    }
    setBusy(true)
    try {
      const body = {
        ...form,
        project_id: form.project_id ? Number(form.project_id) : null,
        is_dependent: form.is_dependent === '1',
        dependent_on_task_id: form.dependent_on_task_id ? Number(form.dependent_on_task_id) : null,
        status: mode === 'submit' && form.status === 'Open' ? 'Open' : form.status,
        created_by_name: form.created_by_name || me,
      }
      let taskId = id || ''
      if (id) {
        await tasksApi.update(id, body)
      } else {
        const created = await tasksApi.create(body)
        taskId = String(created.payload?.id || '')
      }
      if (taskId) await persistExtras(taskId)
      nav(mode === 'submit' ? `/tasks/${taskId}` : `/tasks/${taskId}/edit`, { state: loc.state })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the task')
    } finally {
      setBusy(false)
    }
  }

  async function sendComment() {
    const body = draft.trim()
    if (!body) return
    if (!id) {
      setComments((c) => [...c, { body, created_by_name: me, created_at: new Date().toISOString(), local: true }])
      setDraft('')
      return
    }
    await activityApi.comment('task', id, body)
    const b = await activityApi.bundle('task', id)
    setComments(b.comments as Comment[])
    setTagged((b.assignees || []).map((a) => String(a.person_name)))
    setDraft('')
  }

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list)
    if (!incoming.length) return
    if (!id) {
      setFiles((f) => [...incoming.map((file) => ({ file_name: file.name, size_bytes: file.size, file })), ...f])
      return
    }
    for (const file of incoming) await activityApi.upload('task', id, file)
    const b = await activityApi.bundle('task', id)
    setFiles(b.files as FileRow[])
  }

  const from = fromState(loc)
  const back = id
    ? `/tasks/${id}`
    : (from || (form.project_id ? `/projects/${form.project_id}?tab=tasks` : defaultList('task', isEmployee)))
  const projectLabel = projects.find((p) => p.value === form.project_id)?.label || form.project_name || 'Select a project'
  const lock = (f: string) => fieldAccess(policy, f).locked
  const mark = (f: string) => <AccessMark policy={policy} field={f} onRequest={req.ask} />
  const readOnly = !canSaveRecord(policy)
  const crumbs = pageCrumbs({
    loc,
    kind: 'task',
    isEmployee,
    current: id ? 'Edit' : 'New task',
    parents: [
      form.project_id && projectLabel && projectLabel !== 'Select a project'
        ? { to: `/projects/${form.project_id}?tab=tasks`, label: projectLabel }
        : null,
      id ? { to: `/tasks/${id}`, label: form.name || 'Task' } : null,
    ],
  })

  return (
    <FrSheet min={rail === 'min'}>
      <FrSheetHead title="Task" crumbs={crumbs} closeTo={back} closeState={stateFor(back, loc)}>
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
          itemType="task"
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
            <FrSection label="Task Details">
              <FrGrid>
                <FrField label="Task name" required missing={missing.includes('name')} locked={lock('name')} mark={mark('name')} span={4}>
                  <input value={form.name} disabled={lock('name')} onChange={(e) => set('name', e.target.value)} placeholder="What needs to be done?" />
                </FrField>
                <FrField label="Task priority" required missing={missing.includes('priority')} locked={lock('priority')} mark={mark('priority')}>
                  <WsSelect value={form.priority} disabled={lock('priority')} options={PRIORITY_OPTS} onChange={(v) => set('priority', v)} />
                </FrField>
                <FrField label="Project" locked={lock('project_id')} mark={mark('project_id')}>
                  <WsSelect
                    value={form.project_id}
                    disabled={lock('project_id')}
                    placeholder="Select..."
                    options={[{ value: '', label: 'Select...' }, ...projects]}
                    onChange={(v) => set('project_id', v)}
                  />
                </FrField>
                <FrField label="Task type" locked={lock('task_type')} mark={mark('task_type')}>
                  <WsSelect value={form.task_type} disabled={lock('task_type')} placeholder="Select..." options={[{ value: '', label: 'Select...' }, ...TASK_TYPE_OPTS]} onChange={(v) => set('task_type', v)} />
                </FrField>
                <FrField label="Entity" locked={lock('entity')} mark={mark('entity')}>
                  <WsSelect value={form.entity} disabled={lock('entity')} placeholder="Select..." options={[{ value: '', label: 'Select...' }, ...COMPANY_OPTS]} onChange={(v) => set('entity', v)} />
                </FrField>
                <FrField label="Is dependent on another task?" locked={lock('is_dependent')} mark={mark('is_dependent')} span={2}>
                  <FrYesNo
                    value={form.is_dependent === '1'}
                    disabled={lock('is_dependent')}
                    onChange={(v) => {
                      set('is_dependent', v ? '1' : '0')
                      if (!v) set('dependent_on_task_id', '')
                    }}
                  />
                </FrField>
                {form.is_dependent === '1' ? (
                  <FrField label="Depends on" locked={lock('dependent_on_task_id')} mark={mark('dependent_on_task_id')} span={2}>
                    <WsSelect
                      value={form.dependent_on_task_id}
                      disabled={lock('dependent_on_task_id')}
                      placeholder="Select a task..."
                      options={[{ value: '', label: 'Select a task...' }, ...siblings]}
                      onChange={(v) => set('dependent_on_task_id', v)}
                    />
                  </FrField>
                ) : null}
              </FrGrid>
            </FrSection>
            <FrSection label="Schedule">
              <FrGrid>
                <FrField label="Start date" required missing={missing.includes('start_date')} locked={lock('start_date')} mark={mark('start_date')}>
                  <WsDate value={form.start_date} disabled={lock('start_date')} onChange={(v) => set('start_date', v)} />
                </FrField>
                <FrField label="End date" required missing={missing.includes('end_date')} locked={lock('end_date')} mark={mark('end_date')}>
                  <WsDate value={form.end_date} disabled={lock('end_date')} min={form.start_date} onChange={(v) => set('end_date', v)} />
                </FrField>
                <FrField label="Assigned to" required missing={missing.includes('assigned_to_name')} locked={lock('assigned_to_name')} mark={mark('assigned_to_name')}>
                  <PersonPicker
                    value={form.assigned_to_name}
                    disabled={lock('assigned_to_name')}
                    placeholder="Type a name..."
                    onChange={(v) => set('assigned_to_name', v)}
                    onSelect={(v) => addAssignee(v)}
                  />
                </FrField>
                <FrField label="Secondary assignee" locked={lock('secondary_assignee_name')} mark={mark('secondary_assignee_name')}>
                  <PersonPicker
                    value={form.secondary_assignee_name}
                    disabled={lock('secondary_assignee_name')}
                    placeholder="Type a name..."
                    onChange={(v) => set('secondary_assignee_name', v)}
                    onSelect={(v) => addAssignee(v)}
                  />
                </FrField>
                <FrField label="Task status" locked={lock('status')} mark={mark('status')}>
                  <WsSelect value={form.status} disabled={lock('status')} options={STATUS_OPTS} onChange={(v) => set('status', v)} />
                </FrField>
              </FrGrid>
            </FrSection>
            <FrSection label="Detail">
              <FrGrid>
                <FrField label="Task detail" locked={lock('detail')} mark={mark('detail')} span={4}>
                  <div className="tc-editor">
                    <textarea ref={detailRef} rows={7} value={form.detail} disabled={lock('detail')} onChange={(e) => set('detail', e.target.value)} placeholder="Describe the work..." />
                    <div className="tc-toolbar">
                      <button type="button" onClick={() => wrap('**')}><b>B</b></button>
                      <button type="button" onClick={() => wrap('_')}><i>I</i></button>
                      <button type="button" onClick={() => wrap('~')}>S</button>
                      <span />
                    </div>
                  </div>
                </FrField>
                <FrField label="Supporting document" span={4}>
                  <label className="tc-drop">
                    <i className="ri-attachment-2" />
                    <b>Upload files</b>
                    <em>Drag and drop or paste from clipboard</em>
                    <input type="file" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files) }} />
                  </label>
                  {files.slice(0, 3).map((f, i) => (
                    <p key={String(f.id || i)} className="tc-file-mini">{f.file_name}</p>
                  ))}
                </FrField>
              </FrGrid>
            </FrSection>
          </FrAcc>
        </FrSheetMain>

        <aside className="tc-rail-wrap">
          <div className="tc-rail">
            <button
              type="button"
              className="tc-collapse"
              title={rail === 'min' ? 'Expand' : 'Minimize'}
              onClick={() => setRail((r) => (r === 'min' ? 'open' : 'min'))}
            >
              <i className={rail === 'min' ? 'ri-arrow-left-s-line' : 'ri-arrow-right-s-line'} />
            </button>
            <div className="tc-tabs">
              <button type="button" className={tab === 'status' ? 'is-on green' : ''} onClick={() => { setTab('status'); if (rail === 'min') setRail('open') }} title="Status">
                <i className="ri-apps-2-add-line" />
              </button>
              <button type="button" className={tab === 'comments' ? 'is-on red' : ''} onClick={() => { setTab('comments'); if (rail === 'min') setRail('open') }} title="Comments">
                <i className="ri-chat-3-line" />
              </button>
              <button type="button" className={tab === 'files' ? 'is-on teal' : ''} onClick={() => { setTab('files'); if (rail === 'min') setRail('open') }} title="Attachments">
                <i className="ri-image-line" />
              </button>
            </div>

            {rail !== 'min' ? (
              <div className="tc-panel">
                {tab === 'status' ? (
                  <StatusTracker
                    status={form.status}
                    saved={Boolean(id)}
                    createdBy={form.created_by_name || me}
                    createdAt={createdAt}
                    revisions={revisions}
                  />
                ) : null}

                {tab === 'comments' ? (
                  <>
                    <div className="tc-panel-h"><b>Comments</b></div>
                    <div className="tc-feed">
                      {comments.length === 0 ? (
                        <div className="tc-empty">
                          <i className="ri-send-plane-line" />
                          <b>No comments</b>
                          <span>Be the first to comment.</span>
                        </div>
                      ) : comments.map((c, i) => (
                        <article key={String(c.id || i)} className="tc-msg">
                          <span className="ws-ava">{initials(c.created_by_name)}</span>
                          <div>
                            <header><b>{c.created_by_name || 'Someone'}</b><time>{when(c.created_at)}</time></header>
                            <p>{c.body}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="tc-composer">
                      {mentionFor ? (
                        <div className="tc-mentions">
                          {mentionHits.map((n) => (
                            <button type="button" key={n} onClick={() => pickMention(n)}>
                              <span className="ws-ava">{initials(n)}</span>{n}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <textarea ref={commentRef} rows={3} value={draft} onChange={(e) => onDraft(e.target.value)} placeholder="@tag someone and write a comment" />
                      <div className="tc-composer-bar">
                        <label title="Attach to comment">
                          <i className="ri-attachment-2" />
                          <input type="file" hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files) }} />
                        </label>
                        <i className="ri-emotion-line" />
                        <button type="button" className="tc-send" onClick={() => void sendComment()}><i className="ri-send-plane-2-fill" /></button>
                      </div>
                    </div>
                  </>
                ) : null}

                {tab === 'files' ? (
                  <>
                    <div className="tc-panel-h"><b>Files</b></div>
                    {files.length === 0 ? (
                      <div className="tc-empty">
                        <i className="ri-folder-open-line" />
                        <b>No attachments added yet.</b>
                      </div>
                    ) : (
                      <ul className="tc-files">
                        {files.map((f, i) => (
                          <li key={String(f.id || i)}>
                            <i className="ri-file-3-line" />
                            <div>
                              <b>{f.file_name}</b>
                              <span>{f.size_bytes ? `${Math.ceil(Number(f.size_bytes) / 1024)} KB` : ''} - {f.created_by_name || ''}</span>
                            </div>
                            {f.id ? (
                              <button type="button" className="ws-btn ghost" onClick={() => void activityApi.download(f.id!, f.file_name)}>Open</button>
                            ) : <em>pending</em>}
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="tc-drop sm">
                      <i className="ri-upload-2-line" />
                      Add files
                      <input type="file" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files) }} />
                    </label>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      </FrSheetBody>

      <FrFoot>
        <button className="ws-btn ghost" type="button" disabled={busy || readOnly} onClick={() => void save('save')}>Save</button>
        <button className="ws-btn ghost" type="button" onClick={() => nav(back, { state: stateFor(back, loc) })}>Discard</button>
        <button className="ws-btn" type="button" disabled={busy || readOnly} onClick={() => void save('submit')}>{busy ? 'Saving...' : 'Submit'}</button>
      </FrFoot>
    </FrSheet>
  )
}
