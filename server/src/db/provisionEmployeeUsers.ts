import { provisionActiveEmployeeUsers } from '../services/provisionEmployeeUsers.js'

const summary = await provisionActiveEmployeeUsers()
console.log('Provisioned active employees as users (no emails sent)')
console.log(summary)
process.exit(0)
