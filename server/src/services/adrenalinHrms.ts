/**
 * Adrenalin Live HRMS API client
 * Docs: Authorization/UserLogin + Employee/GetEmployeeDetails
 */

export type AdrenalinEmployee = Record<string, unknown>

export type AdrenalinConfig = {
  baseUrl: string
  username: string
  password: string
  companyId: string
}

export type FetchEmployeesOpts = {
  pageSize?: number
  createdOnAndAfter?: string
  modifiedOnAndAfter?: string
  maxPages?: number
}

type AdrenalinEnvelope<T> = {
  IsValid?: boolean
  ErrorMessage?: string | null
  Data?: T
}

function loadConfig(): AdrenalinConfig {
  const baseUrl = (
    process.env.ADRENALIN_BASE_URL ||
    'https://refex.myadrenalin.com/JASON_DYNAMIC_API/SHERISHA/V1/JasonBase'
  ).replace(/\/+$/, '')
  const username = process.env.ADRENALIN_USERNAME || ''
  const password = process.env.ADRENALIN_PASSWORD || ''
  const companyId = process.env.ADRENALIN_COMPANY_ID || 'SHERISHA'
  if (!username || !password) {
    throw new Error('ADRENALIN_USERNAME and ADRENALIN_PASSWORD must be set in server .env')
  }
  return { baseUrl, username, password, companyId }
}

async function postJson<T>(url: string, body: unknown, token?: string): Promise<AdrenalinEnvelope<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let json: AdrenalinEnvelope<T>
  try {
    json = JSON.parse(text) as AdrenalinEnvelope<T>
  } catch {
    throw new Error(`Adrenalin API returned non-JSON (${res.status}): ${text.slice(0, 200)}`)
  }

  if (!res.ok) {
    throw new Error(json.ErrorMessage || `Adrenalin API HTTP ${res.status}`)
  }
  if (json.IsValid === false) {
    throw new Error(json.ErrorMessage || 'Adrenalin API rejected the request')
  }
  return json
}

/** Obtain JWT from Adrenalin UserLogin */
export async function adrenalinLogin(cfg?: AdrenalinConfig): Promise<string> {
  const c = cfg || loadConfig()
  const url = `${c.baseUrl}/Authorization/UserLogin`
  const json = await postJson<string[]>(url, {
    UserName: c.username,
    Password: c.password,
    CompanyId: c.companyId,
  })
  const token = Array.isArray(json.Data) ? json.Data[0] : null
  if (!token || typeof token !== 'string') {
    throw new Error('Adrenalin login did not return an access token')
  }
  return token
}

/**
 * Pull employee pages from GetEmployeeDetails.
 * Response shape: Data: [ [ {...employee}, ... ] ]
 */
export async function fetchAdrenalinEmployees(
  opts: FetchEmployeesOpts = {},
  cfg?: AdrenalinConfig,
): Promise<AdrenalinEmployee[]> {
  const c = cfg || loadConfig()
  const token = await adrenalinLogin(c)
  // Docs use PAGE_SIZE 10000 with empty date filters = full employee dump
  const pageSize = Math.min(Math.max(opts.pageSize || 10000, 1), 10000)
  const maxPages = opts.maxPages || 50
  const all: AdrenalinEmployee[] = []

  for (let page = 1; page <= maxPages; page++) {
    const url = `${c.baseUrl}/Employee/GetEmployeeDetails`
    const json = await postJson<unknown>(
      url,
      {
        PAGE_NUMBER: page,
        PAGE_SIZE: pageSize,
        CREATED_ON_AND_AFTER: opts.createdOnAndAfter || '',
        MODIFIED_ON_AND_AFTER: opts.modifiedOnAndAfter || '',
      },
      token,
    )

    const pageRows = flattenEmployeeData(json.Data)
    if (!pageRows.length) break
    all.push(...pageRows)
    if (pageRows.length < pageSize) break
  }

  return all
}

/** Normalize nested Data: [ [rows] ] | [rows] | rows */
export function flattenEmployeeData(data: unknown): AdrenalinEmployee[] {
  if (!data) return []
  if (!Array.isArray(data)) return []

  // Data: [ [ {...}, ... ] ]
  if (data.length === 1 && Array.isArray(data[0])) {
    return (data[0] as unknown[]).filter(isEmployeeObject) as AdrenalinEmployee[]
  }
  // Data: [ {...}, ... ]
  if (data.length && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) {
    return data.filter(isEmployeeObject) as AdrenalinEmployee[]
  }
  // Data: [ [..page1], [..page2] ] unlikely but flatten
  const out: AdrenalinEmployee[] = []
  for (const item of data) {
    if (Array.isArray(item)) {
      for (const row of item) {
        if (isEmployeeObject(row)) out.push(row)
      }
    } else if (isEmployeeObject(item)) {
      out.push(item)
    }
  }
  return out
}

function isEmployeeObject(v: unknown): v is AdrenalinEmployee {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v) && ('EMPLOYEE_ID' in (v as object) || 'employee_code' in (v as object)))
}

export function isAdrenalinConfigured(): boolean {
  return Boolean(process.env.ADRENALIN_USERNAME && process.env.ADRENALIN_PASSWORD)
}
