import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AxiosError } from 'axios'
import { KeyRound, Loader2, Power, PowerOff, ShieldOff, Trash2, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import type { ManagedUser, Role } from '@/types'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { StatusBadge } from '@/components/StatusBadge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { ErrorCard } from '@/components/ErrorCard'
import { TableSkeleton } from '@/components/TableSkeleton'
import { getApiErrorMessage } from '@/lib/apiError'

const ROLE_BADGE: Record<Role, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-700',
  ADMIN: 'bg-blue-100 text-blue-700',
  USER: 'bg-gray-100 text-gray-600',
}

function RoleBadge({ role }: { role: Role }) {
  const { t } = useTranslation('users')
  const roleLabel: Record<Role, string> = {
    SUPER_ADMIN: t('roleSuperAdmin'),
    ADMIN: t('roleAdmin'),
    USER: t('roleUser'),
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium',
        ROLE_BADGE[role]
      )}
    >
      {roleLabel[role]}
    </span>
  )
}

const createSchema = z.object({
  username: z.string().trim().min(1, 'users:usernameRequired'),
  role: z.enum(['ADMIN', 'USER']),
})
type CreateValues = z.infer<typeof createSchema>

type ConfirmKind = 'reset' | 'delete'

export default function UsersPage() {
  const { t } = useTranslation('users')
  const currentUser = useAuthStore((s) => s.user)
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'
  const { toast } = useToast()

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirm, setConfirm] = useState<{
    kind: ConfirmKind
    user: ManagedUser
  } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [resetTotpUserId, setResetTotpUserId] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const { data } = await api.get<ManagedUser[]>('/api/users')
      setUsers(data)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { username: '', role: 'USER' },
  })

  const openCreate = () => {
    reset({ username: '', role: 'USER' })
    setConfirmClose(false)
    setCreateOpen(true)
  }

  // Unsaved-changes guard for the create modal.
  const attemptCloseCreate = () => {
    if (isDirty) setConfirmClose(true)
    else setCreateOpen(false)
  }

  const onCreate = async (values: CreateValues) => {
    try {
      // Admins can only create USER accounts; force it regardless of input.
      const role: 'ADMIN' | 'USER' = isSuperAdmin ? values.role : 'USER'
      await api.post('/api/users', { username: values.username, role })
      setCreateOpen(false)
      toast({ title: t('createdSuccess') })
      fetchUsers()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if (status === 409) {
        setError('username', { message: t('usernameExists') })
      } else {
        toast({ variant: 'destructive', title: getApiErrorMessage(err) })
      }
    }
  }

  const resetTotp = async (userId: string) => {
    setResetTotpUserId(null)
    try {
      await api.delete('/api/auth/totp/disable', { data: { userId } })
      toast({ title: t('totpResetSuccess') })
      fetchUsers()
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    }
  }

  const toggleActive = async (user: ManagedUser) => {
    const action = user.isActive ? 'deactivate' : 'activate'
    try {
      await api.patch(`/api/users/${user.id}/${action}`)
      toast({ title: t('savedSuccess') })
      fetchUsers()
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    }
  }

  const runConfirm = async () => {
    if (!confirm) return
    setActionLoading(true)
    try {
      if (confirm.kind === 'reset') {
        await api.patch(`/api/users/${confirm.user.id}/reset-password`)
        toast({ title: t('resetPasswordSuccess') })
      } else {
        await api.delete(`/api/users/${confirm.user.id}`)
        toast({ title: t('deletedSuccess') })
      }
      setConfirm(null)
      fetchUsers()
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
        <Button onClick={openCreate}>
          <UserPlus className="h-4 w-4" />
          {t('addUser')}
        </Button>
      </div>

      {loadError ? (
        <ErrorCard onRetry={fetchUsers} />
      ) : (
      <div className="rounded-md border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('username')}</TableHead>
              <TableHead>{t('role')}</TableHead>
              <TableHead>{t('common:status')}</TableHead>
              <TableHead className="text-right">{t('common:actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="p-0">
                  <TableSkeleton cols={4} />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="p-0">
                  <EmptyState message={t('noData')} />
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const isSelf = user.id === currentUser?.id
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium text-gray-900">
                      {user.username}
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={user.isActive} />
                    </TableCell>
                    <TableCell>
                      <TooltipProvider delayDuration={200}>
                        <div className="flex items-center justify-end gap-1">
                          {isSuperAdmin && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={isSelf}
                                  onClick={() => toggleActive(user)}
                                >
                                  {user.isActive ? (
                                    <PowerOff className="h-4 w-4 text-amber-600" />
                                  ) : (
                                    <Power className="h-4 w-4 text-green-600" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {user.isActive ? t('deactivate') : t('activate')}
                              </TooltipContent>
                            </Tooltip>
                          )}

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setConfirm({ kind: 'reset', user })}
                              >
                                <KeyRound className="h-4 w-4 text-gray-600" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('resetPassword')}</TooltipContent>
                          </Tooltip>

                          {isSuperAdmin && user.totpEnabled && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setResetTotpUserId(user.id)}
                                >
                                  <ShieldOff className="h-4 w-4 text-amber-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('resetTotp')}</TooltipContent>
                            </Tooltip>
                          )}

                          {isSuperAdmin && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={isSelf}
                                  onClick={() => setConfirm({ kind: 'delete', user })}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('deleteUser')}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      )}

      {/* Create user modal */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => (o ? setCreateOpen(true) : attemptCloseCreate())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('addUser')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t('username')}</Label>
              <Input id="username" {...register('username')} />
              {errors.username && (
                <p className="text-sm text-destructive">{t(errors.username.message as string)}</p>
              )}
            </div>

            {isSuperAdmin && (
              <div className="space-y-2">
                <Label htmlFor="role">{t('role')}</Label>
                <Select
                  defaultValue="USER"
                  onValueChange={(v) =>
                    setValue('role', v as 'ADMIN' | 'USER')
                  }
                >
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">{t('roleUserOption')}</SelectItem>
                    <SelectItem value="ADMIN">{t('roleAdminOption')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <p className="text-xs text-gray-500">
              {t('newUserNotice')}
            </p>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={attemptCloseCreate}>
                {t('common:cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('createUser')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={t('unsavedChangesTitle')}
        description={t('unsavedChangesDescription')}
        confirmLabel={t('close')}
        destructive
        onConfirm={() => {
          setConfirmClose(false)
          setCreateOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === 'reset' ? t('resetPassword') : t('deleteUser')
        }
        description={
          confirm?.kind === 'reset'
            ? t('resetPasswordConfirm', { username: confirm.user.username })
            : confirm
              ? t('deleteUserConfirm', { username: confirm.user.username })
              : undefined
        }
        confirmLabel={confirm?.kind === 'delete' ? t('common:delete') : t('reset')}
        destructive={confirm?.kind === 'delete'}
        isLoading={actionLoading}
        onConfirm={runConfirm}
      />

      <ConfirmDialog
        open={!!resetTotpUserId}
        onOpenChange={(open) => !open && setResetTotpUserId(null)}
        title={t('resetTotp')}
        description={t('resetTotpConfirmDescription')}
        confirmLabel={t('reset')}
        destructive
        onConfirm={() => resetTotpUserId && resetTotp(resetTotpUserId)}
      />
    </div>
  )
}
