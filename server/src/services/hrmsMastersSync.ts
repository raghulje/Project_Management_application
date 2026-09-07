import { all, get, run, now } from '../db/index.js'

export type MastersSyncSummary = {
  companies: { created: number; existing: number; total: number; codes_set: number }
  legal_entities: { created: number; existing: number; total: number }
  locations: { created: number; existing: number; total: number }
  departments: { created: number; existing: number; total: number }
}

function cleanName(value: unknown): string | null {
  if (value == null) return null
  const s = String(value)
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s || null
}

function cleanCode(value: unknown): string | null {
  const s = cleanName(value)
  return s ? s.slice(0, 64) : null
}

async function ensureCompany(name: string): Promise<{ id: number; created: boolean }> {
  const live = await get<{ id: number }>(
    `SELECT id FROM companies WHERE name = ? AND deleted_at IS NULL LIMIT 1`,
    [name],
  )
  if (live) return { id: Number(live.id), created: false }

  const ts = now()
  try {
    const info = await run(
      `INSERT INTO companies (name, notes, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      [name, 'Synced from HRMS (refex_company_name)', ts, ts],
    )
    return { id: Number(info.insertId), created: true }
  } catch {
    const again = await get<{ id: number }>(
      `SELECT id FROM companies WHERE name = ? AND deleted_at IS NULL LIMIT 1`,
      [name],
    )
    return { id: Number(again?.id || 0), created: false }
  }
}

async function ensureLegalEntity(
  companyId: number,
  code: string,
  displayName: string | null,
): Promise<'created' | 'existing'> {
  const live = await get<{ id: number }>(
    `SELECT id FROM legal_entities WHERE company_id = ? AND code = ? AND deleted_at IS NULL LIMIT 1`,
    [companyId, code],
  )
  if (live) return 'existing'

  const ts = now()
  try {
    await run(
      `INSERT INTO legal_entities (company_id, code, name, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [companyId, code, displayName || code, 'Synced from HRMS (legal_entity_code)', ts, ts],
    )
    return 'created'
  } catch {
    return 'existing'
  }
}

async function findOrCreateNamed(
  table: 'locations' | 'departments',
  name: string,
  extra: Record<string, unknown> = {},
): Promise<'created' | 'existing'> {
  const live = await get<{ id: number }>(
    `SELECT id FROM ${table} WHERE name = ? AND deleted_at IS NULL LIMIT 1`,
    [name],
  )
  if (live) return 'existing'

  const ts = now()
  const cols = ['name', ...Object.keys(extra), 'created_at', 'updated_at']
  const vals = [name, ...Object.values(extra), ts, ts]
  try {
    await run(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      vals,
    )
    return 'created'
  } catch {
    return 'existing'
  }
}

/**
 * Build companies + legal entity codes (+ locations / departments) from HRMS employee rows.
 * legal_entity_code from Adrenalin GetEmployeeDetails / Excel LEGAL_ENTITY_CODE.
 */
export async function syncMastersFromEmployees(): Promise<MastersSyncSummary> {
  const companyRows = await all<{ name: string }>(`
    SELECT DISTINCT refex_company_name AS name
    FROM employees
    WHERE deleted_at IS NULL
      AND refex_company_name IS NOT NULL
      AND TRIM(refex_company_name) <> ''
  `)
  const entityRows = await all<{ company_name: string; entity_code: string }>(`
    SELECT DISTINCT
      refex_company_name AS company_name,
      legal_entity_code AS entity_code
    FROM employees
    WHERE deleted_at IS NULL
      AND refex_company_name IS NOT NULL AND TRIM(refex_company_name) <> ''
      AND legal_entity_code IS NOT NULL AND TRIM(legal_entity_code) <> ''
  `)
  const locationRows = await all<{ name: string }>(`
    SELECT DISTINCT refex_location AS name
    FROM employees
    WHERE deleted_at IS NULL
      AND refex_location IS NOT NULL
      AND TRIM(refex_location) <> ''
  `)
  const departmentRows = await all<{ name: string }>(`
    SELECT DISTINCT department_name AS name
    FROM employees
    WHERE deleted_at IS NULL
      AND department_name IS NOT NULL
      AND TRIM(department_name) <> ''
  `)

  const summary: MastersSyncSummary = {
    companies: { created: 0, existing: 0, total: 0, codes_set: 0 },
    legal_entities: { created: 0, existing: 0, total: 0 },
    locations: { created: 0, existing: 0, total: 0 },
    departments: { created: 0, existing: 0, total: 0 },
  }

  const companyIds = new Map<string, number>()
  for (const row of companyRows) {
    const name = cleanName(row.name)
    if (!name || companyIds.has(name)) continue
    const { id, created } = await ensureCompany(name)
    if (!id) continue
    companyIds.set(name, id)
    summary.companies[created ? 'created' : 'existing'] += 1
  }
  summary.companies.total = companyIds.size

  const entityKeys = new Set<string>()
  for (const row of entityRows) {
    const companyName = cleanName(row.company_name)
    const code = cleanCode(row.entity_code)
    if (!companyName || !code) continue
    let companyId = companyIds.get(companyName)
    if (!companyId) {
      const ensured = await ensureCompany(companyName)
      companyId = ensured.id
      if (companyId) companyIds.set(companyName, companyId)
    }
    if (!companyId) continue
    const key = `${companyId}::${code}`
    if (entityKeys.has(key)) continue
    entityKeys.add(key)
    const result = await ensureLegalEntity(companyId, code, code)
    summary.legal_entities[result] += 1
  }
  summary.legal_entities.total = entityKeys.size

  // companies.code = primary entity code when company has exactly one, or most common from employees
  for (const [companyName, companyId] of companyIds) {
    const primary = await get<{ code: string; c: number }>(`
      SELECT legal_entity_code AS code, COUNT(*) AS c
      FROM employees
      WHERE deleted_at IS NULL
        AND refex_company_name = ?
        AND legal_entity_code IS NOT NULL AND TRIM(legal_entity_code) <> ''
      GROUP BY legal_entity_code
      ORDER BY c DESC, legal_entity_code ASC
      LIMIT 1
    `, [companyName])
    const code = cleanCode(primary?.code)
    if (!code) continue
    const updated = await run(
      `UPDATE companies SET code = ?, updated_at = ? WHERE id = ? AND (code IS NULL OR code = '')`,
      [code, now(), companyId],
    )
    if (Number(updated.affectedRows || 0) > 0) summary.companies.codes_set += 1
  }

  const locations = new Set<string>()
  for (const row of locationRows) {
    const name = cleanName(row.name)
    if (!name || locations.has(name)) continue
    locations.add(name)
    const result = await findOrCreateNamed('locations', name, {
      notes: 'Synced from HRMS (refex_location)',
    })
    summary.locations[result] += 1
  }
  summary.locations.total = locations.size

  const departments = new Set<string>()
  for (const row of departmentRows) {
    const name = cleanName(row.name)
    if (!name || departments.has(name)) continue
    departments.add(name)
    const result = await findOrCreateNamed('departments', name, {
      notes: 'Synced from HRMS (department_name)',
    })
    summary.departments[result] += 1
  }
  summary.departments.total = departments.size

  return summary
}
