import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { projectsApi, tasksApi } from '../api/client'
import KanbanBoard from './KanbanBoard'

export default function BoardPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [projects, setProjects] = useState<{ id: string; text: string }[]>([])
  const [q, setQ] = useState('')
  const [projectId, setProjectId] = useState('')
  async function load() {
    const r = await tasksApi.list({ search: q, limit: 400, project_id: projectId || undefined })
    setRows(r.rows)
  }
  useEffect(() => {
    projectsApi.selectlist().then((r) => setProjects((r.results || []).map((o) => ({ id: String(o.id), text: o.text }))))
  }, [])
  useEffect(() => { void load() }, [q, projectId])
  return (
    <div className="ws">
      <div className="ws-hero">
        <div className="ws-hero-top">
          <div>
            <div className="ws-kicker">Workspace</div>
            <h1 className="ws-title">Task board</h1>
            <p className="ws-sub">Drag cards between columns to update status. Click a card to open the record.</p>
          </div>
          <div className="ws-actions">
            <Link className="ws-btn" to="/tasks/new"><i className="ri-add-line" />New task</Link>
            <Link className="ws-btn ghost" to="/tasks"><i className="ri-list-check-2" />List view</Link>
          </div>
        </div>
      </div>
      <div className="pm-toolbar ws-toolbar">
        <input placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.text}</option>)}
        </select>
        <span className="ws-count">{rows.length} cards</span>
      </div>
      <KanbanBoard items={rows} onChanged={() => void load()} />
    </div>
  )
}
