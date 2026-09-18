import { getApiBase } from './baseUrl'
import { invalidatePmPortfolio } from '../tracker/pmApi'

export type ApiList<T> = { total: number; rows: T[] }
export type SelectOption = { id: number; text: string }

export class ApiError extends Error {
  status: number
  messages: string[]
  payload: unknown
  constructor(status: number, messages: string | string[], payload: unknown = null) {
    const list = Array.isArray(messages) ? messages : [messages]
    super(list.join(', '))
    this.name = 'ApiError'
    this.status = status
    this.messages = list
    this.payload = payload
  }
}

function token() {
  return localStorage.getItem('refex_pm_token')
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem('refex_pm_token', t)
  else localStorage.removeItem('refex_pm_token')
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  const t = token()
  if (t) headers.Authorization = `Bearer ${t}`
  if (options.json !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  })
  const data = await res.json().catch(() => ({})) as {
    messages?: string | string[]
    message?: string
    payload?: unknown
  }
  if (!res.ok) {
    const messages = Array.isArray(data.messages)
      ? data.messages
      : [String(data.messages || data.message || res.statusText)]
    throw new ApiError(res.status, messages, data.payload ?? null)
  }
  const method = String(options.method || 'GET').toUpperCase()
  if (method !== 'GET' && (/\/(projects|tasks|subtasks)(\/|$|\?)/.test(path) || path.includes('kissflow-sync'))) {
    invalidatePmPortfolio()
  }
  return data as T
}

function qs(params: Record<string, string | number | boolean | undefined> = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v))
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const authApi = {
  login: (email: string, password: string) =>
    api<{ token: string; user: Record<string, unknown> }>('/login', { method: 'POST', json: { email, password } }),
  me: () => api('/user'),
}

export const dashboardApi = {
  counts: () => api<Record<string, number>>('/dashboard'),
  charts: () => api<{
    status: { label: string; value: number }[]
    rag: { label: string; value: number }[]
    category: { label: string; value: number }[]
    taskStatus: { label: string; value: number }[]
  }>('/dashboard/charts'),
  syncKissflow: () =>
    api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(
      '/dashboard/kissflow-sync',
      { method: 'POST', json: {} },
    ),
}

function crud(base: string) {
  return {
    list: (params: Record<string, string | number | boolean | undefined> = {}) =>
      api<ApiList<Record<string, unknown>>>(`${base}${qs(params)}`),
    get: (id: number | string) => api<Record<string, unknown>>(`${base}/${id}`),
    create: (body: unknown) =>
      api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(base, { method: 'POST', json: body }),
    update: (id: number | string, body: unknown) =>
      api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`${base}/${id}`, { method: 'PUT', json: body }),
    remove: (id: number | string) =>
      api<{ status: string; messages: string[] }>(`${base}/${id}`, { method: 'DELETE' }),
    selectlist: (search?: string, limit?: number) =>
      api<{ results: SelectOption[] }>(`${base}/selectlist${qs({ search, limit })}`),
    reopen: (id: number | string, reason: string, status?: string) =>
      api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`${base}/${id}/reopen`, {
        method: 'POST',
        json: { reason, status },
      }),
    importFile: (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`${base}/import`, { method: 'POST', body })
    },
    downloadTemplate: async () => {
      const t = token()
      const res = await fetch(`${getApiBase()}${base}/import/template`, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      })
      if (!res.ok) throw new Error('Could not download template')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${base.replace('/', '')}-import-template.csv`
      a.click()
      URL.revokeObjectURL(url)
    },
    exportFile: async (ids?: number[]) => {
      const t = token()
      const q = ids?.length ? `?ids=${ids.join(',')}` : ''
      const res = await fetch(`${getApiBase()}${base}/export${q}`, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      })
      if (!res.ok) throw new Error('Could not export records')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${base.replace('/', '')}-export.csv`
      a.click()
      URL.revokeObjectURL(url)
    },
    bulkUpdate: (ids: number[], patch: { status?: string; priority?: string; refs?: string[] }) =>
      api<{ status: string; messages: string[]; payload: Record<string, unknown> }>(`${base}/bulk`, {
        method: 'PUT',
        json: { ids, ...patch },
      }),
  }
}

export const projectsApi = crud('/projects')
export const tasksApi = crud('/tasks')
export const subtasksApi = crud('/subtasks')
export const usersApi = crud('/users')
export const employeesApi = {
  ...crud('/employees'),
  sync: () => api<{ status: string; messages: string[]; payload: Record<string, unknown> }>('/employees/sync', { method: 'POST', json: {} }),
  syncStatus: () => api<{ configured: boolean; interval_minutes: number | null }>('/employees/sync/status'),
  syncMasters: () => api('/employees/sync-masters', { method: 'POST', json: {} }),
  importFile: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return api<{ status: string; messages: string[]; payload: Record<string, unknown> }>('/employees/import', { method: 'POST', body })
  },
}
export const groupsApi = {
  catalog: () => api<{ modules: string[]; keys: Array<{ key: string; module: string; action: string; label: string }> }>('/groups/catalog'),
  list: () => api<ApiList<Record<string, unknown>>>('/groups'),
  get: (id: number | string) => api<Record<string, unknown>>(`/groups/${id}`),
  create: (body: unknown) => api('/groups', { method: 'POST', json: body }),
  update: (id: number | string, body: unknown) => api(`/groups/${id}`, { method: 'PUT', json: body }),
  remove: (id: number | string) => api(`/groups/${id}`, { method: 'DELETE' }),
  setMembers: (id: number | string, user_ids: number[]) =>
    api(`/groups/${id}/members`, { method: 'PUT', json: { user_ids } }),
  setUserRoles: (userId: number | string, group_ids: number[]) =>
    api(`/groups/users/${userId}/roles`, { method: 'PUT', json: { group_ids } }),
}
export const activityApi = {
  bundle: (item_type: string, item_id: number | string) =>
    api<{ comments: Record<string, unknown>[]; files: Record<string, unknown>[]; assignees: Record<string, unknown>[] }>(
      `/activity${qs({ item_type, item_id })}`,
    ),
  comment: (item_type: string, item_id: number | string, body: string) =>
    api<{ payload: Record<string, unknown> }>('/activity/comments', { method: 'POST', json: { item_type, item_id, body } }),
  removeComment: (id: number | string) => api(`/activity/comments/${id}`, { method: 'DELETE' }),
  setAssignees: (item_type: string, item_id: number | string, names: string[]) =>
    api('/activity/assignees', { method: 'PUT', json: { item_type, item_id, names } }),
  upload: async (item_type: string, item_id: number | string, file: File, kind?: string) => {
    const body = new FormData()
    body.append('file', file)
    body.append('item_type', item_type)
    body.append('item_id', String(item_id))
    if (kind) body.append('kind', kind)
    return api<{ payload: Record<string, unknown> }>('/activity/files', { method: 'POST', body })
  },
  download: async (id: number | string, fileName: string) => {
    const t = token()
    const res = await fetch(`${getApiBase()}/activity/files/${id}/download`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    })
    if (!res.ok) throw new Error('Download failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  },
  removeFile: (id: number | string) => api(`/activity/files/${id}`, { method: 'DELETE' }),
}

export const mastersApi = {
  companies: crud('/companies'),
  departments: crud('/departments'),
  locations: crud('/locations'),
  legalEntities: crud('/legal-entities'),
}
