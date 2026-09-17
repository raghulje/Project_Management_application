import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './api/AuthContext'
import AppLayout from './layout/AppLayout'
import Login from './pages/Login'
import TrackerHost from './pages/TrackerHost'
import {
  EmployeesPage,
  ProjectDetail,
  ProjectForm,
  ProjectsList,
  SubtaskDetail,
  SubtaskForm,
  SubtasksList,
  TaskDetail,
  TaskForm,
  TasksList,
  UsersList,
} from './pages/Records'
import { CompaniesPage, DepartmentsPage, LocationsPage } from './pages/Masters'
import { EmployeeDetail, EmployeeForm, EmployeeImport } from './pages/Employees'
import { AdminHub, RolesEditor } from './pages/Admin'
import { NotificationsSettings } from './pages/Notifications'
import { EmailLogsPage } from './pages/EmailLogs'
import { ApprovalsPage } from './pages/FieldAccess'
import BoardPage from './pages/BoardPage'

const ProjectDashboardPage = lazy(() => import('./tracker/ProjectDashboardPage.jsx'))
const UserSpecificPT = lazy(() => import('./tracker/UserSpecificPT.jsx'))
const UserHubProjectsProject = lazy(() => import('./tracker/UserHubProjectsProject.jsx'))
const UserHubTasksProject = lazy(() => import('./tracker/UserHubTasksProject.jsx'))
const UserHubSubTasksProject = lazy(() => import('./tracker/UserHubSubTasksProject.jsx'))

function ScreenFallback() {
  return (
    <div className="ak-boot">
      <span className="em-spinner" aria-hidden />
      <p>Loading workspace…</p>
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <ScreenFallback />
  if (!user) return <Navigate to="/login" replace />
  return <div className="pm-app-root">{children}</div>
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return <ScreenFallback />
  if (!isAdmin) return <p className="ak-gate">Admin only.</p>
  return children
}

function Gate({ perm, children }: { perm: string; children: ReactNode }) {
  const { can, isAdmin } = useAuth()
  if (!isAdmin && !can(perm)) return <p className="ak-gate">You do not have {perm}.</p>
  return children
}

function Track({ children }: { children: ReactNode }) {
  return (
    <TrackerHost>
      <Suspense fallback={<ScreenFallback />}>{children}</Suspense>
    </TrackerHost>
  )
}

function ExecDashboard() {
  const { user, isAdmin, roleName } = useAuth()
  const displayName = user?.name || user?.username || 'Admin'
  return (
    <TrackerHost>
      <Suspense fallback={<ScreenFallback />}>
        <ProjectDashboardPage
          useLayout={false}
          scopeUser={{
            Name: displayName,
            FirstName: user?.first_name || displayName.split(' ')[0],
            Email: user?.email || user?.username || '',
            _id: String(user?.id || ''),
            Role: { Name: roleName || (isAdmin ? 'Admin' : 'Project Manager') },
          }}
        />
      </Suspense>
    </TrackerHost>
  )
}

function Home() {
  const { isEmployee } = useAuth()
  if (isEmployee) return <Navigate to="/hub/projects" replace />
  return <Gate perm="projects.view"><ExecDashboard /></Gate>
}

function LoginOrHome() {
  const { user, homePath } = useAuth()
  if (user) return <Navigate to={homePath} replace />
  return <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginOrHome />} />
          <Route path="/*" element={
            <RequireAuth>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/dashboard/my-work" element={<Gate perm="tasks.view"><Track><UserSpecificPT /></Track></Gate>} />
                  <Route path="/hub/projects" element={<Gate perm="projects.view"><Track><UserHubProjectsProject /></Track></Gate>} />
                  <Route path="/hub/tasks" element={<Gate perm="tasks.view"><Track><UserHubTasksProject /></Track></Gate>} />
                  <Route path="/hub/subtasks" element={<Gate perm="subtasks.view"><Track><UserHubSubTasksProject /></Track></Gate>} />
                  <Route path="/approvals" element={<ApprovalsPage />} />
                  <Route path="/projects" element={<Gate perm="projects.view"><ProjectsList /></Gate>} />
                  <Route path="/projects/new" element={<Gate perm="projects.create"><ProjectForm /></Gate>} />
                  <Route path="/projects/:id" element={<Gate perm="projects.view"><ProjectDetail /></Gate>} />
                  <Route path="/projects/:id/edit" element={<Gate perm="projects.edit"><ProjectForm /></Gate>} />
                  <Route path="/board" element={<Gate perm="tasks.view"><BoardPage /></Gate>} />
                  <Route path="/tasks" element={<Gate perm="tasks.view"><TasksList /></Gate>} />
                  <Route path="/tasks/new" element={<Gate perm="tasks.create"><TaskForm /></Gate>} />
                  <Route path="/tasks/:id" element={<Gate perm="tasks.view"><TaskDetail /></Gate>} />
                  <Route path="/tasks/:id/edit" element={<Gate perm="tasks.edit"><TaskForm /></Gate>} />
                  <Route path="/subtasks" element={<Gate perm="subtasks.view"><SubtasksList /></Gate>} />
                  <Route path="/subtasks/new" element={<Gate perm="subtasks.create"><SubtaskForm /></Gate>} />
                  <Route path="/subtasks/:id" element={<Gate perm="subtasks.view"><SubtaskDetail /></Gate>} />
                  <Route path="/subtasks/:id/edit" element={<Gate perm="subtasks.edit"><SubtaskForm /></Gate>} />
                  <Route path="/users" element={<RequireAdmin><UsersList /></RequireAdmin>} />
                  <Route path="/employees" element={<RequireAdmin><EmployeesPage /></RequireAdmin>} />
                  <Route path="/employees/import" element={<RequireAdmin><EmployeeImport /></RequireAdmin>} />
                  <Route path="/employees/new" element={<RequireAdmin><EmployeeForm /></RequireAdmin>} />
                  <Route path="/employees/:id" element={<RequireAdmin><EmployeeDetail /></RequireAdmin>} />
                  <Route path="/employees/:id/edit" element={<RequireAdmin><EmployeeForm /></RequireAdmin>} />
                  <Route path="/admin" element={<RequireAdmin><AdminHub /></RequireAdmin>} />
                  <Route path="/settings/roles" element={<RequireAdmin><RolesEditor /></RequireAdmin>} />
                  <Route path="/settings/notifications" element={<RequireAdmin><NotificationsSettings /></RequireAdmin>} />
                  <Route path="/admin/email-logs" element={<RequireAdmin><EmailLogsPage /></RequireAdmin>} />
                  <Route path="/companies" element={<RequireAdmin><CompaniesPage /></RequireAdmin>} />
                  <Route path="/departments" element={<RequireAdmin><DepartmentsPage /></RequireAdmin>} />
                  <Route path="/locations" element={<RequireAdmin><LocationsPage /></RequireAdmin>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </RequireAuth>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
