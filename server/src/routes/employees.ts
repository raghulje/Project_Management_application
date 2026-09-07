import { Router } from 'express'
import { all, get, run, now, limitSql } from '../db/index.js'
import { fail, okItem, okList, okMessage } from '../utils/response.js'
import { logAction } from '../services/actionLog.js'
import { makeUploader } from '../services/uploads.js'
import { importEmployeesFromFile } from '../services/employeeImport.js'
import { syncEmployeesFromHrms } from '../services/employeeHrmsSync.js'
import { isAdrenalinConfigured } from '../services/adrenalinHrms.js'
import { syncMastersFromEmployees } from '../services/hrmsMastersSync.js'
import { ACTIVE_EMPLOYEE_SQL } from '../services/employeeStatus.js'

export const employeesRouter = Router()
const uploadFile = makeUploader('private_uploads/imports', 'file')

function parsePayload(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null
  if (typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, unknown> } catch { return null }
  }
  return null
}

function transformEmployee(row: Record<string, unknown>) {
  return {
    id: row.id,
    employee_code: row.employee_code,
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    first_name: row.first_name,
    last_name: row.last_name,
    title: row.title,
    sex: row.sex,
    date_of_birth: row.date_of_birth,
    joining_date: row.joining_date,
    date_of_exit: row.date_of_exit,
    legal_entity_code: row.legal_entity_code,
    branch_code: row.branch_code,
    department_code: row.department_code,
    department_name: row.department_name,
    business_line: row.business_line,
    designation: row.designation,
    grade_name: row.grade_name,
    supervisor_employee_code: row.supervisor_employee_code,
    pan_number: row.pan_number,
    email: row.email,
    personal_email: row.personal_email,
    mobile: row.mobile,
    work_mobile: row.work_mobile,
    office_location: row.office_location,
    employee_pincode: row.employee_pincode,
    employment_status: row.employment_status,
    employment_status_description: row.employment_status_description,
    employee_status: row.employee_status,
    employee_status_description: row.employee_status_description,
    emp_added_on: row.emp_added_on,
    refex_company_name: row.refex_company_name,
    refex_location: row.refex_location,
    notes: row.notes,
    hrms_payload: parsePayload(row.hrms_payload),
    synced_at: row.synced_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    available_actions: { update: true, delete: true },
  }
}

async function loadEmployee(id: number) {
  const row = await get<Record<string, unknown>>(
    `SELECT * FROM employees WHERE id = ? AND deleted_at IS NULL`,
    [id],
  )
  return row ? transformEmployee(row) : null
}

employeesRouter.get('/', async (req, res) => {
  const q = String(req.query.search || '').trim()
  let sql = `SELECT * FROM employees WHERE deleted_at IS NULL`
  const params: unknown[] = []
  if (req.query.employment_status) {
    sql += ' AND employment_status = ?'
    params.push(String(req.query.employment_status))
  }
  if (req.query.department) {
    sql += ' AND department_name LIKE ?'
    params.push(`%${req.query.department}%`)
  }
  if (req.query.company) {
    sql += ' AND refex_company_name LIKE ?'
    params.push(`%${req.query.company}%`)
  }
  if (req.query.active === '1' || req.query.active === 'true') sql += ` AND ${ACTIVE_EMPLOYEE_SQL}`
  if (req.query.active === '0' || req.query.active === 'false') sql += ` AND NOT ${ACTIVE_EMPLOYEE_SQL}`
  if (q) {
    sql += ` AND (
      employee_code LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ?
      OR department_name LIKE ? OR designation LIKE ? OR refex_company_name LIKE ?
      OR CONCAT(first_name, ' ', last_name) LIKE ?
    )`
    const like = `%${q}%`
    params.push(like, like, like, like, like, like, like, like)
  }
  sql += ' ORDER BY first_name ASC, last_name ASC'
  const limit = Math.min(Number(req.query.limit) || 50, 500)
  const offset = Number(req.query.offset) || 0
  const totalRow = await get<{ c: number }>(`SELECT COUNT(*) as c FROM (${sql}) AS _count_q`, params)
  const rows = await all<Record<string, unknown>>(`${sql} ${limitSql(limit, offset)}`, params)
  return okList(res, rows.map(transformEmployee), Number(totalRow?.c || 0))
})

employeesRouter.get('/selectlist', async (req, res) => {
  const q = String(req.query.search || '').trim()
  let sql = `
    SELECT id, CONCAT(first_name, ' ', last_name, ' (', employee_code, ')') as text
    FROM employees
    WHERE deleted_at IS NULL AND ${ACTIVE_EMPLOYEE_SQL}
  `
  const params: unknown[] = []
  if (q) {
    sql += ` AND (first_name LIKE ? OR last_name LIKE ? OR employee_code LIKE ? OR email LIKE ?)`
    const like = `%${q}%`
    params.push(like, like, like, like)
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 10000)
  sql += ' ORDER BY first_name ASC, last_name ASC LIMIT ?'
  params.push(limit)
  const results = await all(sql, params)
  return res.json({ results, pagination: { more: false } })
})

