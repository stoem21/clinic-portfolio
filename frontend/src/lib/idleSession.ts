// Persist activity so reloading or waking a sleeping tab cannot extend an idle session.
export const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000
export function createIdleSession(storage: Storage, key: string, hasSession: () => boolean, expire: () => void) {
  const start = () => storage.setItem(key, String(Date.now()))
  const check = () => {
    if (!hasSession()) return false
    const raw = storage.getItem(key)
    // Existing sessions get a timestamp when this feature is first installed.
    if (raw === null) { start(); return true }
    const last = Number(raw)
    if (!Number.isFinite(last) || last > Date.now() || Date.now() - last >= IDLE_TIMEOUT_MS) {
      expire()
      storage.removeItem(key)
      return false
    }
    return true
  }
  const activity = () => {
    if (!check()) return
    // Avoid synchronous storage writes on every pointer movement.
    if (Date.now() - Number(storage.getItem(key)) >= 1000) start()
  }
  const install = () => {
    check()
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart']
    events.forEach((event) => window.addEventListener(event, activity, { passive: true, capture: true }))
    window.addEventListener('focus', check)
    window.addEventListener('storage', check)
    document.addEventListener('visibilitychange', check)
    const timer = window.setInterval(check, 15000)
    return () => {
      window.clearInterval(timer)
      events.forEach((event) => window.removeEventListener(event, activity, true))
      window.removeEventListener('focus', check)
      window.removeEventListener('storage', check)
      document.removeEventListener('visibilitychange', check)
    }
  }
  return { start, check, activity, install }
}
