import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { projectsApi, tasksApi } from '../api/client'
import KanbanBoard from './KanbanBoard'
import WsSelect from './WsSelect'
import { navState } from '../lib/recordNav'
import { FrHeader, FrPage } from './FormReference'

export default function BoardPage() {
  const loc = useLocation()
  const hereState = navState(loc)
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
    <FrPage fill>
      <FrHeader
        crumbs={[{ to: '/', label: 'Home' }, { to: '/tasks', label: 'All tasks' }, { label: 'Board' }]}
        title="Task board"
        count={`${rows.length} total records`}
      >
        <input className="fr-search" placeholder="Search tasks..." value={q} onChange={(e) => setQ(e.target.value)} />
        <WsSelect
          size="sm"
          value={projectId}
          placeholder="All projects"
          options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.text }))]}
          onChange={setProjectId}
          className="ws-filter-select"
        />
        <Link className="ws-btn ghost" to="/tasks" state={hereState}><i className="ri-list-check-2" />List view</Link>
        <Link className="ws-btn" to="/tasks/new" state={hereState}><i className="ri-add-line" />New task</Link>
      </FrHeader>
      <KanbanBoard items={rows} filterKey={`${q}|${projectId}`} onChanged={() => void load()} />
    </FrPage>
  )
}
