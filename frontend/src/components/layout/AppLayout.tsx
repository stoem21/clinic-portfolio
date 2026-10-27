import { Suspense, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Home,
  Loader2,
  Menu,
  Users,
  Stethoscope,
  UserRound,
  ClipboardList,
  Trash2,
  ScrollText,
  Database,
  Receipt,
  FlaskConical,
  LogOut,
  X,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { LanguageToggle } from '@/components/LanguageToggle'
import type { Role } from '@/types'

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  )
}

interface NavItem {
  to: string
  labelKey: string
  icon: typeof Home
  roles?: Role[] // if set, only these roles see the link
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'items.home', icon: Home },
  { to: '/clients', labelKey: 'items.clients', icon: UserRound },
  { to: '/treatments', labelKey: 'items.treatments', icon: ClipboardList },
  {
    to: '/lab-work',
    labelKey: 'items.labWork',
    icon: FlaskConical,
    roles: ['ADMIN', 'SUPER_ADMIN'],
  },
  {
    to: '/dentists',
    labelKey: 'items.dentists',
    icon: Stethoscope,
    roles: ['ADMIN', 'SUPER_ADMIN'],
  },
  {
    to: '/users',
    labelKey: 'items.users',
    icon: Users,
    roles: ['ADMIN', 'SUPER_ADMIN'],
  },
  {
    to: '/receipts',
    labelKey: 'items.receipts',
    icon: Receipt,
    roles: ['SUPER_ADMIN'],
  },
  {
    to: '/audit',
    labelKey: 'items.audit',
    icon: ScrollText,
    roles: ['SUPER_ADMIN'],
  },
  {
    to: '/backups',
    labelKey: 'items.backups',
    icon: Database,
    roles: ['SUPER_ADMIN'],
  },
  { to: '/hn-counter', labelKey: 'items.hnCounter', icon: ClipboardList, roles: ['SUPER_ADMIN'] },
  {
    to: '/trash',
    labelKey: 'items.trash',
    icon: Trash2,
    roles: ['SUPER_ADMIN'],
  },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const { t } = useTranslation('nav')
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  )

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // Stateless logout — ignore network errors and clear locally anyway.
    }
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="flex h-16 items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <button
            type="button"
            aria-label={t('openMenu')}
            className="-ml-2 rounded-md p-2 text-gray-700 hover:bg-gray-50 lg:hidden"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <span className="shrink-0 text-lg font-semibold text-gray-900">
            {t('appName')}
          </span>

          {/* Below lg, the horizontal strip can't fit every item — replaced
              by the drawer below instead of a scrolling, affordance-less row. */}
          <nav className="hidden flex-1 items-center gap-1 overflow-x-auto lg:flex">
            {visibleItems.map(({ to, labelKey, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            {user && (
              <NavLink
                to="/account"
                className="hidden text-xs text-gray-500 hover:text-gray-900 sm:inline"
              >
                {user.username} · {user.role}
              </NavLink>
            )}
            <LanguageToggle className="hidden lg:flex" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{t('logout')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile/tablet nav drawer — slides in from the left below lg. */}
      <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 lg:hidden" />
          <DialogPrimitive.Content
            className={cn(
              'fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[80vw] flex-col bg-white shadow-xl',
              'transition-transform duration-200 ease-out',
              'data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0',
              'lg:hidden'
            )}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 px-4">
              <DialogPrimitive.Title asChild>
                <span className="text-lg font-semibold text-gray-900">
                  {t('appName')}
                </span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                {t('navMenu')}
              </DialogPrimitive.Description>
              <DialogPrimitive.Close
                aria-label={t('closeMenu')}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-50"
              >
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {visibleItems.map(({ to, labelKey, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'bg-blue-50 font-medium text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {t(labelKey)}
                </NavLink>
              ))}
            </nav>

            <div className="shrink-0 space-y-1 border-t border-gray-200 p-3">
              <LanguageToggle />
              {user && (
                <NavLink
                  to="/account"
                  onClick={() => setMobileNavOpen(false)}
                  className="block truncate rounded-md px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                >
                  {user.username} · {user.role}
                </NavLink>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
