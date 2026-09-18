import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { projectsApi, subtasksApi, tasksApi } from '../api/client'
import { Alert } from './AdminKit'
import { FrAcc, FrField, FrGrid, FrHeader, FrKpi, FrPage, FrSection, FrUpload } from './FormReference'

type Kind = 'project' | 'task' | 'subtask'

const META: Record<Kind, {
  title: string
  list: string
  listLabel: string
  api: typeof projectsApi
  hint: string
  columns: string[]
}> = {
  project: {
    title: 'Import projects',
    list: '/projects',
    listLabel: 'Projects',
    api: projectsApi,
    hint: 'One project per row. Required: name. Optional project_code updates an existing project.',
    columns: [
      'name', 'project_code', 'status', 'priority', 'rag', 'company_name',
      'entity', 'start_date', 'end_date', 'project_owner_name', 'requester_name',
    ],
  },
  task: {
    title: 'Import tasks',
    list: '/tasks',
    listLabel: 'Tasks',
    api: tasksApi,
    hint: 'One task per row. Required: name. Link a project with project_code or project_name. task_code updates an existing task.',
    columns: [
      'name', 'task_code', 'project_code', 'project_name', 'status', 'priority',
      'start_date', 'end_date', 'assigned_to_name', 'detail',
    ],
  },
  subtask: {
    title: 'Import subtasks',
    list: '/subtasks',
    listLabel: 'Subtasks',
    api: subtasksApi,
    hint: 'One subtask per row. Required: name. Link a task with task_code or task_name. subtask_code updates an existing subtask.',
    columns: [
      'name', 'subtask_code', 'task_code', 'task_name', 'status', 'priority', 'start_date', 'end_date', 'assigned_to_name', 'summary',
    ],
  },
}

export function RecordImportPage({ kind }: { kind: Kind }) {
  const meta = META[kind]
  const nav = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)

  const errors = Array.isArray(summary?.errors) ? summary.errors as Array<{ row: number; message: string }> : []

  return (
    <FrPage>
      <FrHeader
        crumbs={[{ to: meta.list, label: meta.listLabel }, { label: 'Import' }]}
        title={meta.title}
        count="Excel (.xlsx, .xls) or CSV"
      >
        <button className="ws-btn ghost" type="button" onClick={() => nav(meta.list)}>Discard</button>
        <button
          className="ws-btn"
          type="button"
          disabled={!file || busy}
          onClick={async () => {
            if (!file) return
            setBusy(true); setErr(''); setSummary(null)
            try { setSummary((await meta.api.importFile(file)).payload) }
            catch (e) { setErr(e instanceof Error ? e.message : 'Import failed') }
            finally { setBusy(false) }
          }}
        >
          {busy ? 'Importing...' : 'Import file'}
        </button>
      </FrHeader>
      {err ? <Alert kind="err">{err}</Alert> : null}
      {summary ? (
        <FrKpi cards={[
          { label: 'Created', value: Number(summary.created || 0), tone: 'green', icon: 'ri-add-line' },
          { label: 'Updated', value: Number(summary.updated || 0), icon: 'ri-refresh-line' },
          { label: 'Skipped', value: Number(summary.skipped || 0), tone: 'amber', icon: 'ri-skip-forward-line' },
        ]} />
      ) : null}
      <FrAcc>
        <FrSection label="1. Download template">
          <p className="fr-sub" style={{ margin: '0 0 14px' }}>{meta.hint}</p>
          <button
            className="ws-btn ghost"
            type="button"
            onClick={async () => {
              try { await meta.api.downloadTemplate() }
              catch (e) { setErr(e instanceof Error ? e.message : 'Template download failed') }
            }}
          >
            <i className="ri-download-2-line" />Download CSV template
          </button>
          <p className="fr-sub" style={{ marginTop: 12 }}>
            Columns: {meta.columns.join(', ')}. Extra columns are accepted if the header matches a field name.
          </p>
        </FrSection>
        <FrSection label="2. Upload file">
          <FrGrid>
            <FrField label="Spreadsheet" span={2}>
              <FrUpload file={file} accept=".xlsx,.xls,.csv" hint="Excel or CSV" onPick={setFile} onClear={() => setFile(null)} />
            </FrField>
          </FrGrid>
        </FrSection>
      </FrAcc>
      {errors.length ? (
        <FrAcc>
          <FrSection label="Row errors" count={errors.length}>
            <ul className="fr-sub" style={{ margin: 0, paddingLeft: 18 }}>
              {errors.slice(0, 30).map((e) => (
                <li key={`${e.row}-${e.message}`}>Row {e.row}: {e.message}</li>
              ))}
            </ul>
          </FrSection>
        </FrAcc>
      ) : null}
      {summary ? (
        <p className="fr-sub" style={{ marginTop: 8 }}>
          <Link to={meta.list}>View {meta.listLabel.toLowerCase()}</Link>
        </p>
      ) : null}
    </FrPage>
  )
}

export function ProjectImport() { return <RecordImportPage kind="project" /> }
export function TaskImport() { return <RecordImportPage kind="task" /> }
export function SubtaskImport() { return <RecordImportPage kind="subtask" /> }
