/**
 * Import Raghul/ Kissflow dumps into projects / tasks / subtasks.
 * Usage: npm run import:kissflow
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { get, run, now } from './index.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raghulDir = path.resolve(__dirname, '../../../../Raghul')

function load(name: string) {
  return JSON.parse(fs.readFileSync(path.join(raghulDir, name), 'utf8'))
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

async function main() {
  const projectsRaw = load('projects.json')
  const tasksRaw = load('tasks.json')
  const subtasksRaw = load('subtasks.json')
  const projects = projectsRaw.Data || []
  const tasks = tasksRaw.Data || []
  const subtasks = subtasksRaw.Data || []
  const ts = now()

  const projectIdByKissflow = new Map<string, number>()
  let pCreated = 0
  for (const p of projects) {
    const kid = String(p._id || p.Project_ID_2 || '')
    if (!kid) continue
    const existing = await get<{ id: number }>(`SELECT id FROM projects WHERE kissflow_id = ?`, [kid])
    const fields = {
      kissflow_id: kid,
      project_code: p.Project_ID || null,
      name: String(p.Project_Name || kid).trim(),
      status: p.Status_1 || p._status_name || 'Open',
      priority: p.Priority_1 || null,
      rag: p.RAG_Calculation || null,
      risk: p.Risk || null,
      category: p.Project_Category || null,
      project_type: p.Project_Type || null,
      project_request: p.Project_Request || null,
      function_type: p.Function_Type || null,
      function_category: p.Function_Category || null,
      function_sub_category: p.Function_Sub_Category || null,
      company_name: p.Company_Name || null,
      entity: p.Entity || null,
      business: p.Buisness || null,
      start_date: d10(p.Start_Date),
      end_date: d10(p.End_Date),
      governance_frequency: p.Governance_Frequency || null,
      ai_usage: bool01(p.AI_Usage),
      ai_details: p.Ai_Details || null,
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
      assignee_name: uname(p.Assignee) || uname(p.Assigned_To),
      application_name: p.Application_Name || null,
      vendor_name: p.Vendor_Name || null,
      l1_manager_email: p.L1_Manager_Email || null,
      l2_manager_email: p.L2_Manager_Email || null,
      requester_name: uname(p.Requester),
      business_owner_name: uname(p.Business_Owner),
      project_owner_name: uname(p.Project_Owner),
      sponsor_name: uname(p.Sponsor),
      project_manager_name: uname(p.Project_Manager),
      developer_name: uname(p.Developer),
      cos_owner_name: uname(p.COS_Owner),
      kissflow_created_at: dt(p._created_at),
      kissflow_modified_at: dt(p._modified_at),
    }
    const cols = Object.keys(fields)
    const vals = Object.values(fields)
    let id: number
    if (existing) {
      await run(
        `UPDATE projects SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        [...vals, ts, existing.id],
      )
      id = existing.id
    } else {
      const info = await run(
        `INSERT INTO projects (${cols.join(',')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(',')}, ?, ?)`,
        [...vals, ts, ts],
      )
      id = Number(info.insertId)
      pCreated += 1
    }
    projectIdByKissflow.set(kid, id)

    if (Array.isArray(p.Project_Timeline_History)) {
      await run(`DELETE FROM project_timeline_history WHERE project_id = ?`, [id])
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
    const ref = t.Project_ID && typeof t.Project_ID === 'object' ? t.Project_ID : {}
    const projKid = String(ref._id || ref._item_id || '')
    const projectId = projKid ? projectIdByKissflow.get(projKid) || null : null
    const fields = {
      kissflow_id: kid || null,
      task_code: t.Subtaxk_id || t.Task_ID_Formulated || null,
      project_id: projectId,
      name: String(t.Sub_Task_Name || t.Name || 'Untitled').trim(),
      detail: t.Task_Detail || null,
      status: t.Task_Status || 'Open',
      workflow_status: t._status || null,
      priority: t.Task_Priority || null,
      task_type: t.Task_type || null,
      entity: t.Entity || ref.Entity || null,
      application_name: t.Application_Name || null,
      function_category: t.Function_Category || null,
      function_sub_category: t.Function_Sub_Category || null,
      function_type: t.Function_Type || null,
      start_date: d10(t.Start_Date),
      end_date: d10(t.End_Date),
      tat_days: typeof t.TAT_Days === 'number' ? t.TAT_Days : null,
      aging_days: typeof t.Aging_Days === 'number' ? t.Aging_Days : null,
      requires_approval: bool01(t.Requires_Approval),
      is_dependent: bool01(t.Is_Dependent_on_another_Task),
      assigned_to_name: uname(t.Assigned_To),
      l1_manager_email: t.L1_Manager_Email || null,
      l2_manager_email: t.L2_Manager_Email || null,
      created_by_name: uname(t._created_by),
      created_by_email: t.Created_by_flat_field_email || null,
      kissflow_created_at: dt(t._created_at),
    }
    const cols = Object.keys(fields)
    const vals = Object.values(fields)
    let id: number
    const existing = kid
      ? await get<{ id: number }>(`SELECT id FROM tasks WHERE kissflow_id = ?`, [kid])
      : null
    if (existing) {
      await run(
        `UPDATE tasks SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        [...vals, ts, existing.id],
      )
      id = existing.id
    } else {
      const info = await run(
        `INSERT INTO tasks (${cols.join(',')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(',')}, ?, ?)`,
        [...vals, ts, ts],
      )
      id = Number(info.insertId)
      tCreated += 1
    }
    if (kid) taskIdByKissflow.set(kid, id)
    if (fields.task_code) taskIdByCode.set(String(fields.task_code), id)
  }

  let sCreated = 0
  for (const s of subtasks) {
    const kid = String(s._id || '')
    const ref = s.Task_ID && typeof s.Task_ID === 'object' ? s.Task_ID : {}
    const parentKid = String(ref._id || '')
    const parentCode = String(ref.Subtaxk_id || s.Task_ID_Hidden || '')
    const taskId = (parentKid && taskIdByKissflow.get(parentKid))
      || (parentCode && taskIdByCode.get(parentCode))
      || null
    const fields = {
      kissflow_id: kid || null,
      task_id: taskId,
      name: String(s.Sub_task_Name || s.Name || 'Untitled').trim(),
      summary: s.SubTask_Summary || null,
      status: s.TStatus || 'Open',
      workflow_status: s._status || null,
      priority: s.Sub_task_Priority || null,
      start_date: d10(s.Start_Date),
      end_date: d10(s.End_Date),
      is_dependent: bool01(s.Dependent_ON),
      assigned_to_name: uname(s.Assignee_1),
      l1_manager_email: s.L1_Manager_Email || null,
      l2_manager_email: s.L2_Manager_Email || null,
      created_by_name: uname(s._created_by),
      kissflow_created_at: dt(s._created_at),
    }
    const cols = Object.keys(fields)
    const vals = Object.values(fields)
    const existing = kid
      ? await get<{ id: number }>(`SELECT id FROM subtasks WHERE kissflow_id = ?`, [kid])
      : null
    if (existing) {
      await run(
        `UPDATE subtasks SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        [...vals, ts, existing.id],
      )
    } else {
      await run(
        `INSERT INTO subtasks (${cols.join(',')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(',')}, ?, ?)`,
        [...vals, ts, ts],
      )
      sCreated += 1
    }
  }

  console.log(`Kissflow import done.`)
  console.log(`  projects: ${projects.length} rows (${pCreated} new)`)
  console.log(`  tasks:    ${tasks.length} rows (${tCreated} new)`)
  console.log(`  subtasks: ${subtasks.length} rows (${sCreated} new)`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
