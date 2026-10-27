import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import type { AuthUser } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useToast } from '@/hooks/use-toast'

const loginSchema = z.object({
  username: z.string().trim().min(1, 'login:usernameRequired'),
  password: z.string().min(1, 'login:passwordRequired'),
})

type LoginValues = z.infer<typeof loginSchema>

interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
  totpRequired?: boolean
  pendingToken?: string
}

export default function LoginPage() {
  const { t } = useTranslation('login')
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)

  // TOTP second step
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [totpSubmitting, setTotpSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  })

  const finishLogin = (data: LoginResponse) => {
    setAuth(data.user, data.accessToken, data.refreshToken)
    if (data.user.mustChangePassword) {
      navigate('/change-password', { replace: true })
    } else {
      navigate('/', { replace: true })
    }
  }

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true)
    try {
      const { data } = await api.post<LoginResponse>('/api/auth/login', values)
      if (data.totpRequired && data.pendingToken) {
        setPendingToken(data.pendingToken)
        setTotpCode('')
      } else {
        finishLogin(data)
      }
    } catch {
      toast({
        variant: 'destructive',
        title: t('signInFailedTitle'),
        description: t('signInFailedDescription'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const onTotpSubmit = async () => {
    if (!pendingToken || !totpCode) return
    setTotpSubmitting(true)
    try {
      const { data } = await api.post<LoginResponse>('/api/auth/totp/verify-login', {
        pendingToken,
        code: totpCode,
      })
      finishLogin(data)
    } catch {
      toast({
        variant: 'destructive',
        title: t('totpFailedTitle'),
        description: t('totpFailedDescription'),
      })
      setTotpCode('')
    } finally {
      setTotpSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-md border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-2 flex justify-end">
          <LanguageToggle />
        </div>
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900">
            {t('appTitle')}
          </h1>
          <p className="mt-1 text-sm text-gray-600">{t('subtitle')}</p>
        </div>

        {/* Step 1 — credentials */}
        {!pendingToken && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t('username')}</Label>
              <Input id="username" autoComplete="username" {...register('username')} />
              {errors.username && (
                <p className="text-sm text-destructive">{t(errors.username.message as string)}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{t(errors.password.message as string)}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('signIn')}
            </Button>
          </form>
        )}

        {/* Step 2 — TOTP */}
        {pendingToken && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {t('totpInstruction')}
            </div>

            <div className="space-y-2">
              <Label htmlFor="totpCode">{t('verificationCode')}</Label>
              <Input
                id="totpCode"
                type="text"
                inputMode="numeric"
                maxLength={8}
                placeholder="000000"
                className="text-center font-mono text-lg tracking-widest"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && onTotpSubmit()}
                autoFocus
              />
              <p className="text-xs text-gray-400">
                {t('noPhoneHint')}
              </p>
            </div>

            <Button
              className="w-full"
              onClick={onTotpSubmit}
              disabled={!totpCode || totpSubmitting}
            >
              {totpSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common:confirm')}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600"
              onClick={() => { setPendingToken(null); setTotpCode('') }}
            >
              ← {t('backToSignIn')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
