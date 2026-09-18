import fs from 'node:fs'
import { parse } from 'csv-parse/sync'
import XLSX from 'xlsx'

export function normHeader(h: string) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .replace(/[%#]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function parseDate(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(epoch.getTime() + value * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const s = String(value).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (mdy) {
    const a = Number(mdy[1])
    const b = Number(mdy[2])
    const y = mdy[3]
    const month = a > 12 ? b : a
    const day = a > 12 ? a : b
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return null
}

export function parseBool(value: unknown): number | null {
  if (value == null || value === '') return null
  if (value === true || value === 1) return 1
  if (value === false || value === 0) return 0
  const s = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return 1
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return 0
  return null
}

export function parseStr(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

export function parseNum(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function readSpreadsheetRows(filePath: string): Record<string, unknown>[] {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.csv')) {
    const raw = fs.readFileSync(filePath, 'utf8')
    return parse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      bom: true,
    }) as Record<string, unknown>[]
  }
  const wb = XLSX.readFile(filePath, { cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
}

export function mapRowByAliases(
  raw: Record<string, unknown>,
  aliases: Record<string, string>,
  kinds: Record<string, 'date' | 'bool' | 'number' | 'string'> = {},
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    const field = aliases[normHeader(key)]
    if (!field) continue
    const kind = kinds[field] || 'string'
    if (kind === 'date') mapped[field] = parseDate(value)
    else if (kind === 'bool') mapped[field] = parseBool(value)
    else if (kind === 'number') mapped[field] = parseNum(value)
    else mapped[field] = parseStr(value)
  }
  return mapped
}

export function csvTemplate(headers: string[]): string {
  return `\uFEFF${headers.join(',')}\n`
}
