import { useEffect, useState } from 'react'
import { dashboardApi } from '../api/client'

export default function Dashboard() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [charts, setCharts] = useState<Awaited<ReturnType<typeof dashboardApi.charts>> | null>(null)
  useEffect(() => {
    dashboardApi.counts().then(setCounts)
    dashboardApi.charts().then(setCharts)
  }, [])

  const tiles = [
    ['Projects', counts.projects],
    ['Open projects', counts.open_projects],
    ['Overdue projects', counts.overdue_projects],
    ['Tasks', counts.tasks],
    ['Open tasks', counts.open_tasks],
    ['Overdue tasks', counts.overdue_tasks],
    ['Subtasks', counts.subtasks],
    ['Employees', counts.employees],
  ] as const

  return (
    <>
      <div className="top"><h1>Dashboard</h1></div>
      <div className="stats">
        {tiles.map(([label, n]) => (
          <div className="stat" key={label}><b>{n ?? '—'}</b><span>{label}</span></div>
        ))}
      </div>
      <div className="stats">
        {charts?.status && (
          <div className="card">
            <h3>Project status</h3>
            {charts.status.map((r) => <div key={r.label}>{r.label}: {r.value}</div>)}
          </div>
        )}
        {charts?.rag && (
          <div className="card">
            <h3>RAG</h3>
            {charts.rag.map((r) => <div key={r.label}>{r.label}: {r.value}</div>)}
          </div>
        )}
        {charts?.taskStatus && (
          <div className="card">
            <h3>Task status</h3>
            {charts.taskStatus.map((r) => <div key={r.label}>{r.label}: {r.value}</div>)}
          </div>
        )}
      </div>
    </>
  )
}
