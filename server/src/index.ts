import dotenv from 'dotenv'
import { createApp } from './app.js'
import { seed } from './db/seed.js'
import { startHrmsAutoSync } from './services/employeeHrmsSync.js'

dotenv.config()

const port = Number(process.env.PORT) || 3060
const host = process.env.HOST || '0.0.0.0'
const serveClient = process.env.SERVE_CLIENT === 'true'
const publicApp = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '')

try {
  const { runPendingSchemaMigrations } = await import('./services/schemaMigrate.js')
  const mig = await runPendingSchemaMigrations()
  console.log(`Schema ready (${mig.table_count} tables, applied ${mig.applied.length})`)
} catch (e) {
  console.error('Migration failed:', e instanceof Error ? e.message : e)
  process.exit(1)
}

await seed()
try {
  const { disableAllNotifications } = await import('./services/notificationConfig.js')
  await disableAllNotifications()
  console.log('Notifications disabled')
} catch (e) {
  console.warn('Could not disable notifications:', e instanceof Error ? e.message : e)
}
try {
  const { ensureDefaultRoles } = await import('./services/permissions.js')
  await ensureDefaultRoles()
  console.log('Roles & permissions ready')
} catch (e) {
  console.warn('ensureDefaultRoles failed:', e instanceof Error ? e.message : e)
}
try {
  const { backfillTimelineRevisions } = await import('./services/revisions.js')
  await backfillTimelineRevisions()
} catch (e) {
  console.warn('Revision backfill skipped:', e instanceof Error ? e.message : e)
}

const app = createApp()

app.listen(port, host, () => {
  console.log(`Refex Project Management API listening on http://${host}:${port}`)
  console.log(`Local:  http://localhost:${port}`)
  if (serveClient) {
    console.log(`Mode:   SERVE_CLIENT=true (API + client/out on one port)`)
    if (publicApp) console.log(`Public: ${publicApp}`)
  } else {
    console.log(`Dev:    Vite on :5174 + API on :${port} (set SERVE_CLIENT=true for single-port deploy)`)
  }
  console.log(`Health: http://localhost:${port}/api/v1/status`)
  console.log(`Login:  POST /api/v1/login  { "email": "…", "password": "…" }`)
  startHrmsAutoSync()
})
