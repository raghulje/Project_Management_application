export type EmployeeProfile = {
  name: string
  email: string
  company: string
  entity: string
  department: string
  location: string
  designation: string
  business_line: string
}

type AuthLike = {
  name?: string
  first_name?: string
  last_name?: string
  email?: string
  company?: { name?: string | null } | null
  department?: { name?: string | null } | null
  location?: { name?: string | null } | null
  employee?: Partial<EmployeeProfile> | null
}

function str(v: unknown) {
  return String(v || '').trim()
}

function norm(v: string) {
  return v.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function displayName(user: AuthLike | null | undefined) {
  if (!user) return ''
  return str(user.name) || [user.first_name, user.last_name].filter(Boolean).join(' ')
}

/** Pick the closest dropdown option, including values like "Company Refex Green Mobility Limited". */
export function matchChoice(value: string, options: string[]) {
  const raw = str(value)
  if (!raw) return ''
  const n = norm(raw)
  const exact = options.find((o) => norm(o) === n)
  if (exact) return exact
  if (n.length < 4) return raw
  const starts = options.find((o) => {
    const on = norm(o)
    return on.startsWith(n) || n.startsWith(on)
  })
  if (starts) return starts
  const contains = options.find((o) => {
    const on = norm(o)
    return on.includes(n) || n.includes(on)
  })
  return contains || raw
}

export function matchOption(value: string, options: string[]) {
  const matched = matchChoice(value, options)
  return options.some((o) => o === matched) ? matched : ''
}

export function displayEntity(profile: EmployeeProfile) {
  const entity = str(profile.entity)
  const company = str(profile.company)
  if (entity && (entity.includes(' ') || entity.length >= 8)) return entity
  return company || entity
}

export function profileFromUser(user: AuthLike | null | undefined): EmployeeProfile | null {
  if (!user) return null
  const e = user.employee
  const name = str(e?.name) || displayName(user)
  const company = str(e?.company) || str(user.company?.name)
  const entity = str(e?.entity)
  const department = str(e?.department) || str(user.department?.name)
  const location = str(e?.location) || str(user.location?.name)
  if (!name && !company && !entity) return null
  return {
    name,
    email: str(e?.email) || str(user.email),
    company,
    entity,
    department,
    location,
    designation: str(e?.designation),
    business_line: str(e?.business_line),
  }
}

export function withChoice(options: string[], value: string) {
  const v = str(value)
  if (!v) return options
  if (options.some((o) => norm(o) === norm(v))) return options
  return [v, ...options]
}
