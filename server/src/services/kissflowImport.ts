/**
 * Pull Kissflow production (then development fallback) projects / tasks / subtasks
 * using the same case + process endpoints as ProjectDashboardPage, then upsert MySQL.
 */
import { get, run, now } from '../db/index.js'
import { disableAllNotifications } from './notificationConfig.js'

const CASE_ID = 'Project_Management_A01'
const TASK_PROCESS_ID = 'Project_Sub_Task_A01'
const SUBTASK_PROCESS_ID = 'Sub_Task_Process_A00'
const PAGE_SIZE = 500
const PROD_ORIGIN = 'https://refexgroup.kissflow.com'
const DEV_ORIGIN = 'https://development-refexgroup.kissflow.com'
const DEFAULT_PROD_ACCOUNT = 'AcCMptlq60zH'
const DEFAULT_DEV_ACCOUNT = 'AcCMptp3yqcn'

export type KissflowSyncResult = {
  source: string
  origin: string
  account: string
  projects: number
  tasks: number
  subtasks: number
  projects_created: number
  tasks_created: number
  subtasks_created: number
}

type Tenant = {
  label: string
  origin: string
  account: string
  keyId: string
  keySecret: string
}

let inflight: Promise<KissflowSyncResult> | null = null

function env(name: string, fallback = '') {
  return String(process.env[name] || fallback).trim()
}

function tenants(): Tenant[] {
  const prodAccount = env('KF_LIVE_ACCOUNT_ID') || DEFAULT_PROD_ACCOUNT
  const devAccount = env('KF_ACCOUNT_ID') || DEFAULT_DEV_ACCOUNT
  const prodKey = env('KF_LIVE_ACCESS_KEY_ID') || env('KF_ACCESS_KEY_ID')
  const prodSecret = env('KF_LIVE_ACCESS_KEY_SECRET') || env('KF_ACCESS_KEY_SECRET')
  const devKey = env('KF_ACCESS_KEY_ID')
  const devSecret = env('KF_ACCESS_KEY_SECRET')
  const prodOrigin = (env('KF_LIVE_API_ORIGIN') || PROD_ORIGIN).replace(/\/$/, '')
  const devOrigin = (env('KF_API_ORIGIN') || DEV_ORIGIN).replace(/\/$/, '')

  const list: Tenant[] = []
  if (prodKey && prodSecret) {
    list.push({
      label: 'production',
      origin: prodOrigin,
      account: prodAccount,
      keyId: prodKey,
      keySecret: prodSecret,
    })
  }
  if (devKey && devSecret && (devOrigin !== prodOrigin || devKey !== prodKey || devAccount !== prodAccount)) {
    list.push({
      label: 'development',
      origin: devOrigin,
      account: devAccount,
      keyId: devKey,
      keySecret: devSecret,
    })
  }
  return list
}

function extractRows(payload: unknown): any[] {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  const obj = payload as Record<string, any>
  if (Array.isArray(obj.Data)) return obj.Data
  if (Array.isArray(obj.data?.Data)) return obj.data.Data
  if (Array.isArray(obj.data)) return obj.data
  if (Array.isArray(obj.items)) return obj.items
  return []
}

