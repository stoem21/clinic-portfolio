import { API_BASE, API_HEADERS, redirectToLogin } from './publicConfig'
import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import { idleSession, useAuthStore } from '@/stores/authStore'

// Empty base => same-origin relative requests (e.g. behind a Cloudflare tunnel
// where Vite proxies /api to the backend). Set VITE_API_BASE_URL to point at an
// absolute backend URL instead if you aren't proxying.
// The API base is shared with demo login and the frontdesk app.

export const api = axios.create({
  baseURL: API_BASE,
  headers: API_HEADERS,
  withCredentials: true,
})

// Attach the access token to every outgoing request.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (localStorage.getItem('accessToken') && !idleSession.check()) {
    return Promise.reject(new Error('Session expired'))
  }
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

interface RetriableConfig extends AxiosRequestConfig {
  _retry?: boolean
}

let isRefreshing = false
let pendingQueue: Array<(token: string | null) => void> = []

function flushQueue(token: string | null) {
  pendingQueue.forEach((cb) => cb(token))
  pendingQueue = []
}

async function refreshAccessToken(): Promise<string | null> {
  if (!idleSession.check()) return null
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return null
  try {
    const { data } = await axios.post(`${API_BASE}/api/auth/refresh`, {
      refreshToken,
    }, { headers: API_HEADERS })
    if (!idleSession.check() || localStorage.getItem('refreshToken') !== refreshToken) return null
    const newToken: string = data.accessToken
    useAuthStore.getState().setAccessToken(newToken)
    return newToken
  } catch {
    return null
  }
}

// On 401, attempt a single refresh and replay the original request.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined
    const status = error.response?.status

    if (status !== 401 || !original || original._retry) {
      return Promise.reject(error)
    }

    // Don't try to refresh the refresh call itself.
    if (original.url?.includes('/api/auth/refresh')) {
      return Promise.reject(error)
    }

    original._retry = true

    if (isRefreshing) {
      // Queue until the in-flight refresh resolves.
      return new Promise((resolve, reject) => {
        pendingQueue.push((token) => {
          if (!token) {
            reject(error)
            return
          }
          original.headers = original.headers ?? {}
          ;(original.headers as Record<string, string>).Authorization =
            `Bearer ${token}`
          resolve(api(original))
        })
      })
    }

    isRefreshing = true
    const newToken = await refreshAccessToken()
    isRefreshing = false
    flushQueue(newToken)

    if (!newToken) {
      useAuthStore.getState().clearAuth()
      if (window.location.pathname !== '/login') {
        redirectToLogin()
      }
      return Promise.reject(error)
    }

    original.headers = original.headers ?? {}
    ;(original.headers as Record<string, string>).Authorization =
      `Bearer ${newToken}`
    return api(original)
  }
)
