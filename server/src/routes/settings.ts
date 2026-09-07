import { Router } from 'express'
import { get, run, now } from '../db/index.js'
import { fail, okItem, okMessage } from '../utils/response.js'
import { requirePerm } from '../services/permissions.js'
import { runPendingSchemaMigrations } from '../services/schemaMigrate.js'

export const settingsRouter = Router()
export const accountRouter = Router()

settingsRouter.get('/', async (_req, res) => {
  const row = await get(`SELECT * FROM settings WHERE id = 1`)
  return okItem(res, row || { site_name: 'Project Management' })
})

settingsRouter.put('/', requirePerm('settings.edit'), async (req, res) => {
  const b = req.body || {}
  const fields = ['site_name', 'site_locale', 'default_currency', 'timezone', 'alert_email', 'login_note']
    .filter((f) => b[f] !== undefined)
  if (!fields.length) return fail(res, 'No fields')
  await run(
    `UPDATE settings SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = 1`,
    [...fields.map((f) => b[f]), now()],
  )
  return okMessage(res, 'Settings updated', await get(`SELECT * FROM settings WHERE id = 1`))
})

settingsRouter.post('/migrate', requirePerm('settings.edit'), async (_req, res) => {
  const result = await runPendingSchemaMigrations()
  return okMessage(res, 'Migrations applied', result)
})

accountRouter.get('/', async (req, res) => {
  const { transformUser } = await import('../services/transformers.js')
  return okItem(res, await transformUser(req.user!.id))
})

accountRouter.put('/password', async (req, res) => {
  const bcrypt = await import('bcryptjs')
  const password = String(req.body?.password || '')
  if (password.length < 8) return fail(res, 'Password must be at least 8 characters')
  await run(`UPDATE users SET password = ?, updated_at = ? WHERE id = ?`, [
    bcrypt.hashSync(password, 10), now(), req.user!.id,
  ])
  return okMessage(res, 'Password updated')
})
