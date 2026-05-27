const DEFAULT_API_BASE_URL = 'https://innogarage-ai-production.up.railway.app'

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export const API_BASE_URL = trimTrailingSlash(import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_BASE_URL)
export const WS_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_WS_URL?.trim() || API_BASE_URL.replace(/^http/i, (prefix) => prefix.toLowerCase() === 'https' ? 'wss' : 'ws')
)