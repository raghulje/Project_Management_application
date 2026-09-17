/**
 * CLI: fetch latest Kissflow projects / tasks / subtasks and upsert into MySQL.
 * Usage: npm run import:kissflow
 */
import dotenv from 'dotenv'
import { syncKissflowPortfolio } from '../services/kissflowImport.js'

dotenv.config()

syncKissflowPortfolio()
  .then((result) => {
    console.log(`Import source: ${result.source} (${result.origin})`)
    console.log(`  projects: ${result.projects} rows (${result.projects_created} new)`)
    console.log(`  tasks:    ${result.tasks} rows (${result.tasks_created} new)`)
    console.log(`  subtasks: ${result.subtasks} rows (${result.subtasks_created} new)`)
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
