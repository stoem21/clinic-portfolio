import { redirectToLogin } from '@/lib/publicConfig'
import { create } from 'zustand'
import { createIdleSession } from '@/lib/idleSession'
import type { AuthUser } from '@/types'

const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'
const USER_KEY = 'authUser'

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void
  setAccessToken: (accessToken: string) => void
  setTokens: (accessToken: string, refreshToken: string) => void
  setMustChangePassword: (value: boolean) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: loadUser(),
  accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),

  setAuth: (user, accessToken, refreshToken) => {
    idleSession.start()
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ user, accessToken })
  },

  setAccessToken: (accessToken) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
    set({ accessToken })
  },

  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    set({ accessToken })
  },

  setMustChangePassword: (value) => {
    const user = get().user
    if (!user) return
    const updated = { ...user, mustChangePassword: value }
    localStorage.setItem(USER_KEY, JSON.stringify(updated))
    set({ user: updated })
  },

  clearAuth: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem('authLastActivity')
    set({ user: null, accessToken: null })
  },
}))

export const idleSession = createIdleSession(localStorage, 'authLastActivity',
  () => !!localStorage.getItem(ACCESS_TOKEN_KEY),
  () => {
    useAuthStore.getState().clearAuth()
    redirectToLogin()
  },
)
