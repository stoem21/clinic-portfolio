import { useCallback, useEffect, useState } from 'react'
import { Loader2, Lock, LockOpen, ShieldCheck, ShieldOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { getApiErrorMessage } from '@/lib/apiError'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TotpSetupDialog } from '@/components/totp/TotpSetupDialog'

interface TotpStatus {
  featureEnabled: boolean
  enrolled: boolean
  backupCodesRemaining: number
}

export default function AccountPage() {
  const { t } = useTranslation('account')
  const { toast } = useToast()
  const user = useAuthStore((s) => s.user)

  const [status, setStatus] = useState<TotpStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)

  const [setupOpen, setSetupOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disabling, setDisabling] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const { data } = await api.get<TotpStatus>('/api/auth/totp/status')
      setStatus(data)
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setLoadingStatus(false)
    }
  }, [toast])

  useEffect(() => { loadStatus() }, [loadStatus])

  const handleDisable = async () => {
    if (!disablePassword) return
    setDisabling(true)
    try {
      await api.delete('/api/auth/totp/disable', { data: { currentPassword: disablePassword } })
      toast({ title: t('page.disabledSuccessToast') })
      setDisableOpen(false)
      setDisablePassword('')
      loadStatus()
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setDisabling(false)
    }
  }

  const roleLabel: Record<string, string> = {
    SUPER_ADMIN: t('page.roleSuperAdmin'),
    ADMIN: t('page.roleAdmin'),
    USER: t('page.roleUser'),
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">{t('page.title')}</h1>

      {/* User info */}
      <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-gray-900">{t('page.accountInfo')}</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">{t('page.username')}</dt>
            <dd className="font-medium text-gray-900">{user?.username}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{t('page.role')}</dt>
            <dd className="font-medium text-gray-900">{user?.role ? roleLabel[user.role] : ''}</dd>
          </div>
        </dl>
      </div>

      {/* 2FA section */}
      <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-900">
          {t('page.twoFactorTitle')}
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          {t('page.twoFactorDescription')}
        </p>

        {loadingStatus ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('common:loading')}
          </div>
        ) : !status?.featureEnabled ? (
          <div className="flex items-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-500">
            <LockOpen className="h-4 w-4" />
            {t('page.featureDisabled')}
          </div>
        ) : status.enrolled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              <ShieldCheck className="h-4 w-4" />
              <span className="font-medium">{t('page.enabled')}</span>
              <span className="ml-auto text-xs text-green-600">
                {t('page.backupCodesRemaining', { count: status.backupCodesRemaining })}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>
                {t('page.reconfigure')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => { setDisablePassword(''); setDisableOpen(true) }}
              >
                <ShieldOff className="h-4 w-4" />
                {t('page.disable')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <Lock className="h-4 w-4" />
              {t('page.notEnabledYet')}
            </div>
            <Button size="sm" onClick={() => setSetupOpen(true)}>
              {t('page.setUp')}
            </Button>
          </div>
        )}
      </div>

      <TotpSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        onSuccess={() => { toast({ title: t('page.enabledSuccessToast') }); loadStatus() }}
      />

      {/* Disable 2FA dialog */}
      <Dialog open={disableOpen} onOpenChange={(o) => { if (!o) setDisableOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('page.disableDialogTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {t('page.disableDialogDescription')}
          </p>
          <div className="space-y-2">
            <Label>{t('page.passwordLabel')}</Label>
            <Input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDisable()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>{t('common:cancel')}</Button>
            <Button
              variant="destructive"
              disabled={!disablePassword || disabling}
              onClick={handleDisable}
            >
              {disabling && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('page.disable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
