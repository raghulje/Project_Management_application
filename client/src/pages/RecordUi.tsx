import type { ReactNode } from 'react'
import WsSelect from './WsSelect'
import WsDate from './WsDate'

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
  label, value, onChange, type = 'text', options, choices, full, placeholder, disabled, mark,
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
  mark?: ReactNode
}) {
  return (
    <label className={`pm-field${full ? ' full' : ''}${disabled ? ' is-locked' : ''}`}>
      <span>{label}{mark}</span>
      {choices ? (
        <WsSelect
          value={value}
          disabled={disabled}
          placeholder="Select..."
          options={[{ value: '', label: 'Select...' }, ...choices]}
          onChange={onChange}
        />
      ) : options ? (
        <WsSelect
          value={value}
          disabled={disabled}
          placeholder="Select..."
          options={['', ...options].map((o) => (o ? o : { value: '', label: 'Select...' }))}
          onChange={onChange}
        />
      ) : type === 'textarea' ? (
        <textarea value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} rows={4} />
      ) : type === 'date' ? (
        <WsDate value={value} disabled={disabled} placeholder={placeholder || 'Pick a date'} onChange={onChange} />
      ) : (
        <input type={type} value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}
