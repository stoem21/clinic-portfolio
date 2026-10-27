import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AxiosError } from 'axios'
import { Loader2, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import type { Dentist } from '@/types'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
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

const dentistSchema = z.object({
  name: z.string().min(1, 'dentists:nameRequired'),
  licenseId: z.string().min(1, 'dentists:licenseIdRequired'),
  phoneNumber: z.string().optional(),
  email: z
    .string()
    .email('dentists:invalidEmail')
    .optional()
    .or(z.literal('')),
  lineId: z.string().optional(),
  isOrthoDent: z.boolean(),
  note: z.string().optional(),
})
type DentistValues = z.infer<typeof dentistSchema>

const EMPTY: DentistValues = {
  name: '',
  licenseId: '',
  phoneNumber: '',
  email: '',
  lineId: '',
  isOrthoDent: false,
  note: '',
}

export default function DentistsPage() {
  const { t } = useTranslation('dentists')
  const { toast } = useToast()

  const [dentists, setDentists] = useState<Dentist[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [orthoOnly, setOrthoOnly] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [editing, setEditing] = useState<Dentist | null>(null)
  const [toDelete, setToDelete] = useState<Dentist | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const fetchDentists = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const { data } = await api.get<Dentist[]>('/api/dentists')
      setDentists(data)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDentists()
  }, [fetchDentists])

  const visible = useMemo(
    () => (orthoOnly ? dentists.filter((d) => d.isOrthoDent) : dentists),
    [dentists, orthoOnly]
  )

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<DentistValues>({
    resolver: zodResolver(dentistSchema),
    defaultValues: EMPTY,
  })

  const isOrtho = watch('isOrthoDent')

  // Unsaved-changes guard for the create/edit modal.
  const attemptClose = () => {
    if (isDirty) setConfirmClose(true)
    else setFormOpen(false)
  }

  const openCreate = () => {
    setEditing(null)
    reset(EMPTY)
    setConfirmClose(false)
    setFormOpen(true)
  }

  const openEdit = (d: Dentist) => {
    setEditing(d)
    reset({
      name: d.name,
      licenseId: d.licenseId,
      phoneNumber: d.phoneNumber ?? '',
      email: d.email ?? '',
      lineId: d.lineId ?? '',
      isOrthoDent: d.isOrthoDent,
      note: d.note ?? '',
    })
    setConfirmClose(false)
    setFormOpen(true)
  }

  const onSubmit = async (values: DentistValues) => {
    const payload = {
      name: values.name,
      licenseId: values.licenseId,
      phoneNumber: values.phoneNumber || null,
      email: values.email || null,
      lineId: values.lineId || null,
      note: values.note || null,
      isOrthoDent: values.isOrthoDent,
    }
    try {
      if (editing) {
        await api.put(`/api/dentists/${editing.id}`, payload)
        toast({ title: t('savedSuccess') })
      } else {
        await api.post('/api/dentists', payload)
        toast({ title: t('createdSuccess') })
      }
      setFormOpen(false)
      fetchDentists()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if (status === 409) {
        setError('licenseId', { message: t('licenseIdExists') })
      } else {
        toast({ variant: 'destructive', title: getApiErrorMessage(err) })
      }
    }
  }

  const toggleActive = async (d: Dentist) => {
    try {
      await api.patch(`/api/dentists/${d.id}/toggle-active`)
      toast({ title: t('savedSuccess') })
      fetchDentists()
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    }
  }

  const runDelete = async () => {
    if (!toDelete) return
    setDeleteLoading(true)
    try {
      await api.delete(`/api/dentists/${toDelete.id}`)
      toast({ title: t('deletedSuccess') })
      setToDelete(null)
      fetchDentists()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if (status === 409) {
        toast({
          variant: 'destructive',
          title: t('cannotDeleteTitle'),
          description: t('cannotDeleteDescription'),
        })
      } else {
        toast({ variant: 'destructive', title: getApiErrorMessage(err) })
      }
      setToDelete(null)
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('addDentist')}
        </Button>
      </div>

      <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 text-sm text-gray-700">
        <Checkbox
          checked={orthoOnly}
          onCheckedChange={(v) => setOrthoOnly(v === true)}
        />
        {t('orthoOnly')}
      </label>

      {loadError ? (
        <ErrorCard onRetry={fetchDentists} />
      ) : (
      <div className="rounded-md border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('name')}</TableHead>
              <TableHead>{t('licenseId')}</TableHead>
              <TableHead>{t('phone')}</TableHead>
              <TableHead>{t('email')}</TableHead>
              <TableHead>{t('ortho')}</TableHead>
              <TableHead>{t('common:status')}</TableHead>
              <TableHead className="text-right">{t('common:actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <TableSkeleton cols={7} />
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState message={t('noData')} />
                </TableCell>
              </TableRow>
            ) : (
              visible.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium text-gray-900">{d.name}</TableCell>
                  <TableCell>{d.licenseId}</TableCell>
                  <TableCell>{d.phoneNumber || '—'}</TableCell>
                  <TableCell>{d.email || '—'}</TableCell>
                  <TableCell>
                    {d.isOrthoDent ? (
                      <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                        {t('ortho')}
                      </Badge>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge active={d.isActive} />
                  </TableCell>
                  <TableCell>
                    <TooltipProvider delayDuration={200}>
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                              <Pencil className="h-4 w-4 text-gray-600" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('common:edit')}</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleActive(d)}
                            >
                              {d.isActive ? (
                                <PowerOff className="h-4 w-4 text-amber-600" />
                              ) : (
                                <Power className="h-4 w-4 text-green-600" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {d.isActive ? t('deactivate') : t('activate')}
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setToDelete(d)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('common:delete')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      )}

      {/* Create / Edit modal */}
      <Dialog
        open={formOpen}
        onOpenChange={(o) => (o ? setFormOpen(true) : attemptClose())}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('editTitle') : t('addDentist')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">{t('fullName')}</Label>
                <Input id="name" {...register('name')} />
                {errors.name && (
                  <p className="text-sm text-destructive">{t(errors.name.message as string)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="licenseId">{t('licenseIdLabel')}</Label>
                <Input id="licenseId" {...register('licenseId')} />
                {errors.licenseId && (
                  <p className="text-sm text-destructive">
                    {t(errors.licenseId.message as string)}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">{t('phone')}</Label>
                <Input id="phoneNumber" {...register('phoneNumber')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('email')}</Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email && (
                  <p className="text-sm text-destructive">{t(errors.email.message as string)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lineId">{t('lineId')}</Label>
                <Input id="lineId" {...register('lineId')} />
              </div>
              <div className="flex items-center gap-3 sm:pt-7">
                <Switch
                  id="isOrthoDent"
                  checked={isOrtho}
                  onCheckedChange={(v) => setValue('isOrthoDent', v)}
                />
                <Label htmlFor="isOrthoDent">{t('orthoDentistLabel')}</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">{t('note')}</Label>
              <Textarea id="note" {...register('note')} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={attemptClose}>
                {t('common:cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? t('save') : t('addDentist')}
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
          setFormOpen(false)
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('deleteTitle')}
        description={
          toDelete
            ? t('deleteConfirm', { name: toDelete.name })
            : undefined
        }
        confirmLabel={t('common:delete')}
        destructive
        isLoading={deleteLoading}
        onConfirm={runDelete}
      />
    </div>
  )
}
