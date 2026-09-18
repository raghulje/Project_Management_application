import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../api/AuthContext'
import { fieldAccessApi } from '../pages/FieldAccess'
import { navState } from '../lib/recordNav'

const SIDEBAR_KEY = 'pm_sidebar_collapsed'

type Item = { to: string; label: string; icon: string; show?: boolean; end?: boolean; badge?: number }

export default function AppLayout({ children, embed }: { children?: ReactNode; embed?: boolean }) {
  const { user, logout, isAdmin, isLeadership, isEmployee, roleName, can } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1' } catch { return false }
  })
  const [narrow, setNarrow] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false
  ))
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingApprovals, setPendingApprovals] = useState(0)

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0') } catch { /* ignore */ }
  }, [collapsed])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = () => setNarrow(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => { setMenuOpen(false) }, [loc.pathname])

  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    fieldAccessApi.count().then((r) => setPendingApprovals(Number(r.pending || 0))).catch(() => undefined)
  }, [loc.pathname])

  useEffect(() => {
    window.__pmNavigate = (path: string, extra?: { from?: string }) => {
      const state = navState(loc)
      nav(path, { state: extra?.from ? { ...state, from: extra.from } : state })
    }
    return () => { delete window.__pmNavigate }
  }, [nav, loc])

  const leadership = (isAdmin || isLeadership) && !isEmployee
  const showReports = isAdmin || (!isEmployee && can('reports.view'))

  const work: Item[] = [
    { to: '/', label: 'Dashboard', icon: 'ri-layout-grid-line', end: true, show: leadership },
    { to: '/dashboard/my-work', label: 'My work', icon: 'ri-briefcase-4-line', show: can('tasks.view') },
    { to: '/projects', label: 'Projects', icon: 'ri-folder-3-line', show: can('projects.view') },
    { to: '/tasks', label: 'Tasks', icon: 'ri-task-line', show: can('tasks.view') },
    { to: '/subtasks', label: 'Subtasks', icon: 'ri-list-check-3', show: can('subtasks.view') },
    { to: '/board', label: 'Board', icon: 'ri-kanban-view', show: can('tasks.view') },
    { to: '/reports', label: 'Reports', icon: 'ri-bar-chart-2-line', show: showReports },
  ]

  const approvals: Item[] = [
    { to: '/approvals', label: 'Approvals', icon: 'ri-shield-check-line', badge: pendingApprovals },
  ]

  const admin: Item[] = isAdmin
    ? [
        { to: '/admin', label: 'Admin console', icon: 'ri-settings-3-line' },
        { to: '/employees', label: 'Employees', icon: 'ri-team-line' },
        { to: '/users', label: 'App users', icon: 'ri-user-settings-line' },
        { to: '/settings/roles', label: 'Roles', icon: 'ri-shield-keyhole-line' },
        { to: '/settings/notifications', label: 'Notifications', icon: 'ri-notification-3-line' },
        { to: '/admin/email-logs', label: 'Notification logs', icon: 'ri-notification-3-line' },
        { to: '/companies', label: 'Companies', icon: 'ri-building-line' },
        { to: '/departments', label: 'Departments', icon: 'ri-building-4-line' },
        { to: '/locations', label: 'Locations', icon: 'ri-map-pin-line' },
      ]
    : []

  const isDash = embed || loc.pathname === '/' || loc.pathname.startsWith('/dashboard')
    || loc.pathname === '/reports'

  const render = (items: Item[]) => items.filter((i) => i.show !== false).map((i) => (
    <NavLink
      key={i.to}
      to={i.to}
      end={i.end}
      title={i.label}
      className={({ isActive }) => `pm-nav${isActive ? ' is-active' : ''}`}
    >
      <i className={i.icon} />
      <span>{i.label}</span>
      {i.badge ? <em className="pm-nav-badge">{i.badge > 9 ? '9+' : i.badge}</em> : null}
    </NavLink>
  ))

  const who = user?.name || user?.username || 'User'
  const whoShort = String(who).split(' ')[0]

  return (
    <div className={`pm-shell${collapsed && !narrow ? ' is-collapsed' : ''}${narrow ? ' is-narrow' : ''}${menuOpen ? ' is-drawer-open' : ''}`}>
      {narrow ? (
        <header className="pm-topbar">
          <button
            type="button"
            className="pm-collapse"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <i className={menuOpen ? 'ri-close-line' : 'ri-menu-line'} />
          </button>
          <img className="pm-logo" src="/refexone-logo.png" alt="RefexOne" />
          <span className="pm-top-who">{whoShort}</span>
        </header>
      ) : null}
      {narrow && menuOpen ? (
        <button type="button" className="pm-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      ) : null}
      <aside className="pm-side" aria-hidden={narrow && !menuOpen}>
        <div className="pm-brand">
          <img className="pm-logo" src="/refexone-logo.png" alt="RefexOne" />
          <button
            type="button"
            className="pm-collapse"
            onClick={() => (narrow ? setMenuOpen(false) : setCollapsed((v) => !v))}
            aria-label={narrow ? 'Close menu' : (collapsed ? 'Maximize sidebar' : 'Minimize sidebar')}
            title={narrow ? 'Close menu' : (collapsed ? 'Maximize sidebar' : 'Minimize sidebar')}
          >
            <i className={narrow ? 'ri-close-line' : (collapsed ? 'ri-menu-unfold-line' : 'ri-menu-fold-line')} />
          </button>
        </div>
        <nav className="pm-navs">
          {work.length ? <><p>Workspace</p>{render(work)}</> : null}
          <p>Requests</p>{render(approvals)}
          {admin.length ? <><p>Admin</p>{render(admin)}</> : null}
        </nav>
        <div className="pm-side-foot">
          <div className="pm-who">
            <b>{user?.name || user?.username}</b>
            <span>{roleName || user?.email || user?.username}</span>
          </div>
          <button type="button" className="pm-signout" onClick={() => { logout(); nav('/login') }}>
            <i className="ri-logout-box-r-line" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <main className={`pm-main${isDash ? ' is-embed' : ''}`}>
        {children ?? <Outlet />}
      </main>
    </div>
  )
}
