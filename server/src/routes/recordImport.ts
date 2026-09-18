import type { Router } from 'express'
import { fail, okMessage } from '../utils/response.js'
import { makeUploader } from '../services/uploads.js'
import { logAction } from '../services/actionLog.js'
import { importRecordsFromFile, templateCsv, type RecordImportKind } from '../services/recordImport.js'

const uploadFile = makeUploader('private_uploads/imports', 'file')

export function attachRecordImport(router: Router, kind: RecordImportKind) {
  router.get('/import/template', (_req, res) => {
    const csv = templateCsv(kind)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${kind}s-import-template.csv"`)
    return res.send(csv)
  })

  router.post('/import', (req, res) => {
    uploadFile(req, res, async (err) => {
      if (err) return fail(res, err.message)
      if (!req.file) return fail(res, 'File required (field name: file)')
      const name = req.file.originalname.toLowerCase()
      if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
        return fail(res, 'Only .xlsx, .xls, or .csv files are supported')
      }
      try {
        const summary = await importRecordsFromFile(kind, req.file.path, req.user)
        await logAction({
          userId: req.user?.id,
          actionType: 'import',
          itemType: kind,
          itemId: 0,
          note: `${req.file.originalname}: +${summary.created} ~${summary.updated}`,
          meta: summary,
        })
        return okMessage(res, `${kind} import completed`, summary)
      } catch (e) {
        return fail(res, e instanceof Error ? e.message : 'Import failed')
      }
    })
  })
}
