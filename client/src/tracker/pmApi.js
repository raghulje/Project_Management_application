let cache = null
let inflight = null

export async function fetchPmPortfolio() {
  if (cache) return cache
  if (inflight) return inflight
  inflight = (async () => {
    const token = localStorage.getItem('refex_pm_token')
    const res = await fetch('/api/v1/dashboard/portfolio', {
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = Array.isArray(data.messages) ? data.messages[0] : (data.message || 'Failed to load portfolio')
      throw new Error(message || `HTTP ${res.status}`)
    }
    cache = data
    return data
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function invalidatePmPortfolio() {
  cache = null
}

export async function syncPmFromKissflow() {
  const token = localStorage.getItem('refex_pm_token')
  const res = await fetch('/api/v1/dashboard/kissflow-sync', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: '{}',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = Array.isArray(data.messages) ? data.messages[0] : (data.message || 'Kissflow sync failed')
    throw new Error(message || `HTTP ${res.status}`)
  }
  invalidatePmPortfolio()
  return data
}

export async function fetchPmProjects() {
  const data = await fetchPmPortfolio()
  return data.projects || []
}

export async function fetchPmTasks() {
  const data = await fetchPmPortfolio()
  return data.tasks || []
}

export async function fetchPmSubtasks() {
  const data = await fetchPmPortfolio()
  return data.processSubtasks || []
}

export function personKey(value) {
  if (!value) return ''
  if (typeof value === 'object') {
    return String(value.email || value.Email || value.name || value.Name || '').trim().toLowerCase()
  }
  return String(value).trim().toLowerCase()
}

export function matchesUser(user, ...candidates) {
  if (!user) return false
  const keys = [
    personKey(user.Email || user.email),
    personKey(user.Name || user.name),
    personKey(user.FirstName),
  ].filter(Boolean)
  return candidates.some((c) => {
    const k = personKey(c)
    return k && keys.some((u) => u === k || u.includes(k) || k.includes(u))
  })
}

export async function fetchPmProjectBundle() {
  const projects = await fetchPmProjects()
  const subtasks = await fetchPmSubtasks()
  return { rows: projects, subtasks, listItems: projects, fieldIds: new Set(), accountId: 'local' }
}

export async function fetchPmMyTeamProjects() {
  return { projects: await fetchPmProjects(), columns: [], reportName: 'My Team' }
}

export async function fetchPmMyTeamTasks() {
  return { tasks: await fetchPmTasks(), columns: [], reportName: 'My Team' }
}

export async function fetchPmMyTeamSubtasks() {
  return { subtasks: await fetchPmSubtasks(), columns: [], reportName: 'My Team' }
}

export function getPmScrollRoot() {
  if (typeof document === 'undefined') return null
  return document.querySelector('.pm-main.is-embed .rootDiv')
    || document.querySelector('.pm-main')
    || document.querySelector('.rootDiv')
}

export function scrollPmToElement(el, offset = 0) {
  if (!el) return
  const root = getPmScrollRoot()
  if (root) {
    const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - offset
    root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    return
  }
  const top = el.getBoundingClientRect().top + window.scrollY - offset
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

const RECORD_BASE = {
  project: '/projects',
  projects: '/projects',
  task: '/tasks',
  tasks: '/tasks',
  subtask: '/subtasks',
  subtasks: '/subtasks',
}

function numericId(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && String(value).trim() === String(n) ? String(n) : ''
}

export function resolvePmRecordId(row) {
  if (!row || typeof row !== 'object') return ''
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {}
  const rawItem = row.rawItem && typeof row.rawItem === 'object' ? row.rawItem : {}
  return numericId(row.dbId)
    || numericId(row.recordId)
    || numericId(row.mysqlId)
    || numericId(raw.dbId)
    || numericId(raw.id)
    || numericId(rawItem.dbId)
    || numericId(rawItem.id)
}

export function resolvePmRecordRef(row) {
  return resolvePmRecordId(row)
    || String(
      row?.displayId
        || row?.kissflow_id
        || row?.taskBusinessId
        || row?.task_code
        || row?.InstanceID
        || row?._id
        || row?.id
        || '',
    ).trim()
}

export function openPmRecord(kind, row) {
  const base = RECORD_BASE[kind] || '/projects'
  const ref = resolvePmRecordRef(row)
  return goPm(ref ? `${base}/${encodeURIComponent(ref)}` : base)
}

function queryId(row) {
  return resolvePmRecordId(row)
}

export function goPmNewProject() {
  return goPm('/projects/new')
}

export function goPmNewTask(project) {
  const id = queryId(project)
  return goPm(id ? `/tasks/new?project_id=${encodeURIComponent(id)}` : '/tasks/new')
}

export function goPmNewSubtask(task) {
  const id = queryId(task)
  return goPm(id ? `/subtasks/new?task_id=${encodeURIComponent(id)}` : '/subtasks/new')
}

export function goPm(path) {
  const from = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : ''
  if (typeof window !== 'undefined' && typeof window.__pmNavigate === 'function') {
    window.__pmNavigate(path, { from })
    return true
  }
  if (typeof window !== 'undefined') {
    window.location.assign(path)
    return true
  }
  return false
}