async function kfGet(tenant: Tenant, pathName: string) {
  const url = `${tenant.origin}${pathName}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Access-Key-Id': tenant.keyId,
      'X-Access-Key-Secret': tenant.keySecret,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as any)?.en_message || (data as any)?.message || `HTTP ${res.status}`
    throw new Error(`${pathName}: ${msg}`)
  }
  return data
}

async function kfPaged(tenant: Tenant, buildPath: (page: number) => string) {
  const all: any[] = []
  const seen = new Set<string>()
  for (let page = 1; page <= 200; page += 1) {
    const payload = await kfGet(tenant, buildPath(page))
    const batch = extractRows(payload)
    if (!batch.length) break
    for (const item of batch) {
      const id = String(item?._id || item?._item_id || '')
      if (id && seen.has(id)) continue
      if (id) seen.add(id)
      all.push(item)
    }
    if (batch.length < PAGE_SIZE) break
  }
  return all
}

async function fetchPortfolio(tenant: Tenant) {
  const account = tenant.account
  const projects = await kfPaged(
    tenant,
    (page) => `/case/2/${account}/${CASE_ID}/list?page_number=${page}&page_size=${PAGE_SIZE}`,
  )
  const tasks = await kfPaged(
    tenant,
    (page) =>
      `/process/2/${account}/admin/${TASK_PROCESS_ID}/item?page_number=${page}&page_size=${PAGE_SIZE}&apply_preference=0`,
  )
  const subtasks = await kfPaged(
    tenant,
    (page) =>
      `/process/2/${account}/admin/${SUBTASK_PROCESS_ID}/item?page_number=${page}&page_size=${PAGE_SIZE}&apply_preference=0`,
  )
  return { projects, tasks, subtasks }
}

function uname(obj: unknown): string | null {
  if (obj && typeof obj === 'object' && 'Name' in obj) {
    return String((obj as { Name?: string }).Name || '') || null
  }
  return null
}

function dt(s: unknown): string | null {
  if (!s || typeof s !== 'string') return null
  return s.slice(0, 19).replace('T', ' ')
}

function d10(s: unknown): string | null {
  if (!s || typeof s !== 'string') return null
  return s.slice(0, 10)
}

function bool01(v: unknown) {
  return v === true || v === 1 || v === '1' ? 1 : 0
}

function clip(v: unknown, max: number): string | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  return s.length > max ? s.slice(0, max) : s
}

async function upsertPortfolio(
  projects: any[],
  tasks: any[],
  subtasks: any[],
): Promise<Pick<KissflowSyncResult, 'projects_created' | 'tasks_created' | 'subtasks_created'>> {
  const ts = now()
  const projectIdByKissflow = new Map<string, number>()
  let pCreated = 0
  for (const p of projects) {
    const kid = String(p._id || p.Project_ID_2 || '')
    if (!kid) continue
    const existing = await get<{ id: number }>(`SELECT id FROM projects WHERE kissflow_id = ?`, [kid])
    const fields = {
      kissflow_id: kid,
      project_code: clip(p.Project_ID, 128),
      name: clip(p.Project_Name || kid, 255) || kid.slice(0, 255),
      status: clip(p.Status_1 || p._status_name || 'Open', 64) || 'Open',
      priority: clip(p.Priority_1, 32),
      rag: clip(p.RAG_Calculation, 32),
      risk: clip(p.Risk, 32),
      category: clip(p.Project_Category, 128),
      project_type: clip(p.Project_Type, 64),
      project_request: clip(p.Project_Request, 64),
      function_type: clip(p.Function_Type, 128),
      function_category: clip(p.Function_Category, 128),
      function_sub_category: clip(p.Function_Sub_Category, 128),
      company_name: clip(p.Company_Name, 191),
      entity: clip(p.Entity, 191),
      business: clip(p.Buisness, 191),
      start_date: d10(p.Start_Date),
      end_date: d10(p.End_Date),
      governance_frequency: p.Governance_Frequency || null,
      ai_usage: bool01(p.AI_Usage),
      ai_details: clip(p.Ai_Details, 255),
      reports_available: bool01(p.Reports_Available),
      integrated_with_tally: bool01(p.Integrated_with_Tally),
      integrated_with_sap: bool01(p.Integrated_with_SAP),
      integrated_with_power_bi: bool01(p.Integrated_with_Power_BI),
      brd_available: bool01(p.BRD_Available_1 ?? p.BRD_Available),
      process_document: bool01(p.Process_Document_1 ?? p.Process_Document),
      support_available: bool01(p.Suuport_Available ?? p.Support_Available),
      cb_analysis_available: bool01(p.CB_Analysis_Document_Available),
      risk_mitigation: bool01(p.Risk_Mitigation_1),
      objectives: p.Project_Objectives != null ? String(p.Project_Objectives) : null,
      tech_stack: p.Tech_Stack && typeof p.Tech_Stack === 'object' ? JSON.stringify(p.Tech_Stack) : null,
      tat_days: typeof p.TAT_1 === 'number' ? p.TAT_1 : null,
      aging_days: typeof p.Aging_Days_1 === 'number' ? p.Aging_Days_1 : null,
      hours: typeof p.Hours === 'number' ? p.Hours : 0,
      tco_efforts: typeof p.TCOEfforts === 'number' ? p.TCOEfforts : null,
      completion: typeof p.Completion === 'number' ? p.Completion : 0,
      risk_mitigation_details: p.Risk_Mitigation_Details != null ? String(p.Risk_Mitigation_Details) : null,
      application_name: clip(p.Application_Name, 191),
      vendor_name: clip(p.Vendor_Name, 191),
      l1_manager_email: clip(p.L1_Manager_Email, 191),
      l2_manager_email: clip(p.L2_Manager_Email, 191),
      requester_name: clip(uname(p.Requester), 191),
      business_owner_name: clip(uname(p.Business_Owner), 191),
      project_owner_name: clip(uname(p.Project_Owner), 191),
      sponsor_name: clip(uname(p.Sponsor), 191),
      project_manager_name: clip(uname(p.Project_Manager), 191),
      developer_name: clip(uname(p.Developer), 191),
      cos_owner_name: clip(uname(p.COS_Owner), 191),
      assignee_name: clip(uname(p.Assignee) || uname(p.Assigned_To), 191),
      kissflow_created_at: dt(p._created_at),
      kissflow_modified_at: dt(p._modified_at),
    }
    let id: number
    if (existing) {
      id = existing.id
      projectIdByKissflow.set(kid, id)
      continue
    }
    const insert: Record<string, unknown> = { ...fields, source: 'legacy' }
    const cols = Object.keys(insert)
    const vals = Object.values(insert)
    const info = await run(
      `INSERT INTO projects (${cols.join(',')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(',')}, ?, ?)`,
      [...vals, ts, ts],
    )
    id = Number(info.insertId)
    pCreated += 1
    projectIdByKissflow.set(kid, id)

    if (Array.isArray(p.Project_Timeline_History)) {
      for (const h of p.Project_Timeline_History) {
        const revised = h.New_Revised_Date
          ? new Date(h.New_Revised_Date).toISOString().slice(0, 10)
          : null
        await run(
          `INSERT INTO project_timeline_history (project_id, revised_end_date, changed_on, created_by_name, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [id, revised, dt(h.Changed_on?.dv || h._created_at?.dv), uname(h._created_by), ts],
        )
      }
    }
  }

  const taskIdByKissflow = new Map<string, number>()
  const taskIdByCode = new Map<string, number>()
  let tCreated = 0
  for (const t of tasks) {
    const kid = String(t._id || '')
    if (!kid) continue
    const ref = t.Project_ID && typeof t.Project_ID === 'object' ? t.Project_ID : {}
    const projKid = String(ref._id || ref._item_id || '')
    let projectId = projKid ? projectIdByKissflow.get(projKid) || null : null
    if (!projectId && projKid) {
      const linked = await get<{ id: number }>(`SELECT id FROM projects WHERE kissflow_id = ?`, [projKid])
      if (linked?.id) {
        projectId = linked.id
        projectIdByKissflow.set(projKid, linked.id)
      }
    }
    const fields: Record<string, unknown> = {
      kissflow_id: kid,
      task_code: clip(t.Subtaxk_id || t.Task_ID_Formulated, 191),
      project_id: projectId,
      name: clip(t.Sub_Task_Name || t.Name || 'Untitled', 255) || 'Untitled',
      detail: t.Task_Detail || null,
      status: clip(t.Task_Status || 'Open', 64) || 'Open',
      workflow_status: clip(t._status, 64),
      priority: clip(t.Task_Priority, 32),
      task_type: clip(t.Task_type, 64),
      entity: clip(t.Entity || ref.Entity, 191),
      application_name: clip(t.Application_Name, 191),
      function_category: clip(t.Function_Category, 128),
      function_sub_category: clip(t.Function_Sub_Category, 128),
      function_type: clip(t.Function_Type, 128),
      start_date: d10(t.Start_Date),
      end_date: d10(t.End_Date),
      tat_days: typeof t.TAT_Days === 'number' ? t.TAT_Days : null,
      aging_days: typeof t.Aging_Days === 'number' ? t.Aging_Days : null,
      requires_approval: bool01(t.Requires_Approval),
      is_dependent: bool01(t.Is_Dependent_on_another_Task),
      assigned_to_name: clip(uname(t.Assigned_To), 191),
      l1_manager_email: clip(t.L1_Manager_Email, 191),
      l2_manager_email: clip(t.L2_Manager_Email, 191),
      created_by_name: clip(uname(t._created_by), 191),
      created_by_email: clip(t.Created_by_flat_field_email, 191),
      kissflow_created_at: dt(t._created_at),
    }
    let id: number
    const existing = await get<{ id: number; project_id: number | null }>(`SELECT id, project_id FROM tasks WHERE kissflow_id = ?`, [kid])
    if (existing) {
      if (projectId && !existing.project_id) {
        await run(`UPDATE tasks SET project_id = ? WHERE id = ?`, [projectId, existing.id])
      }
      id = existing.id
    } else {
      const insert: Record<string, unknown> = { ...fields, source: 'legacy' }
      const cols = Object.keys(insert)
      const vals = Object.values(insert)
      const info = await run(
        `INSERT INTO tasks (${cols.join(',')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(',')}, ?, ?)`,
        [...vals, ts, ts],
      )
      id = Number(info.insertId)
      if (!insert.task_code) {
        await run(`UPDATE tasks SET task_code = CONCAT('TSK-', id) WHERE id = ?`, [id])
      }
      tCreated += 1
    }
    if (kid) taskIdByKissflow.set(kid, id)
    if (fields.task_code) taskIdByCode.set(String(fields.task_code), id)
  }

  let sCreated = 0
  for (const s of subtasks) {
    const kid = String(s._id || '')
    if (!kid) continue
    const ref = s.Task_ID && typeof s.Task_ID === 'object' ? s.Task_ID : {}
    const parentKid = String(ref._id || '')
    const parentCode = String(ref.Subtaxk_id || s.Task_ID_Hidden || '')
    const taskId = (parentKid && taskIdByKissflow.get(parentKid))
      || (parentCode && taskIdByCode.get(parentCode))
      || null
    const fields: Record<string, unknown> = {
      kissflow_id: kid,
      task_id: taskId,
      name: clip(s.Sub_task_Name || s.Name || 'Untitled', 255) || 'Untitled',
      summary: s.SubTask_Summary || null,
      status: clip(s.TStatus || 'Open', 64) || 'Open',
      workflow_status: clip(s._status, 64),
      priority: clip(s.Sub_task_Priority, 32),
      start_date: d10(s.Start_Date),
      end_date: d10(s.End_Date),
      is_dependent: bool01(s.Dependent_ON),
      assigned_to_name: clip(uname(s.Assignee_1), 191),
      l1_manager_email: clip(s.L1_Manager_Email, 191),
      l2_manager_email: clip(s.L2_Manager_Email, 191),
      created_by_name: clip(uname(s._created_by), 191),
      kissflow_created_at: dt(s._created_at),
    }
    const existing = await get<{ id: number; task_id: number | null }>(`SELECT id, task_id FROM subtasks WHERE kissflow_id = ?`, [kid])
    if (existing) {
      if (taskId && !existing.task_id) {
        await run(`UPDATE subtasks SET task_id = ? WHERE id = ?`, [taskId, existing.id])
      }
    } else {
      const insert: Record<string, unknown> = { ...fields, source: 'legacy' }
      const cols = Object.keys(insert)
      const vals = Object.values(insert)
      const info = await run(
        `INSERT INTO subtasks (${cols.join(',')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(',')}, ?, ?)`,
        [...vals, ts, ts],
      )
      await run(`UPDATE subtasks SET subtask_code = CONCAT('SUB-', id) WHERE id = ? AND (subtask_code IS NULL OR subtask_code = '')`, [Number(info.insertId)])
      sCreated += 1
    }
  }

  return {
    projects_created: pCreated,
    tasks_created: tCreated,
    subtasks_created: sCreated,
  }
}

