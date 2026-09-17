import { useEffect, useState } from 'react'
import { mastersApi } from '../api/client'
import { useDebounced } from '../lib/useDebounced'
import { Alert } from './AdminKit'
import { FrAcc, FrField, FrGrid, FrHeader, FrPage, FrPanel, FrSection } from './FormReference'

type Row = Record<string, unknown>
type Field = { key: string; label: string; placeholder?: string }
type Crud = typeof mastersApi.companies

function MasterModule({
  title, noun, api, fields,
}: {
  title: string
  noun: string
  subtitle: string
  icon: string
  api: Crud
  fields: Field[]
}) {
  const empty = Object.fromEntries(fields.map((f) => [f.key, ''])) as Record<string, string>
  const [rows, setRows] = useState<Row[]>([])
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState<string>('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    const r = await api.list({ search: q || undefined, limit: 400 })
    setRows(r.rows)
  }
  useEffect(() => { void load().catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load')) }, [q])

  const filtered = rows

  function startCreate() {
    setEditId('')
    setForm(empty)
    setOpen(true)
    setErr('')
  }
  function startEdit(row: Row) {
    setEditId(String(row.id))
    setForm(Object.fromEntries(fields.map((f) => [f.key, String(row[f.key] || '')])))
    setOpen(true)
    setErr('')
  }
  async function save() {
    if (!String(form.name || '').trim()) {
      setErr('Name is required')
      return
    }
    setBusy(true)
    setErr('')
    try {
      if (editId) await api.update(editId, form)
      else await api.create(form)
      setMsg(editId ? 'Updated' : 'Created')
      setOpen(false)
      setForm(empty)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }
  async function remove(id: string) {
    if (!confirm('Delete this record?')) return
    await api.remove(id)
    setMsg('Deleted')
    await load()
  }

  return (
    <FrPage>
      <FrHeader title={title} count={`${filtered.length} total records`}>
        <input className="fr-search" placeholder={`Search records...`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="ws-btn" type="button" onClick={startCreate}><i className="ri-add-line" />Create</button>
      </FrHeader>
      {err ? <Alert kind="err">{err}</Alert> : null}
      {msg ? <Alert kind="ok">{msg}</Alert> : null}

      {open ? (
        <FrAcc>
          <FrSection label={editId ? `Edit ${noun}` : `New ${noun}`}>
            <div className="fr-sec-tools">
              <button className="ws-btn ghost" type="button" onClick={() => setOpen(false)}>Discard</button>
              <button className="ws-btn" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Submit'}</button>
            </div>
            <FrGrid>
              {fields.map((f) => (
                <FrField key={f.key} label={f.label} required={f.key === 'name'} span={fields.length === 1 ? 4 : 2}>
                  <input
                    value={form[f.key] || ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </FrField>
              ))}
            </FrGrid>
          </FrSection>
        </FrAcc>
      ) : null}

      <FrPanel>
        <div className="fr-table-wrap">
          <table className="fr-table">
            <thead>
              <tr>
                {fields.map((f) => <th key={f.key}>{f.label}</th>)}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={fields.length + 1} className="fr-empty">No records found</td></tr>
              ) : filtered.map((r) => (
                <tr key={String(r.id)}>
                  {fields.map((f) => <td key={f.key}>{String(r[f.key] || '—')}</td>)}
                  <td className="ak-acts">
                    <button className="emp-act edit" type="button" title="Edit" onClick={() => startEdit(r)}><i className="ri-pencil-line" /></button>
                    <button className="emp-act danger" type="button" title="Delete" onClick={() => void remove(String(r.id))}><i className="ri-delete-bin-line" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FrPanel>
    </FrPage>
  )
}

export function CompaniesPage() {
  return (
    <MasterModule
      title="Companies"
      noun="company"
      subtitle="legal entities used across projects"
      icon="ri-building-line"
      api={mastersApi.companies}
      fields={[
        { key: 'name', label: 'Name', placeholder: 'Refex Industries Limited' },
        { key: 'code', label: 'Code', placeholder: 'RIL' },
        { key: 'notes', label: 'Notes' },
      ]}
    />
  )
}

export function DepartmentsPage() {
  return (
    <MasterModule
      title="Departments"
      noun="department"
      subtitle="org units from HRMS and local masters"
      icon="ri-building-4-line"
      api={mastersApi.departments}
      fields={[
        { key: 'name', label: 'Name', placeholder: 'Finance & Accounts' },
        { key: 'notes', label: 'Notes' },
      ]}
    />
  )
}

export function LocationsPage() {
  return (
    <MasterModule
      title="Locations"
      noun="location"
      subtitle="offices and sites"
      icon="ri-map-pin-line"
      api={mastersApi.locations}
      fields={[
        { key: 'name', label: 'Name', placeholder: 'Chennai' },
        { key: 'address', label: 'Address' },
        { key: 'notes', label: 'Notes' },
      ]}
    />
  )
}
