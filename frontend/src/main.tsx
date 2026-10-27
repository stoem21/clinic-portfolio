import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { redirectToLogin } from '@/lib/publicConfig'
import './index.css'
import './i18n'
import App from './App.tsx'
import { idleSession, useAuthStore } from '@/stores/authStore'

const Router = import.meta.env.VITE_PAGES === 'true' ? HashRouter : BrowserRouter
idleSession.install()
window.addEventListener('storage', (event) => {
  if (event.key === 'accessToken' && !event.newValue && useAuthStore.getState().user) {
    useAuthStore.getState().clearAuth()
    redirectToLogin()
  }
})
import { Toaster } from '@/components/ui/toaster'

import { demoLogin } from './lib/demoLogin'

async function start() {
  const session = await demoLogin()
  if (session) useAuthStore.getState().setAuth(session.user, session.accessToken, session.refreshToken)
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
      <Toaster />
    </Router>
  </StrictMode>,
)

}
void start()