employeesRouter.post('/import', (req, res) => {
  uploadFile(req, res, async (err) => {
    if (err) return fail(res, err.message)
    if (!req.file) return fail(res, 'File required (field name: file)')
    const name = req.file.originalname.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      return fail(res, 'Only .xlsx, .xls, or .csv files are supported')
    }
    try {
      const summary = await importEmployeesFromFile(req.file.path)
      const masters = await syncMastersFromEmployees()
      await logAction({
        userId: req.user?.id,
        actionType: 'import',
        itemType: 'employee',
        itemId: 0,
        note: `${req.file.originalname}: +${summary.created} ~${summary.updated}`,
        meta: { ...summary, masters },
      })
      return okMessage(res, 'Employee import completed', { ...summary, masters })
    } catch (e) {
      return fail(res, e instanceof Error ? e.message : 'Import failed')
    }
  })
})

employeesRouter.post('/sync', async (req, res) => {
  if (!isAdrenalinConfigured()) {
    return fail(res, 'Adrenalin HRMS is not configured on the server', 503)
  }
  const b = req.body || {}
  try {
    const summary = await syncEmployeesFromHrms({
      pageSize: b.page_size ? Number(b.page_size) : undefined,
      createdOnAndAfter: b.created_on_and_after ? String(b.created_on_and_after) : undefined,
      modifiedOnAndAfter: b.modified_on_and_after ? String(b.modified_on_and_after) : undefined,
    })
    await logAction({
      userId: req.user?.id,
      actionType: 'sync',
      itemType: 'employee',
      itemId: 0,
      note: `Adrenalin: fetched=${summary.fetched} +${summary.created} ~${summary.updated}`,
      meta: summary,
    })
    return okMessage(res, 'HRMS sync completed', summary)
  } catch (e) {
    return fail(res, e instanceof Error ? e.message : 'HRMS sync failed')
  }
})

employeesRouter.get('/sync/status', async (_req, res) => {
  return res.json({
    configured: isAdrenalinConfigured(),
    interval_minutes: Number(process.env.ADRENALIN_SYNC_INTERVAL_MINUTES || 0) || null,
  })
})

employeesRouter.post('/sync-masters', async (req, res) => {
  try {
    const masters = await syncMastersFromEmployees()
    await logAction({
      userId: req.user?.id,
      actionType: 'sync',
      itemType: 'master',
      itemId: 0,
      note: `HRMS masters: companies=${masters.companies.total}`,
      meta: masters,
    })
    return okMessage(res, 'HRMS masters synced', masters)
  } catch (e) {
    return fail(res, e instanceof Error ? e.message : 'Masters sync failed')
  }
})

employeesRouter.get('/:id', async (req, res) => {
  const emp = await loadEmployee(Number(req.params.id))
  if (!emp) return fail(res, 'Employee not found', 404)
  return okItem(res, emp)
})

const WRITE_FIELDS = [
  'employee_code', 'first_name', 'last_name', 'title', 'sex',
  'date_of_birth', 'joining_date', 'date_of_exit',
  'legal_entity_code', 'branch_code', 'department_code', 'department_name', 'business_line',
  'designation', 'grade_name', 'supervisor_employee_code', 'pan_number',
  'email', 'personal_email', 'mobile', 'work_mobile',
  'office_location', 'employee_pincode',
  'employment_status', 'employment_status_description',
  'employee_status', 'employee_status_description',
  'refex_company_name', 'refex_location', 'notes',
] as const

employeesRouter.post('/', async (req, res) => {
  const b = req.body || {}
  if (!b.employee_code || !b.first_name) return fail(res, 'employee_code and first_name are required')
  const exists = await get(`SELECT id FROM employees WHERE employee_code = ? AND deleted_at IS NULL`, [b.employee_code])
  if (exists) return fail(res, 'Employee code already exists')
  const ts = now()
  const fields = WRITE_FIELDS.filter((f) => b[f] !== undefined || f === 'employee_code' || f === 'first_name' || f === 'last_name')
  const cols = [...fields, 'created_at', 'updated_at']
  const vals = fields.map((f) => {
    if (b[f] !== undefined && b[f] !== null) return b[f]
    if (f === 'last_name') return ''
    return f === 'employee_code' ? b.employee_code : f === 'first_name' ? b.first_name : null
  })
  vals.push(ts, ts)
  const info = await run(`INSERT INTO employees (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, vals)
  const id = Number(info.insertId)
  await logAction({ userId: req.user?.id, actionType: 'create', itemType: 'employee', itemId: id })
  return okMessage(res, 'Employee created', await loadEmployee(id), 201)
})

employeesRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!(await loadEmployee(id))) return fail(res, 'Employee not found', 404)
  const b = req.body || {}
  const fields = WRITE_FIELDS.filter((f) => b[f] !== undefined && f !== 'employee_code')
  if (!fields.length) return fail(res, 'No fields')
  await run(`UPDATE employees SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [
    ...fields.map((f) => b[f]), now(), id,
  ])
  await logAction({ userId: req.user?.id, actionType: 'update', itemType: 'employee', itemId: id })
  return okMessage(res, 'Employee updated', await loadEmployee(id))
})

employeesRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!(await loadEmployee(id))) return fail(res, 'Employee not found', 404)
  const ts = now()
  await run(`UPDATE employees SET deleted_at = ?, updated_at = ? WHERE id = ?`, [ts, ts, id])
  await logAction({ userId: req.user?.id, actionType: 'delete', itemType: 'employee', itemId: id })
  return okMessage(res, 'Employee deleted')
})
