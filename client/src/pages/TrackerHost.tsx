import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { KissflowSDKContext } from '../tracker/sdk/index.js'
import { ProjectTrackerEmbedContext } from '../tracker/contexts/ProjectTrackerEmbedContext.jsx'
import { useAuth } from '../api/AuthContext'
import { goPm } from '../tracker/pmApi.js'

const PROJECT_POPUPS = new Set(['Popup_Xrl9X_fXTJ', 'Popup_OBRKd64ROV'])
const TASK_POPUPS = new Set(['Popup_8POjXW0UE8', 'Popup_V6Y6naBre6'])
const SUBTASK_POPUPS = new Set(['Popup_WbcLURdUXx', 'Popup_djVrj_A4yG', 'Popup_RJMQ6gy18i'])

function localPopupPath(popupId: string, params: Record<string, unknown> = {}) {
  const instance = String(params.InstanceID || params.CaseID || params.id || '').trim()
  if (PROJECT_POPUPS.has(popupId)) return instance ? `/projects/${encodeURIComponent(instance)}` : '/projects/new'
  if (TASK_POPUPS.has(popupId)) return instance ? `/tasks/${encodeURIComponent(instance)}` : '/tasks/new'
  if (SUBTASK_POPUPS.has(popupId)) return instance ? `/subtasks/${encodeURIComponent(instance)}` : '/subtasks/new'
  return ''
}

export default function TrackerHost({ children }: { children: ReactNode }) {
  const { user, isAdmin, roleName } = useAuth()
  const nav = useNavigate()
  useEffect(() => {
    window.__pmNavigate = (path: string) => nav(path)
    return () => { delete window.__pmNavigate }
  }, [nav])

  const displayName = user?.name
    || [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    || user?.username
    || 'User'
  const kfUser = {
    Name: displayName,
    FirstName: user?.first_name || displayName.split(' ')[0],
    Email: user?.email || user?.username || '',
    _id: String(user?.id || ''),
    Role: { Name: roleName || (isAdmin ? 'Admin' : 'User') },
  }
  const openPopup = (popupId: string, params: Record<string, unknown> = {}) => {
    const path = localPopupPath(String(popupId || ''), params)
    if (path) goPm(path)
    return Promise.resolve()
  }
  const kf = {
    api: async () => null,
    user: kfUser,
    client: {
      showInfo: (msg: string) => { if (msg) window.alert(msg) },
      openPopup,
    },
    app: { page: { openPopup } },
  }

  return (
    <KissflowSDKContext.Provider value={{ kf, sdkReady: true }}>
      <ProjectTrackerEmbedContext.Provider value={{ embed: true }}>
        <div className="rootDiv">{children}</div>
      </ProjectTrackerEmbedContext.Provider>
    </KissflowSDKContext.Provider>
  )
}
