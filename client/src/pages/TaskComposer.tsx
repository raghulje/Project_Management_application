import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { activityApi, employeesApi, projectsApi, tasksApi } from '../api/client'
import { useAuth } from '../api/AuthContext'
import { COMPANY_OPTS, PRIORITY_OPTS, STATUS_OPTS, TASK_TYPE_OPTS, dateInput } from './RecordUi'
import { initials } from './WorkspaceKit'

type Person = { name: string }
type Comment = { id?: number; body: string; created_by_name?: string; created_at?: string; local?: boolean }
type FileRow = { id?: number; file_name: string; size_bytes?: number; created_by_name?: string; created_at?: string; file?: File }

function progressFor(status: string) {
  const s = status.toLowerCase()
  if (s.includes('complete') || s.includes('closed') || s.includes('done')) return 100
  if (s.includes('progress') || s.includes('review')) return 55
  if (s.includes('hold')) return 30
  return 0
}

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
  const { user } = useAuth()
  const me = user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'You'
  const detailRef = useRef<HTMLTextAreaElement>(null)
  const commentRef = useRef<HTMLTextAreaElement>(null)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [projects, setProjects] = useState<{ value: string; label: string }[]>([])
  const [siblings, setSiblings] = useState<{ value: string; label: string }[]>([])
  const [tab, setTab] = useState<'status' | 'comments' | 'files'>('status')
  const [rail, setRail] = useState<'open' | 'min' | 'max'>('open')
  const [mentionQ, setMentionQ] = useState('')
  const [mentionFor, setMentionFor] = useState<'comment' | null>(null)

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

  useEffect(() => {
    employeesApi.selectlist().then((r) => {
      setPeople((r.results || []).map((o) => ({ name: o.text.replace(/\s+\([^)]+\)\s*$/, '') })))
    }).catch(() => undefined)
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
      if (r.assigned_to_name) setTagged((prev) => prev.includes(String(r.assigned_to_name)) ? prev : [...prev, String(r.assigned_to_name)])
    })
    activityApi.bundle('task', id).then((b) => {
      setComments(b.comments as Comment[])
      setFiles(b.files as FileRow[])
      setTagged((b.assignees || []).map((a) => String(a.person_name)))
    }).catch(() => undefined)
  }, [id, me])

  function set<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  function toggleTag(name: string) {
    setTagged((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name])
    if (!form.assigned_to_name) set('assigned_to_name', name)
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

  const pct = progressFor(form.status)
  const names = useMemo(() => {
    const extra = [form.assigned_to_name, form.secondary_assignee_name, ...tagged].filter(Boolean)
    return [...new Set([...people.map((p) => p.name), ...extra])]
  }, [people, tagged, form.assigned_to_name, form.secondary_assignee_name])

  const mentionHits = mentionQ
    ? names.filter((n) => n.toLowerCase().includes(mentionQ.toLowerCase())).slice(0, 6)
    : names.slice(0, 6)

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
    toggleTag(name)
    setMentionFor(null)
    commentRef.current?.focus()
  }

  async function persistExtras(taskId: string) {
    const pendingComments = comments.filter((c) => c.local)
    const pendingFiles = files.filter((f) => f.file)
    await activityApi.setAssignees('task', taskId, tagged)
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
      setErr('Fill the required fields — name, priority, dates, and assigned to.')
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
      nav(mode === 'submit' ? `/tasks/${taskId}` : `/tasks/${taskId}/edit`)
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

  const back = id ? `/tasks/${id}` : (form.project_id ? `/projects/${form.project_id}` : '/tasks')
  const projectLabel = projects.find((p) => p.value === form.project_id)?.label || form.project_name || 'Select a project'

  return (
    <div className={`tc${rail === 'max' ? ' is-max' : ''}${rail === 'min' ? ' is-min' : ''}`}>
      <header className="tc-head">
        <div>
          <Link className="ws-back" to={back}><i className="ri-arrow-left-line" />{id ? 'Back to task' : 'Back'}</Link>
          <h1><i className="ri-menu-line" /> Task details</h1>
        </div>
        <div className="tc-head-actions">
          <button className="ws-btn ghost" type="button" title="Minimize sidebar" onClick={() => setRail((r) => r === 'min' ? 'open' : 'min')}>
            <i className={rail === 'min' ? 'ri-side-bar-line' : 'ri-subtract-line'} />
          </button>
          <button className="ws-btn ghost" type="button" title="Maximize sidebar" onClick={() => setRail((r) => r === 'max' ? 'open' : 'max')}>
            <i className={rail === 'max' ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'} />
          </button>
        </div>
      </header>

      {err ? <div className="pc-alert">{err}</div> : null}

      <div className="tc-body">
        <div className="tc-main">
          <section className="pc-card">
            <div className="pc-row pc-3">
              <Box label="Task name" required missing={missing.includes('name')}>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="What needs to be done?" />
              </Box>
              <Box label="Task priority" required missing={missing.includes('priority')}>
                <select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                  {PRIORITY_OPTS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Box>
              <Box label="Project">
                <select value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
                  <option value="">Select…</option>
                  {projects.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </Box>
            </div>
            <div className="pc-row pc-2">
              <Box label="Task type">
                <select value={form.task_type} onChange={(e) => set('task_type', e.target.value)}>
                  <option value="">Select…</option>
                  {TASK_TYPE_OPTS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Box>
              <Box label="Entity">
                <select value={form.entity} onChange={(e) => set('entity', e.target.value)}>
                  <option value="">Select…</option>
                  {COMPANY_OPTS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Box>
            </div>
            <div className="tc-dep">
              <span>Is dependent on another task?</span>
              <div className="pc-yesno" style={{ maxWidth: 160 }}>
                <button type="button" className={form.is_dependent === '1' ? 'is-on' : ''} onClick={() => set('is_dependent', '1')}>Yes</button>
                <button type="button" className={form.is_dependent === '0' ? 'is-on' : ''} onClick={() => set('is_dependent', '0')}>No</button>
              </div>
              {form.is_dependent === '1' ? (
                <select value={form.dependent_on_task_id} onChange={(e) => set('dependent_on_task_id', e.target.value)}>
                  <option value="">Depends on…</option>
                  {siblings.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              ) : null}
            </div>
            <div className="pc-row pc-4">
              <Box label="Start date" required missing={missing.includes('start_date')}>
                <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
              </Box>
              <Box label="End date" required missing={missing.includes('end_date')}>
                <input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
              </Box>
              <Box label="Assigned to" required missing={missing.includes('assigned_to_name')}>
                <input list="tc-people" value={form.assigned_to_name} onChange={(e) => {
                  set('assigned_to_name', e.target.value)
                  const n = e.target.value.trim()
                  if (n) setTagged((prev) => prev.includes(n) ? prev : [...prev, n])
                }} />
              </Box>
              <Box label="Secondary assignee">
                <input list="tc-people" value={form.secondary_assignee_name} onChange={(e) => set('secondary_assignee_name', e.target.value)} />
              </Box>
            </div>
            <div className="pc-row pc-2">
              <Box label="Task detail">
                <div className="tc-editor">
                  <textarea ref={detailRef} rows={7} value={form.detail} onChange={(e) => set('detail', e.target.value)} placeholder="Describe the work…" />
                  <div className="tc-toolbar">
                    <button type="button" onClick={() => wrap('**')}><b>B</b></button>
                    <button type="button" onClick={() => wrap('_')}><i>I</i></button>
                    <button type="button" onClick={() => wrap('~')}>S</button>
                    <span />
                  </div>
                </div>
              </Box>
              <Box label="Supporting document">
                <label className="tc-drop">
                  <i className="ri-attachment-2" />
                  <b>Upload files</b>
                  <em>Drag and drop or paste from clipboard</em>
                  <input type="file" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files) }} />
                </label>
                {files.slice(0, 3).map((f, i) => (
                  <p key={String(f.id || i)} className="tc-file-mini">{f.file_name}</p>
                ))}
              </Box>
            </div>
            <Box label="Task status">
              <select value={form.status} onChange={(e) => set('status', e.target.value)} style={{ maxWidth: 240 }}>
                {STATUS_OPTS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Box>
          </section>
        </div>

        <aside className="tc-rail">
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
            <button type="button" className="tc-size" onClick={() => setRail((r) => r === 'min' ? 'open' : 'min')} title={rail === 'min' ? 'Expand' : 'Minimize'}>
              <i className={rail === 'min' ? 'ri-arrow-left-s-line' : 'ri-arrow-right-s-line'} />
            </button>
          </div>

          {rail !== 'min' ? (
            <div className="tc-panel">
              {tab === 'status' ? (
                <>
                  <div className="tc-panel-h"><b>Status</b><span>{form.status || 'Draft'}</span></div>
                  <div className="tc-prog">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <p className="tc-prog-lab">{pct}% · {pct === 0 ? 'Draft' : form.status}</p>
                  <div className="tc-init">
                    <span>Initiated by</span>
                    <div className="ws-chip"><span className="ws-ava">{initials(form.created_by_name || me)}</span>{form.created_by_name || me}</div>
                  </div>
                  <div className="tc-assign">
                    <b>Assign & tag</b>
                    <p>Check people to assign. Type @ in comments to tag them.</p>
                    <div className="tc-people">
                      {names.slice(0, 18).map((n) => (
                        <label key={n} className={`tc-check${tagged.includes(n) ? ' is-on' : ''}`}>
                          <input type="checkbox" checked={tagged.includes(n)} onChange={() => toggleTag(n)} />
                          <span className="ws-ava">{initials(n)}</span>
                          {n}
                        </label>
                      ))}
                    </div>
                    {form.assigned_to_name ? <p className="ws-sub">Primary: {form.assigned_to_name}</p> : null}
                    <p className="ws-sub">{projectLabel}</p>
                  </div>
                </>
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
                            <span>{f.size_bytes ? `${Math.ceil(Number(f.size_bytes) / 1024)} KB` : ''} · {f.created_by_name || ''}</span>
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
        </aside>
      </div>

      <footer className="tc-foot">
        <button className="ws-btn ghost" type="button" disabled={busy} onClick={() => void save('save')}>Save</button>
        <button className="ws-btn ghost" type="button" onClick={() => nav(back)}>Discard</button>
        <button className="ws-btn" type="button" disabled={busy} onClick={() => void save('submit')}>{busy ? 'Saving…' : 'Submit'}</button>
      </footer>
      <datalist id="tc-people">{names.map((n) => <option key={n} value={n} />)}</datalist>
    </div>
  )
}

function Box({ label, required, missing, children }: { label: string; required?: boolean; missing?: boolean; children: ReactNode }) {
  return (
    <label className={`pc-field${missing ? ' is-miss' : ''}`}>
      <span>{label}{required ? <i>*</i> : null}</span>
      {children}
    </label>
  )
}
