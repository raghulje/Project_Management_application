import fs from 'node:fs'
import { parse } from 'csv-parse/sync'
import XLSX from 'xlsx'
import { get, run, now } from '../db/index.js'

/** Excel header → DB column */
export const EMPLOYEE_HEADER_MAP: Record<string, string> = {
  EMPLOYEE_ID: 'employee_code',
  FIRST_NAME: 'first_name',
  LAST_NAME: 'last_name',
  TITLE: 'title',
  SEX: 'sex',
  DATE_OF_BIRTH: 'date_of_birth',
  JOINING_DATE: 'joining_date',
  LEGAL_ENTITY_CODE: 'legal_entity_code',
  BRANCH_CODE: 'branch_code',
  DEPARTMENT_CODE: 'department_code',
  DEPARTMENT_NAME: 'department_name',
  BUSINESS_LINE: 'business_line',
  DESIGNATION: 'designation',
  GRADE_NAME: 'grade_name',
  SUPERVISOR_EMPLOYEE_CODE: 'supervisor_employee_code',
  PAN_NUMBER: 'pan_number',
  EMAIL_ADDRESS: 'email',
  DATE_OF_EXIT: 'date_of_exit',
  EMPLOYEE_MOBILE_NUMBER: 'mobile',
  PERSONAL_EMAIL_ID: 'personal_email',
  OFFICE_LOCATION: 'office_location',
  EMPLOYEE_PINCODE: 'employee_pincode',
  EMPLOYMENT_STATUS: 'employment_status',
  EMPLOYMENT_STATUS_DESCRIPTION: 'employment_status_description',
  EMPLOYEE_STATUS: 'employee_status',
  EMPLOYEE_STATUS_DESCRIPTION: 'employee_status_description',
  EMP_ADDED_ON: 'emp_added_on',
  REFEX_COMPANY_NAME: 'refex_company_name',
  REFEX_LOCATION: 'refex_location',
  REFEX_WORK_MOBILE_NUMBER: 'work_mobile',
}

const DATE_FIELDS = new Set(['date_of_birth', 'joining_date', 'date_of_exit'])
const DATETIME_FIELDS = new Set(['emp_added_on'])

function normHeader(h: string) {
  return String(h || '').trim().toUpperCase().replace(/\s+/g, '_')
}

function parseDate(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(epoch.getTime() + value * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const s = String(value).trim()
  // M/D/YYYY h:mm:ss AM
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) {
    const mm = m[1].padStart(2, '0')
    const dd = m[2].padStart(2, '0')
    return `${m[3]}-${mm}-${dd}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

function parseDateTime(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 19).replace('T', ' ')
  }
  const date = parseDate(value)
  if (!date) return null
  const s = String(value)
  const tm = s.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?/i)
  if (!tm) return `${date} 00:00:00`
  let hh = Number(tm[1])
  const min = tm[2]
  const sec = tm[3]
  const ap = (tm[4] || '').toUpperCase()
  if (ap === 'PM' && hh < 12) hh += 12
  if (ap === 'AM' && hh === 12) hh = 0
  return `${date} ${String(hh).padStart(2, '0')}:${min}:${sec}`
}

function str(value: unknown): string | null {
  if (value == null || value === '') return null
  return String(value).trim() || null
}

export function readEmployeeRows(filePath: string): Record<string, unknown>[] {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.csv')) {
    const raw = fs.readFileSync(filePath, 'utf8')
    const records = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true }) as Record<string, unknown>[]
    return records
  }
  const wb = XLSX.readFile(filePath, { cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
}

export function mapEmployeeRow(raw: Record<string, unknown>): Record<string, unknown> | null {
  const mapped: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    const dbKey = EMPLOYEE_HEADER_MAP[normHeader(key)]
    if (!dbKey) continue
    if (DATE_FIELDS.has(dbKey)) mapped[dbKey] = parseDate(value)
    else if (DATETIME_FIELDS.has(dbKey)) mapped[dbKey] = parseDateTime(value)
    else mapped[dbKey] = str(value)
  }
  const code = mapped.employee_code
  if (!code) return null
  if (!mapped.first_name) mapped.first_name = String(code)
  if (mapped.last_name == null) mapped.last_name = ''
  return mapped
}

const UPSERT_FIELDS = [
  'employee_code', 'first_name', 'last_name', 'title', 'sex',
  'date_of_birth', 'joining_date', 'date_of_exit',
  'legal_entity_code', 'branch_code', 'department_code', 'department_name', 'business_line',
  'designation', 'grade_name', 'supervisor_employee_code', 'pan_number',
  'email', 'personal_email', 'mobile', 'work_mobile',
  'office_location', 'employee_pincode',
  'employment_status', 'employment_status_description',
  'employee_status', 'employee_status_description',
  'emp_added_on', 'refex_company_name', 'refex_location',
] as const

export type ImportSummary = {
  total: number
  created: number
  updated: number
  skipped: number
  errors: { row: number; message: string }[]
}

/** Upsert mapped HRMS rows (Excel or Adrenalin API) by employee_code */
export async function upsertEmployeeRows(
  rawRows: Record<string, unknown>[],
  opts?: { rowOffset?: number },
): Promise<ImportSummary> {
  const summary: ImportSummary = { total: rawRows.length, created: 0, updated: 0, skipped: 0, errors: [] }
  const ts = now()
  const rowOffset = opts?.rowOffset ?? 1

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + rowOffset
    try {
      const row = mapEmployeeRow(rawRows[i])
      if (!row) {
        summary.skipped += 1
        summary.errors.push({ row: rowNum, message: 'Missing EMPLOYEE_ID' })
        continue
      }
      const code = String(row.employee_code)
      // Keep exact HRMS/Excel source row so nothing from GetEmployeeDetails is lost
      const payloadJson = JSON.stringify(rawRows[i])
      const existing = await get<{ id: number }>(
        `SELECT id FROM employees WHERE employee_code = ? AND deleted_at IS NULL`,
        [code],
      )

      if (existing) {
        const sets = UPSERT_FIELDS.filter((f) => f !== 'employee_code').map((f) => `${f} = ?`)
        const vals = UPSERT_FIELDS.filter((f) => f !== 'employee_code').map((f) => row[f] ?? null)
        vals.push(payloadJson, ts, ts, existing.id)
        await run(
          `UPDATE employees SET ${sets.join(', ')}, hrms_payload = ?, synced_at = ?, updated_at = ? WHERE id = ?`,
          vals,
        )
        summary.updated += 1
      } else {
        const cols = [...UPSERT_FIELDS, 'hrms_payload', 'synced_at', 'created_at', 'updated_at']
        const placeholders = cols.map(() => '?').join(',')
        const vals = UPSERT_FIELDS.map((f) => row[f] ?? null)
        vals.push(payloadJson, ts, ts, ts)
        await run(`INSERT INTO employees (${cols.join(',')}) VALUES (${placeholders})`, vals)
        summary.created += 1
      }
    } catch (e) {
      summary.skipped += 1
      summary.errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : 'Row failed',
      })
    }
  }

  return summary
}

export async function importEmployeesFromFile(filePath: string): Promise<ImportSummary> {
  // Excel/CSV: header is row 1, first data row is 2
  return upsertEmployeeRows(readEmployeeRows(filePath), { rowOffset: 2 })
}
