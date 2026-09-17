import type { Location } from 'react-router-dom'

export type NavState = { from?: string; stack?: string[] }

export type Crumb = { to?: string; label: string; state?: NavState }

const MAX_STACK = 16

function asState(raw: unknown): NavState {
  const s = (raw || {}) as NavState
  return {
    from: typeof s.from === 'string' && s.from ? s.from : undefined,
    stack: Array.isArray(s.stack) ? s.stack.filter((x): x is string => typeof x === 'string' && !!x) : undefined,
  }
}

export function here(loc: { pathname: string; search: string }) {
  return `${loc.pathname}${loc.search || ''}`
}

export function fromState(loc: Location): string {
  const from = asState(loc.state).from
  const now = here(loc)
  if (!from || from === now) return ''
  return from
}

function pathOnly(url: string) {
  return url.split('?')[0]
}

function samePlace(a: string, b: string) {
  return a === b || pathOnly(a) === pathOnly(b)
}

function pushUrl(stack: string[], url: string): string[] {
  if (stack[stack.length - 1] === url) return stack.slice(-MAX_STACK)
  return [...stack, url].slice(-MAX_STACK)
}

function inheritedStack(prev: NavState, now: string): string[] {
  if (prev.stack?.length) return prev.stack.filter((s) => s !== now)
  if (prev.from && prev.from !== now) return [prev.from]
  return []
}

export function originLabel(path: string, fallback = 'Back') {
  const p = pathOnly(path)
  if (p === '/' || p.startsWith('/dashboard')) return 'Dashboard'
  if (p.startsWith('/hub/projects')) return 'My projects'
  if (p.startsWith('/hub/tasks')) return 'My tasks'
  if (p.startsWith('/hub/subtasks')) return 'My subtasks'
  if (p === '/projects' || p === '/projects/') return 'All projects'
  if (p === '/tasks' || p === '/tasks/') return 'All tasks'
  if (p === '/subtasks' || p === '/subtasks/') return 'All subtasks'
  if (p.startsWith('/board')) return 'Board'
  if (/^\/projects\/[^/]+/.test(p)) return 'Project'
  if (/^\/tasks\/[^/]+/.test(p)) return 'Task'
  if (/^\/subtasks\/[^/]+/.test(p)) return 'Subtask'
  return fallback
}

export function defaultList(kind: 'project' | 'task' | 'subtask', isEmployee: boolean) {
  if (kind === 'project') return isEmployee ? '/hub/projects' : '/projects'
  if (kind === 'task') return isEmployee ? '/hub/tasks' : '/tasks'
  return isEmployee ? '/hub/subtasks' : '/subtasks'
}

/** State to pass when opening a child from the current page. */
export function navState(loc: { pathname: string; search: string; state?: unknown }): NavState {
  const prev = asState(loc.state)
  const now = here(loc)
  const stack = pushUrl(inheritedStack(prev, now), now)
  return { from: now, stack }
}

function poppedState(stack: string[], dest: string): NavState {
  let rest = stack
  if (rest.length && samePlace(rest[rest.length - 1], dest)) rest = rest.slice(0, -1)
  else rest = rest.filter((s) => !samePlace(s, dest))
  return { from: rest[rest.length - 1], stack: rest }
}

/** Restore the previous page so its own Back still knows where it came from. */
export function stateFor(dest: string, loc: Location): NavState {
  const incoming = asState(loc.state)
  const now = here(loc)
  if (samePlace(dest, now)) return incoming
  const stack = incoming.stack?.length
    ? incoming.stack
    : (incoming.from ? [incoming.from] : [])
  if (incoming.from && samePlace(incoming.from, dest)) return poppedState(stack, dest)
  if (stack.length && samePlace(stack[stack.length - 1], dest)) return poppedState(stack, dest)
  return incoming
}

export function pageCrumbs(opts: {
  loc: Location
  kind?: 'project' | 'task' | 'subtask'
  isEmployee?: boolean
  current: string
  parents?: Array<{ to: string; label: string } | null | undefined>
}): Crumb[] {
  const home: Crumb = { to: '/', label: 'Home', state: crumbState(opts.loc, '/') }
  const crumbs: Crumb[] = [home]
  if (opts.kind) {
    const origin = defaultList(opts.kind, Boolean(opts.isEmployee))
    crumbs.push({ to: origin, label: originLabel(origin, 'List'), state: crumbState(opts.loc, origin) })
  }
  for (const parent of opts.parents || []) {
    if (!parent?.to || !parent.label) continue
    if (crumbs.some((c) => c.to && samePlace(c.to, parent.to))) continue
    crumbs.push({ to: parent.to, label: parent.label, state: crumbState(opts.loc, parent.to) })
  }
  crumbs.push({ label: opts.current })
  return crumbs
}

export function crumbState(loc: Location, target: string): NavState {
  const incoming = asState(loc.state)
  const now = here(loc)
  const stack = incoming.stack?.length
    ? incoming.stack
    : (incoming.from ? [incoming.from] : [])
  const idx = stack.findIndex((s) => samePlace(s, target))
  if (idx >= 0) return poppedState(stack.slice(0, idx + 1), target)
  return { from: now, stack: pushUrl(stack, now) }
}

export function backNav(opts: {
  loc: Location
  kind: 'project' | 'task' | 'subtask'
  isEmployee: boolean
  parent?: { to: string; label: string } | null
}) {
  const origin = defaultList(opts.kind, opts.isEmployee)
  const from = fromState(opts.loc)
  const parent = opts.parent
  const to = from || parent?.to || origin
  const state = stateFor(to, opts.loc)
  let label = originLabel(to, 'Back')
  if (parent && samePlace(to, parent.to)) label = parent.label
  return { to, label, state, from, origin }
}

export function smartBack(opts: {
  loc: Location
  kind: 'project' | 'task' | 'subtask'
  isEmployee: boolean
  parent?: { to: string; label: string } | null
}) {
  const trail = backNav(opts)
  return { backTo: trail.to, backLabel: trail.label, backState: trail.state, from: trail.from, origin: trail.origin }
}
