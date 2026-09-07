import type { ReactNode } from 'react'

export const STATUS_OPTS = ['Open', 'In Progress', 'On Hold', 'Completed', 'Closed', 'Cancelled']
export const PRIORITY_OPTS = ['High', 'Medium', 'Low']
export const TASK_TYPE_OPTS = ['Development', 'Enhancement', 'Bugfix', 'Support', 'Testing', 'Documentation', 'Deployment', 'Other']
export const RAG_OPTS = ['GREEN', 'AMBER', 'RED']
export const PROJECT_TYPE_OPTS = ['Tech', 'Non-tech']
export const FUNCTION_OPTS = ['Tech Application', 'Tech Infrastructure']
export const GOVERNANCE_OPTS = ['Daily', 'Weekly', 'Bi-weekly', 'Monthly']
export const RISK_OPTS = ['Low', 'Medium', 'High']
export const CATEGORY_OPTS = [
  'Information Technology', 'Administration', 'Corporate Communication', 'Finance & Accounts',
  'Fleet', 'Human Resource', 'Operations', 'Operations & Maintenance', 'Services',
]
export const COMPANY_OPTS = [
  '3iMEM_Med Tech', '3iMed Tech', 'ADMS_MedTech', 'Extrovis', 'RHPL_Group Shared Services',
  'RIL_Ash Handling', 'RIL_Shared Services', 'RRIL_Solar', 'Refex Green Mobility Limited',
  'Refex Group', 'Refex Holding Private Limited', 'Refex Industries Limited',
  'Refex Life Sciences Private Limited', 'Refex Shared Services Private Limited', 'Venwind',
]

export function dateInput(v: unknown) {
  const s = String(v || '')
  if (!s || s === 'null') return ''
  return s.slice(0, 10)
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pm-form-section">
      <h3>{title}</h3>
      <div className="pm-form-grid">{children}</div>
    </section>
  )
}

export function Field({
  label, value, onChange, type = 'text', options, choices, full, placeholder, disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  options?: string[]
  choices?: { value: string; label: string }[]
  full?: boolean
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <label className={`pm-field${full ? ' full' : ''}`}>
      <span>{label}</span>
      {choices ? (
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {choices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : options ? (
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} rows={4} />
      ) : (
        <input type={type} value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}
