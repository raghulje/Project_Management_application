import { useEffect, useState } from 'react'
import { activityApi } from '../api/client'
import { initials } from './WorkspaceKit'
import { FrSection } from './FormReference'

type Comment = { id?: number; body?: string; created_by_name?: string; created_at?: string }
type FileRow = { id?: number; file_name?: string; size_bytes?: number; created_by_name?: string }

function when(ts?: string) {
  if (!ts) return ''
  const d = new Date(String(ts).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(ts)
  return d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function RecordActivity({
  itemType,
  itemId,
}: {
  itemType: 'project' | 'task' | 'subtask'
  itemId: string
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!itemId) return
    const b = await activityApi.bundle(itemType, itemId)
    setComments((b.comments || []) as Comment[])
    setFiles((b.files || []) as FileRow[])
  }

  useEffect(() => { void load().catch(() => undefined) }, [itemType, itemId])

  async function send() {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      await activityApi.comment(itemType, itemId, body)
      setDraft('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length || busy) return
    setBusy(true)
    try {
      for (const file of Array.from(list)) await activityApi.upload(itemType, itemId, file)
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <FrSection label="Comments" count={comments.length}>
        <div className="tc-feed" style={{ padding: 0 }}>
          {comments.length === 0 ? (
            <div className="tc-empty">
              <i className="ri-chat-3-line" />
              <span>No comments yet.</span>
            </div>
          ) : comments.map((c) => (
            <article key={String(c.id)} className="tc-msg">
              <span className="ws-ava">{initials(c.created_by_name)}</span>
              <div>
                <header><b>{c.created_by_name || 'Someone'}</b><time>{when(c.created_at)}</time></header>
                <p>{c.body}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="tc-composer" style={{ marginTop: 12 }}>
          <textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a comment"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
            }}
          />
          <div className="tc-composer-bar">
            <button type="button" className="tc-send" disabled={busy || !draft.trim()} onClick={() => void send()}>
              <i className="ri-send-plane-2-fill" />
            </button>
          </div>
        </div>
      </FrSection>
      <FrSection label="Files" count={files.length}>
        {files.length === 0 ? (
          <div className="tc-empty">
            <i className="ri-folder-open-line" />
            <b>No attachments yet.</b>
          </div>
        ) : (
          <ul className="tc-files">
            {files.map((f) => (
              <li key={String(f.id)}>
                <i className="ri-file-3-line" />
                <div>
                  <b>{f.file_name}</b>
                  <span>{f.size_bytes ? `${Math.ceil(Number(f.size_bytes) / 1024)} KB` : ''} {f.created_by_name || ''}</span>
                </div>
                {f.id ? (
                  <button type="button" className="ws-btn ghost" onClick={() => void activityApi.download(f.id!, String(f.file_name || 'file'))}>Open</button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <label className="tc-drop sm">
          <i className="ri-upload-2-line" />
          Add files
          <input type="file" multiple hidden onChange={(e) => { void addFiles(e.target.files) }} />
        </label>
      </FrSection>
    </>
  )
}
