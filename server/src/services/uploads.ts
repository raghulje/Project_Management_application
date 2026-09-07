import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import multer from 'multer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const storageRoot = path.resolve(__dirname, '../../storage')

for (const d of ['public', 'private_uploads/imports', 'private_uploads/users', 'private_uploads/records']) {
  fs.mkdirSync(path.join(storageRoot, d), { recursive: true })
}

function safeName(original: string) {
  return original.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
}

export function makeUploader(subdir: string, field = 'file') {
  const dest = path.join(storageRoot, subdir)
  fs.mkdirSync(dest, { recursive: true })
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dest),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ''
      const base = path.basename(file.originalname, ext)
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(base)}${ext}`)
    },
  })
  return multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
  }).single(field)
}
