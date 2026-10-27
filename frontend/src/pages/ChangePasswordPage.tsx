import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useToast } from '@/hooks/use-toast'

export default function ChangePasswordPage() {
  const { t } = useTranslation('changePassword')
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setMustChangePassword = useAuthStore((s) => s.setMustChangePassword)
  const setTokens = useAuthStore((s) => s.setTokens)
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)

  const mustChange = user?.mustChangePassword ?? false

  // Build the schema based on whether the current password is required.
  const schema = z
    .object({
      currentPassword: z.string().optional(),
      newPassword: z.string().min(8, 'changePassword:newPasswordMinLength'),
      confirmPassword: z.string().min(1, 'changePassword:confirmPasswordRequired'),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: 'changePassword:passwordMismatch',
      path: ['confirmPassword'],
    })
    .refine((data) => mustChange || !!data.currentPassword, {
      message: 'changePassword:currentPasswordRequired',
      path: ['currentPassword'],
    })

  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true)
    try {
      const { data } = await api.post('/api/auth/change-password', {
        currentPassword: mustChange ? undefined : values.currentPassword,
        newPassword: values.newPassword,
      })
      // The server bumps tokenVersion (revoking old refresh tokens) and returns
      // fresh tokens so this session stays valid.
      if (data?.accessToken && data?.refreshToken) {
        setTokens(data.accessToken, data.refreshToken)
      }
      setMustChangePassword(false)
      toast({ title: t('changedSuccess') })
      navigate('/', { replace: true })
    } catch {
      toast({
        variant: 'destructive',
        title: t('changeFailedTitle'),
        description: t('changeFailedDescription'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-md border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-2 flex justify-end">
          <LanguageToggle />
        </div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {mustChange
              ? t('firstLoginSubtitle')
              : t('normalSubtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {!mustChange && (
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t('currentPassword')}</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                {...register('currentPassword')}
              />
              {errors.currentPassword && (
                <p className="text-sm text-destructive">
                  {t(errors.currentPassword.message as string)}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="newPassword">{t('newPassword')}</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register('newPassword')}
            />
            {errors.newPassword && (
              <p className="text-sm text-destructive">{t(errors.newPassword.message as string)}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">
                {t(errors.confirmPassword.message as string)}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('submit')}
          </Button>
        </form>
      </div>
    </div>
  )
}
