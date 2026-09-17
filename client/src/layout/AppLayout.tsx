import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../api/AuthContext'
import { fieldAccessApi } from '../pages/FieldAccess'
import { navState } from '../lib/recordNav'

const SIDEBAR_KEY = 'pm_sidebar_collapsed'

type Item = { to: string; label: string; icon: string; show?: boolean; end?: boolean; badge?: number }

export default function AppLayout({ children, embed }: { children?: ReactNode; embed?: boolean }) {
  const { user, logout, isAdmin, isLeadership, isEmployee, roleName } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1' } catch { return false }
  })
  const [pendingApprovals, setPendingApprovals] = useState(0)

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0') } catch { /* ignore */ }
  }, [collapsed])

  useEffect(() => {
    fieldAccessApi.count().then((r) => setPendingApprovals(Number(r.pending || 0))).catch(() => undefined)
  }, [loc.pathname])

  useEffect(() => {
    window.__pmNavigate = (path: string) => {
      nav(path, { state: navState(loc) })
    }
    return () => { delete window.__pmNavigate }
  }, [nav, loc])

  const leadership = isAdmin || isLeadership
  const employeeOnly = isEmployee && !leadership

  const work: Item[] = leadership
    ? [
        { to: '/', label: 'Dashboard', icon: 'ri-layout-grid-line', end: true },
        { to: '/dashboard/my-work', label: 'My work', icon: 'ri-briefcase-4-line' },
      ]
    : []

  const hub: Item[] = employeeOnly
    ? [
        { to: '/hub/projects', label: 'Projects', icon: 'ri-folder-user-line' },
        { to: '/hub/tasks', label: 'Tasks', icon: 'ri-task-line' },
        { to: '/hub/subtasks', label: 'Subtasks', icon: 'ri-list-check-3' },
      ]
    : []

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
        { to: '/admin/email-logs', label: 'Email logs', icon: 'ri-mail-send-line' },
        { to: '/companies', label: 'Companies', icon: 'ri-building-line' },
        { to: '/departments', label: 'Departments', icon: 'ri-building-4-line' },
        { to: '/locations', label: 'Locations', icon: 'ri-map-pin-line' },
      ]
    : []

  const isDash = embed || loc.pathname === '/' || loc.pathname.startsWith('/dashboard')
    || loc.pathname.startsWith('/hub') || loc.pathname.startsWith('/my') || loc.pathname === '/reports'

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

  return (
    <div className={`pm-shell${collapsed ? ' is-collapsed' : ''}`}>
      <aside className="pm-side">
        <div className="pm-brand">
          <img className="pm-logo" src="/refexone-logo.png" alt="RefexOne" />
          <button
            type="button"
            className="pm-collapse"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Maximize sidebar' : 'Minimize sidebar'}
            title={collapsed ? 'Maximize sidebar' : 'Minimize sidebar'}
          >
            <i className={collapsed ? 'ri-menu-unfold-line' : 'ri-menu-fold-line'} />
          </button>
        </div>
        <nav className="pm-navs">
          {work.length ? <><p>Workspace</p>{render(work)}</> : null}
          {hub.length ? <><p>My work</p>{render(hub)}</> : null}
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
