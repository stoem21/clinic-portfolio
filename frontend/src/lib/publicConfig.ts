export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')
export const API_HEADERS: Record<string, string> = API_BASE.includes('.ngrok')
  ? { 'ngrok-skip-browser-warning': '1' } : {}
export const apiUrl = (path: string) => `${API_BASE}${path}`
export const appLink = (path = '/') => import.meta.env.VITE_PAGES === 'true'
  ? `${import.meta.env.BASE_URL.replace(/frontdesk\/$/, "")}#${path}` : path
export function redirectToLogin() { window.location.replace(appLink('/login')) }
