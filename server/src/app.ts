import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import helmet from 'helmet'
import compression from 'compression'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authRequired } from './middleware/auth.js'
import { fail } from './utils/response.js'
import authRouter from './routes/auth.js'
import { usersRouter } from './routes/users.js'
import { employeesRouter } from './routes/employees.js'
import { groupsRouter } from './routes/groups.js'
import { mastersRouter } from './routes/masters.js'
import { projectsRouter } from './routes/projects.js'
import { tasksRouter } from './routes/tasks.js'
import { subtasksRouter } from './routes/subtasks.js'
import { dashboardRouter } from './routes/dashboard.js'
import { settingsRouter, accountRouter } from './routes/settings.js'
import { notificationsRouter } from './routes/notifications.js'
import { activityRouter } from './routes/activity.js'
import { fieldAccessRouter } from './routes/fieldAccess.js'
import { storageRoot } from './services/uploads.js'
import { moduleGate, requirePerm } from './services/permissions.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientOutPath = path.resolve(__dirname, '../../client/out')

export function createApp() {
  const app = express()

  const useHttps = process.env.FORCE_HTTPS === 'true'
  app.use(helmet({
    hsts: useHttps ? undefined : false,
    crossOriginOpenerPolicy: useHttps ? { policy: 'same-origin' } : false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        upgradeInsecureRequests: useHttps ? [] : null,
        'font-src': ["'self'", 'https:', 'data:', 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com'],
        'style-src': ["'self'", 'https:', "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'script-src': ["'self'", "'unsafe-inline'"],
        'connect-src': ["'self'", 'http:', 'https:'],
      },
    },
  }))

  app.use(cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return cb(null, true)
      if (/^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/i.test(origin)) {
        return cb(null, true)
      }
      const allowed = String(process.env.CLIENT_ORIGIN || process.env.FRONTEND_URL || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (allowed.includes(origin)) return cb(null, true)
      return cb(null, false)
    },
    credentials: true,
  }))

  app.use(compression())
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '20mb' }))
  app.use(express.urlencoded({ extended: false }))
  app.use(process.env.NODE_ENV === 'production' ? morgan('combined') : morgan('dev'))

  app.use('/storage', express.static(path.join(storageRoot, 'public'), { fallthrough: true }))
  app.use('/storage', express.static(storageRoot))

  app.get('/api/v1/status', (_req, res) => {
    res.json({
      status: 'ok',
      product: 'Refex Project Management',
      version: '1.0.0',
      serve_client: process.env.SERVE_CLIENT === 'true',
      features: ['projects', 'tasks', 'subtasks', 'hrms-sync', 'admin-rbac', 'kissflow-import'],
    })
  })

  app.use('/api/v1', authRouter)

  const api = express.Router()
  api.use(authRequired)

  api.use('/groups', groupsRouter)
  api.use('/users', moduleGate('people'), usersRouter)
  api.use('/employees', moduleGate('people'), employeesRouter)
  api.use([
    '/companies', '/legal-entities', '/locations', '/departments',
  ], (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next()
    return requirePerm('settings.edit')(req, res, next)
  })
  api.use(mastersRouter)
  api.use('/projects', moduleGate('projects'), projectsRouter)
  api.use('/tasks', moduleGate('tasks'), tasksRouter)
  api.use('/subtasks', moduleGate('subtasks'), subtasksRouter)
  api.use('/activity', activityRouter)
  api.use('/field-access', fieldAccessRouter)
  api.use('/dashboard', dashboardRouter)
  api.use(notificationsRouter)
  api.use('/settings', moduleGate('settings'), settingsRouter)
  api.use('/account', accountRouter)

  app.use('/api/v1', api)

  const shouldServeClient = process.env.SERVE_CLIENT === 'true'
  if (shouldServeClient && fs.existsSync(clientOutPath)) {
    console.log('Serving production client from:', clientOutPath)
    app.use(express.static(clientOutPath, {
      maxAge: '1y',
      etag: true,
      lastModified: true,
      setHeaders(res, filePath) {
        const ext = path.extname(filePath).toLowerCase()
        const oneYear = 31536000
        if (['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico', '.woff', '.woff2'].includes(ext)) {
          res.setHeader('Cache-Control', `public, max-age=${oneYear}, immutable`)
        } else if (ext === '.html') {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
        }
      },
    }))

    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next()
      const p = req.path || ''
      if (p.startsWith('/api') || p.startsWith('/storage')) return next()
      return res.sendFile(path.join(clientOutPath, 'index.html'))
    })
  } else if (shouldServeClient) {
    console.warn('SERVE_CLIENT=true but client/out not found — run: cd client && npm run build')
  } else {
    app.get('/', (req, res) => {
      const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
      const host = req.get('host')
      const baseUrl = `${protocol}://${host}`
      res.json({
        message: 'Refex Project Management API is running',
        mode: process.env.NODE_ENV || 'development',
        apiUrl: `${baseUrl}/api/v1`,
        clientUrl: process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || `${protocol}://${String(host).split(':')[0]}:5174`,
        note: 'Set SERVE_CLIENT=true and build client/out to serve the UI from this process',
      })
    })
  }

  app.use((_req, res) => fail(res, 'Not found', 404))
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err)
    return fail(res, err.message || 'Server error', 500)
  })

  return app
}
