import ReportsPage from './pages/reports/page.jsx'
import { ProjectTrackerEmbedContext } from './contexts/ProjectTrackerEmbedContext.jsx'

export default function ReportsProject() {
  return (
    <ProjectTrackerEmbedContext.Provider value={{ embed: true }}>
      <ReportsPage useLayout={false} />
    </ProjectTrackerEmbedContext.Provider>
  )
}