async function runSync(): Promise<KissflowSyncResult> {
  await disableAllNotifications()
  const options = tenants()
  if (!options.length) {
    throw new Error('Missing Kissflow access keys (KF_ACCESS_KEY_ID / KF_ACCESS_KEY_SECRET)')
  }

  let lastError: Error | null = null
  for (const tenant of options) {
    try {
      console.log(`Kissflow sync: fetching ${tenant.label} ${tenant.origin} account ${tenant.account}`)
      const bundle = await fetchPortfolio(tenant)
      if (!bundle.projects.length && !bundle.tasks.length && !bundle.subtasks.length) {
        throw new Error('API returned no projects, tasks, or subtasks')
      }
      const created = await upsertPortfolio(bundle.projects, bundle.tasks, bundle.subtasks)
      const result: KissflowSyncResult = {
        source: tenant.label,
        origin: tenant.origin,
        account: tenant.account,
        projects: bundle.projects.length,
        tasks: bundle.tasks.length,
        subtasks: bundle.subtasks.length,
        ...created,
      }
      console.log(
        `Kissflow sync done (${result.source}): ${result.projects} projects (${result.projects_created} new), ${result.tasks} tasks (${result.tasks_created} new), ${result.subtasks} subtasks (${result.subtasks_created} new)`,
      )
      return result
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.warn(`Kissflow ${tenant.label} fetch failed:`, lastError.message)
    }
  }
  throw lastError || new Error('Kissflow sync failed')
}

export function syncKissflowPortfolio(): Promise<KissflowSyncResult> {
  if (inflight) return inflight
  inflight = runSync().finally(() => {
    inflight = null
  })
  return inflight
}
