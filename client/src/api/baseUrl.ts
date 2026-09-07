function isLoopbackUrl(url: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)
}

export function getApiBase(): string {
  const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  if (import.meta.env.DEV) return '/api/v1'
  if (typeof window !== 'undefined') {
    const originBase = `${window.location.origin}/api/v1`
    if (envUrl && !isLoopbackUrl(envUrl)) return envUrl
    if (envUrl && isLoopbackUrl(window.location.origin)) return envUrl
    return originBase
  }
  return envUrl || 'http://localhost:3060/api/v1'
}
