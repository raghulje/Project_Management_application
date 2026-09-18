import type { Router } from 'express'
import { fail, okMessage } from '../utils/response.js'
import { bulkUpdateRecords, exportRecordsCsv } from '../services/recordBulk.js'
import type { RecordImportKind } from '../services/recordImport.js'

export function attachRecordBulk(router: Router, kind: RecordImportKind) {
  router.get('/export', async (req, res) => {
    try {
      const csv = await exportRecordsCsv(kind, req.user, req.query.ids)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${kind}s-export.csv"`)
      return res.send(csv)
    } catch (e) {
      return fail(res, e instanceof Error ? e.message : 'Export failed')
    }
  })

  router.put('/bulk', async (req, res) => {
    if (!req.user) return fail(res, 'Unauthorized', 401)
    try {
      const summary = await bulkUpdateRecords(kind, req.user, req.body?.ids, {
        status: req.body?.status,
        priority: req.body?.priority,
        refs: req.body?.refs,
      })
      return okMessage(res, `${kind} bulk update completed`, summary)
    } catch (e) {
      return fail(res, e instanceof Error ? e.message : 'Bulk update failed')
    }
  })
}
