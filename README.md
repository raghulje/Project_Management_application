# Refex Project Management

Same client/server layout as Asset Management 2026:

- `server/` — Express 5 + TypeScript + MySQL (`/api/v1`)
- `client/` — Vite + React, built to `client/out`
- Production: `SERVE_CLIENT=true` so one Node process serves API + UI

## Modules

| Area | Source |
|---|---|
| Auth, users, roles, companies, departments | Copied pattern from Asset Management |
| HRMS sync (Adrenalin) | Copied `adrenalinHrms`, `employeeHrmsSync`, `employeeImport`, `hrmsMastersSync` |
| Projects / tasks / subtasks | Schema + APIs from `Raghul/*.json` Kissflow fields |

Hierarchy: **Project → Task → Subtask** (`projects.id` ← `tasks.project_id` ← `subtasks.task_id`).

## Setup

```bash
cd Project_Management_App/server
copy .env.example .env
# set DB_*  (use a NEW database: ProjectManagement_2026)
npm install
npm run migrate
npm run seed
npm run import:kissflow   # optional — loads Raghul/ JSON dumps

cd ../client
npm install
npm run dev               # http://localhost:5174  (proxies /api to :3060)

cd ../server
npm run dev               # http://localhost:3060
```

Login: `admin@refex.com` / `Welcome@2026`

Single-port deploy (Asset Management style):

```bash
cd client && npm run build
# server/.env: SERVE_CLIENT=true  PORT=3060
cd ../server && npm start
```

## API

- `POST /api/v1/login`
- `GET/POST /api/v1/projects` · `GET/PUT/DELETE /api/v1/projects/:id`
- `GET/POST /api/v1/tasks` · filter `?project_id=`
- `GET/POST /api/v1/subtasks` · filter `?task_id=`
- `GET /api/v1/employees` · `POST /api/v1/employees/sync` (HRMS)
- `GET /api/v1/users` · `GET /api/v1/groups`
- `GET /api/v1/dashboard`

HRMS env (same as Asset Management): `ADRENALIN_USERNAME`, `ADRENALIN_PASSWORD`, `ADRENALIN_COMPANY_ID`.
