import { useNavigate } from 'react-router-dom'
import { KissflowSDKContext } from '../tracker/sdk/index.js'
import ProjectDashboardPage from '../tracker/ProjectDashboardPage.jsx'
import { useAuth } from '../api/AuthContext'

export default function ProjectDashboard() {
  const { user, logout, isAdmin } = useAuth()
  const nav = useNavigate()
  const displayName = user?.name
    || [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    || user?.username
    || 'Admin'
  const kfUser = {
    Name: displayName,
    FirstName: user?.first_name || displayName.split(' ')[0],
    Email: user?.email || user?.username || '',
    _id: String(user?.id || ''),
    Role: { Name: isAdmin ? 'Admin' : 'User' },
  }
  const kf = {
    api: async () => null,
    user: kfUser,
    client: {
      showInfo: (msg: string) => {
        if (msg) window.alert(msg)
      },
    },
  }

  return (
    <KissflowSDKContext.Provider value={{ kf, sdkReady: true }}>
      <div className="rootDiv">
        <ProjectDashboardPage
          useLayout={false}
          scopeUser={kfUser}
          toolbarPrefix={(
            <button
              type="button"
              onClick={() => { logout(); nav('/login') }}
              className="h-9 min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-blue-50/60 hover:border-slate-300 transition-colors whitespace-nowrap"
            >
              <i className="ri-logout-box-r-line text-sm" />
              Sign out
            </button>
          )}
        />
      </div>
    </KissflowSDKContext.Provider>
  )
}
