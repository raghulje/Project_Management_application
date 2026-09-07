import { fetchAdrenalinEmployees, isAdrenalinConfigured, type FetchEmployeesOpts } from './adrenalinHrms.js'
import { upsertEmployeeRows, type ImportSummary } from './employeeImport.js'
import { syncMastersFromEmployees, type MastersSyncSummary } from './hrmsMastersSync.js'

export type SyncSummary = ImportSummary & {
  source: 'adrenalin'
  fetched: number
  durationMs: number
  masters: MastersSyncSummary
}

export async function syncEmployeesFromHrms(opts: FetchEmployeesOpts = {}): Promise<SyncSummary> {
  if (!isAdrenalinConfigured()) {
    throw new Error('Adrenalin HRMS is not configured (set ADRENALIN_USERNAME / ADRENALIN_PASSWORD)')
  }
  const started = Date.now()
  const rows = await fetchAdrenalinEmployees(opts)
  const summary = await upsertEmployeeRows(rows)
  const masters = await syncMastersFromEmployees()
  return {
    ...summary,
    source: 'adrenalin',
    fetched: rows.length,
    durationMs: Date.now() - started,
    masters,
  }
}

let syncTimer: ReturnType<typeof setInterval> | null = null
let syncRunning = false

/** Optional interval sync from ADRENALIN_SYNC_INTERVAL_MINUTES */
export function startHrmsAutoSync() {
  const minutes = Number(process.env.ADRENALIN_SYNC_INTERVAL_MINUTES || 0)
  if (!minutes || minutes < 1 || !isAdrenalinConfigured()) return

  const ms = minutes * 60_000
  console.log(`HRMS auto-sync enabled every ${minutes} minute(s)`)

  const tick = async () => {
    if (syncRunning) {
      console.warn('HRMS sync skipped (previous run still in progress)')
      return
    }
    syncRunning = true
    try {
      const result = await syncEmployeesFromHrms()
      console.log(
        `HRMS sync done: fetched=${result.fetched} +${result.created} ~${result.updated} skip=${result.skipped} (${result.durationMs}ms)`,
      )
    } catch (e) {
      console.error('HRMS auto-sync failed:', e instanceof Error ? e.message : e)
    } finally {
      syncRunning = false
    }
  }

  // First run after a short delay so the server finishes booting
  setTimeout(() => { void tick() }, 15_000)
  syncTimer = setInterval(() => { void tick() }, ms)
}

export function stopHrmsAutoSync() {
  if (syncTimer) clearInterval(syncTimer)
  syncTimer = null
}
