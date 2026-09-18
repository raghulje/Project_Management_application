import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export type SchemaMigrateResult = {
  applied: string[]
  skipped: string[]
  table_count: number
}

function mysqlMigrationsDir() {
  return path.join(__dirname, '../db/mysql')
}

export async function runPendingSchemaMigrations(): Promise<SchemaMigrateResult> {
  const host = process.env.DB_HOST || 'localhost'
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_NAME || 'ProjectManagement_2026'

  const root = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true,
    charset: 'utf8mb4',
  })

  try {
    await root.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
    await root.changeUser({ database })

    await root.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        version VARCHAR(191) NOT NULL,
        applied_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_schema_migrations_version (version)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => undefined)

    const dir = mysqlMigrationsDir()
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    const applied: string[] = []
    const skipped: string[] = []

    for (const file of files) {
      const versionName = file.replace(/\.sql$/, '')

      if (/^\d{3}_/.test(file) && !file.startsWith('001')) {
        const [rows] = await root.query<mysql.RowDataPacket[]>(
          `SELECT id FROM schema_migrations WHERE version = ? LIMIT 1`,
          [versionName],
        ).catch(() => [[] as mysql.RowDataPacket[]])
        if (rows.length) {
          skipped.push(versionName)
          continue
        }
      }

      const sql = fs.readFileSync(path.join(dir, file), 'utf8')
        .replace(/CREATE DATABASE[\s\S]*?;/i, '')
        .replace(/USE\s+`?[\w]+`?\s*;/gi, '')
      await root.query(sql)
      await root.query(
        `INSERT IGNORE INTO schema_migrations (version) VALUES (?)`,
        [versionName],
      ).catch(() => undefined)
      applied.push(versionName)
    }

    const extraCols: Array<[string, string, string]> = [
      ['projects', 'tco_efforts', 'DECIMAL(10,2) NULL'],
      ['projects', 'risk_mitigation_details', 'TEXT NULL'],
      ['projects', 'assignee_name', 'VARCHAR(191) NULL'],
      ['projects', 'source', "VARCHAR(16) NOT NULL DEFAULT 'local'"],
      ['projects', 'closed_at', 'DATETIME NULL'],
      ['projects', 'closed_by_user_id', 'INT UNSIGNED NULL'],
      ['projects', 'deleted_by_user_id', 'INT UNSIGNED NULL'],
      ['tasks', 'source', "VARCHAR(16) NOT NULL DEFAULT 'local'"],
      ['tasks', 'updated_by_user_id', 'INT UNSIGNED NULL'],
      ['tasks', 'closed_at', 'DATETIME NULL'],
      ['tasks', 'closed_by_user_id', 'INT UNSIGNED NULL'],
      ['tasks', 'deleted_by_user_id', 'INT UNSIGNED NULL'],
      ['subtasks', 'subtask_code', 'VARCHAR(191) NULL'],
      ['subtasks', 'source', "VARCHAR(16) NOT NULL DEFAULT 'local'"],
      ['subtasks', 'updated_by_user_id', 'INT UNSIGNED NULL'],
      ['subtasks', 'closed_at', 'DATETIME NULL'],
      ['subtasks', 'closed_by_user_id', 'INT UNSIGNED NULL'],
      ['subtasks', 'deleted_by_user_id', 'INT UNSIGNED NULL'],
      ['record_revisions', 'action', "VARCHAR(32) NOT NULL DEFAULT 'update'"],
      ['record_revisions', 'reason', 'TEXT NULL'],
      ['record_comments', 'deleted_at', 'DATETIME NULL'],
      ['record_files', 'kind', 'VARCHAR(64) NULL'],
      ['record_files', 'deleted_at', 'DATETIME NULL'],
      ['action_logs', 'ip_address', 'VARCHAR(64) NULL'],
      ['action_logs', 'user_agent', 'VARCHAR(255) NULL'],
    ]
    for (const [table, col, def] of extraCols) {
      const [have] = await root.query<mysql.RowDataPacket[]>(
        `SELECT 1 AS ok FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
        [database, table, col],
      )
      if (!have.length) {
        await root.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`)
      }
    }

    const extraIndexes: Array<[string, string, string]> = [
      ['projects', 'idx_projects_source', 'ADD KEY `idx_projects_source` (`source`)'],
      ['projects', 'idx_projects_closed', 'ADD KEY `idx_projects_closed` (`closed_at`)'],
      ['projects', 'idx_projects_company_name', 'ADD KEY `idx_projects_company_name` (`company_name`)'],
      ['projects', 'idx_projects_dates', 'ADD KEY `idx_projects_dates` (`start_date`, `end_date`)'],
      ['projects', 'idx_projects_created_by', 'ADD KEY `idx_projects_created_by` (`created_by_user_id`)'],
      ['tasks', 'idx_tasks_source', 'ADD KEY `idx_tasks_source` (`source`)'],
      ['tasks', 'idx_tasks_closed', 'ADD KEY `idx_tasks_closed` (`closed_at`)'],
      ['tasks', 'idx_tasks_dates', 'ADD KEY `idx_tasks_dates` (`end_date`)'],
      ['tasks', 'idx_tasks_created_by', 'ADD KEY `idx_tasks_created_by` (`created_by_user_id`)'],
      ['subtasks', 'idx_subtasks_code', 'ADD KEY `idx_subtasks_code` (`subtask_code`)'],
      ['subtasks', 'idx_subtasks_source', 'ADD KEY `idx_subtasks_source` (`source`)'],
      ['subtasks', 'idx_subtasks_closed', 'ADD KEY `idx_subtasks_closed` (`closed_at`)'],
      ['subtasks', 'idx_subtasks_dates', 'ADD KEY `idx_subtasks_dates` (`end_date`)'],
      ['record_revisions', 'idx_record_revisions_action', 'ADD KEY `idx_record_revisions_action` (`action`)'],
      ['action_logs', 'idx_action_logs_ip', 'ADD KEY `idx_action_logs_ip` (`ip_address`)'],
      ['action_logs', 'idx_action_logs_date', 'ADD KEY `idx_action_logs_date` (`action_date`)'],
    ]
    for (const [table, name, ddl] of extraIndexes) {
      const [have] = await root.query<mysql.RowDataPacket[]>(
        `SELECT 1 AS ok FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [database, table, name],
      )
      if (!have.length) {
        await root.query(`ALTER TABLE \`${table}\` ${ddl}`).catch(() => undefined)
      }
    }

    await root.query(`UPDATE projects SET project_code = NULL WHERE project_code = ''`)
    await root.query(`UPDATE tasks SET task_code = NULL WHERE task_code = ''`)
    await root.query(`UPDATE subtasks SET subtask_code = NULL WHERE subtask_code = ''`).catch(() => undefined)
    await root.query(`
      UPDATE projects
      SET source = 'legacy'
      WHERE (source IS NULL OR source = '' OR source = 'local') AND kissflow_id IS NOT NULL AND kissflow_id <> ''
    `).catch(() => undefined)
    await root.query(`
      UPDATE tasks
      SET source = 'legacy'
      WHERE (source IS NULL OR source = '' OR source = 'local') AND kissflow_id IS NOT NULL AND kissflow_id <> ''
    `).catch(() => undefined)
    await root.query(`
      UPDATE subtasks
      SET source = 'legacy'
      WHERE (source IS NULL OR source = '' OR source = 'local') AND kissflow_id IS NOT NULL AND kissflow_id <> ''
    `).catch(() => undefined)
    await root.query(`
      UPDATE projects
      SET project_code = kissflow_id
      WHERE (project_code IS NULL OR project_code = '') AND kissflow_id IS NOT NULL AND kissflow_id <> ''
    `)
    await root.query(`
      UPDATE tasks
      SET task_code = CONCAT('TSK-', id)
      WHERE task_code IS NULL OR task_code = ''
    `)
    await root.query(`
      UPDATE subtasks
      SET subtask_code = CONCAT('SUB-', id)
      WHERE subtask_code IS NULL OR subtask_code = ''
    `).catch(() => undefined)

    const closedLike = `(
      LOWER(status) LIKE '%closed%'
      OR LOWER(status) LIKE '%complete%'
      OR LOWER(status) LIKE '%cancel%'
      OR LOWER(status) = 'done'
    )`
    for (const table of ['projects', 'tasks', 'subtasks']) {
      await root.query(`
        UPDATE \`${table}\`
        SET closed_at = COALESCE(updated_at, created_at)
        WHERE closed_at IS NULL AND ${closedLike}
      `).catch(() => undefined)
    }

    const uniqueCodes: Array<[string, string, string]> = [
      ['projects', 'project_code', 'uk_projects_code'],
      ['tasks', 'task_code', 'uk_tasks_code'],
      ['subtasks', 'subtask_code', 'uk_subtasks_code'],
    ]
    for (const [table, col, name] of uniqueCodes) {
      const [have] = await root.query<mysql.RowDataPacket[]>(
        `SELECT 1 AS ok FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [database, table, name],
      )
      if (have.length) continue
      const [dups] = await root.query<mysql.RowDataPacket[]>(
        `SELECT 1 AS ok FROM \`${table}\` WHERE \`${col}\` IS NOT NULL GROUP BY \`${col}\` HAVING COUNT(*) > 1 LIMIT 1`,
      ).catch(() => [[] as mysql.RowDataPacket[]])
      if (dups.length) continue
      await root.query(`ALTER TABLE \`${table}\` ADD UNIQUE KEY \`${name}\` (\`${col}\`)`).catch(() => undefined)
    }

    const [tables] = await root.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME as name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [database],
    )

    return { applied, skipped, table_count: tables.length }
  } finally {
    await root.end()
  }
}
