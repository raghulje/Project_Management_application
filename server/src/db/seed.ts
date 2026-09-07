import bcrypt from 'bcryptjs'
import { get, now, withTransaction } from './index.js'
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise'

async function connRun(conn: PoolConnection, sql: string, params: any[] = []) {
  const [result] = await conn.execute<ResultSetHeader>(sql, params)
  return result
}

export async function seed() {
  const existing = await get<{ c: number }>('SELECT COUNT(*) as c FROM users')
  if (Number(existing?.c || 0) > 0) {
    console.log('Database already seeded')
    return
  }

  const ts = now()
  const hash = bcrypt.hashSync('Welcome@2026', 10)
  const adminPerms = JSON.stringify({ superuser: '1', admin: '1' })

  await withTransaction(async (conn) => {
    await connRun(conn, `INSERT INTO settings (id, site_name, default_currency, timezone, created_at, updated_at)
      VALUES (1, 'Refex Project Management', 'INR', 'Asia/Kolkata', ?, ?)`, [ts, ts])

    await connRun(conn, `INSERT INTO users (id, first_name, last_name, username, email, password, employee_num, activated, permissions, created_at, updated_at) VALUES
      (1, 'Admin', 'User', 'admin', 'admin@refex.com', ?, 'E0001', 1, ?, ?, ?)`, [
      hash, adminPerms, ts, ts,
    ])

    await connRun(conn, `INSERT INTO permission_groups (id, name, permissions, created_at, updated_at) VALUES
      (1, 'Superusers', ?, ?, ?)`, [adminPerms, ts, ts])
    await connRun(conn, `INSERT INTO users_groups (user_id, group_id) VALUES (1, 1)`)
  })

  try {
    const { ensureDefaultRoles } = await import('../services/permissions.js')
    await ensureDefaultRoles()
  } catch {
    // roles filled on boot
  }

  console.log('Seeded Refex Project Management bootstrap (admin only)')
  console.log('Login: admin@refex.com / Welcome@2026')
}

const isDirect = process.argv[1]?.includes('seed')
if (isDirect) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
