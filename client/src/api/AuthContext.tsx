import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authApi, setToken } from './client'
import { homePathForRole, isEmployeeRole, isLeadershipRole, normalizeRoles, primaryRole } from './roles'

type User = {
  id: number
  username: string
  first_name: string
  last_name: string
  email?: string
  name?: string
  permissions?: Record<string, unknown>
  roles?: string[]
  groups?: string[]
  role?: string
}

type AuthCtx = {
  user: User | null
  loading: boolean
  permissions: Record<string, unknown>
  roles: string[]
  roleName: string
  isAdmin: boolean
  isLeadership: boolean
  isEmployee: boolean
  homePath: string
  can: (permission: string) => boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

function isTruthy(v: unknown) {
  return v === '1' || v === 1 || v === true || v === 'true'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = localStorage.getItem('refex_pm_token')
    if (!t) {
      setLoading(false)
      return
    }
    authApi.me()
      .then((u) => setUser(u as User))
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  const permissions = (user?.permissions && typeof user.permissions === 'object') ? user.permissions : {}
  const isAdmin = isTruthy(permissions.superuser) || isTruthy(permissions.admin)
  const roles = normalizeRoles(user)
  const isLeadership = isLeadershipRole(roles)
  const isEmployee = isEmployeeRole(roles, isAdmin, isLeadership)
  const roleName = primaryRole(user, isAdmin)
  const homePath = homePathForRole({ isAdmin, isLeadership, isEmployee })

  const value: AuthCtx = {
    user,
    loading,
    permissions,
    roles,
    roleName,
    isAdmin,
    isLeadership,
    isEmployee,
    homePath,
    can: (permission) => isAdmin || isTruthy(permissions[permission]),
    login: async (email, password) => {
      const res = await authApi.login(email, password)
      setToken(res.token)
      setUser((res.user || (await authApi.me())) as User)
    },
    logout: () => {
      setToken(null)
      setUser(null)
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
