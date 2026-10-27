import { apiUrl, API_HEADERS } from './publicConfig'
import type { AuthUser } from '../types'
export async function demoLogin(): Promise<{
  user: AuthUser; accessToken: string; refreshToken: string
} | null> {
  try {
    const response = await fetch(apiUrl('/api/auth/demo-login'), {
      headers: API_HEADERS,
      method: 'POST', signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null
    return await response.json()
  } catch { return null }
}
