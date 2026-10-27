import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banknote, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { LabPaymentStatus } from '@/components/LabPaymentStatus'
import { LabCompanySelect } from '@/components/LabCompanySelect'
import { useToast } from '@/hooks/useToast'
import { useAuthStore } from '@/stores/authStore'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatBaht, formatThaiDate } from '@/lib/format'
import { labWorkTypeOptions, labelOf } from '@/lib/treatmentOptions'
import type { Dentist, LabWork, LabWorkListResponse } from '@/types'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/EmptyState'
import { ErrorCard } from '@/components/ErrorCard'
import { TableSkeleton } from '@/components/TableSkeleton'
import { Pagination } from '@/components/Pagination'
import { ConfirmDialog } from '@/components/ConfirmDialog'

const PAGE_SIZE = 20
const COL_COUNT = 8
const NONE_VALUE = '__none__'
const ALL_VALUE = '__all__'

const STATUS_OPTIONS = [
  { value: 'all', labelKey: 'status.all' },
  { value: 'missingCost', labelKey: 'status.missingCost' },
  { value: 'missingDelivery', labelKey: 'status.missingDelivery' },
  { value: 'fullyPaid', labelKey: 'status.fullyPaid' },
]

// A small reversible paid/unpaid toggle — click to flip, disabled while the
// underlying data isn't ready to attribute this half to anyone yet.
function PaidToggle({
  paid,
  disabled,
  saving,
  onClick,
}: {
  paid: boolean
  disabled: boolean
  saving: boolean
  onClick: () => void
}) {
  const { t } = useTranslation('labWork')
  return (
    <Button
      type="button"
      variant={paid ? 'default' : 'outline'}
      size="sm"
      disabled={disabled || saving}
      onClick={onClick}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : paid ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <Circle className="h-3.5 w-3.5" />
      )}
      {paid ? t('paid') : t('unpaid')}
    </Button>
  )
}

// Lab work sent out per treatment visit — staff fill in cost + the delivered
// dentist here as they become known, and mark each half (placement/delivered)
// paid independently. See TreatmentFormDialog.tsx for where entries get
// created (create-mode only).
export default function LabWorkPage() {
  const { t } = useTranslation('labWork')
  const { toast } = useToast()
  const role = useAuthStore((s) => s.user?.role)
  const isSuperAdmin = role === 'SUPER_ADMIN'

  const [labWorks, setLabWorks] = useState<LabWork[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [dentists, setDentists] = useState<Dentist[]>([])
  const [dentistFilter, setDentistFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  // Per-row transient state: the cost input's draft text (blur-to-save) and
  // which row currently has a PATCH in flight (disables its controls).
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const params: Record<string, string | number> = { page, limit: PAGE_SIZE }
      if (dentistFilter) params.dentistId = dentistFilter
      if (typeFilter) params.type = typeFilter
      if (statusFilter !== 'all') params.status = statusFilter
      if (from) params.from = from
      if (to) params.to = to

      const { data } = await api.get<LabWorkListResponse>('/api/lab-work', { params })
      setLabWorks(data.data)
      setTotal(data.total)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [page, dentistFilter, typeFilter, statusFilter, from, to])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api
      .get<Dentist[]>('/api/dentists')
      .then((res) => setDentists(res.data))
      .catch(() => setDentists([]))
  }, [])

  const activeDentists = useMemo(() => dentists.filter((d) => d.isActive), [dentists])

  const clearFilters = () => {
    setDentistFilter('')
    setTypeFilter('')
    setStatusFilter('all')
    setFrom('')
    setTo('')
    setPage(1)
  }

  const rangeText = (() => {
    if (total === 0) return t('showingZero')
    const start = (page - 1) * PAGE_SIZE + 1
    const end = Math.min(page * PAGE_SIZE, total)
    return t('showingRange', { start, end, total })
  })()

  const replaceRow = (updated: LabWork) =>
    setLabWorks((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))

  const clearDraft = (id: string) =>
    setCostDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

  const costValue = (lw: LabWork) => costDrafts[lw.id] ?? (lw.cost !== null ? String(lw.cost) : '')

  const onCostBlur = async (lw: LabWork) => {
    const draft = costDrafts[lw.id]
    if (draft === undefined) return
    const n = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(n) || n < 0) {
      clearDraft(lw.id) // invalid/empty — revert to the last known cost
      return
    }
    if (lw.cost !== null && Math.round(n * 100) === Math.round(lw.cost * 100)) {
      clearDraft(lw.id) // unchanged — no request needed
      return
    }
    setSavingId(lw.id)
    try {
      const { data } = await api.patch<LabWork>(`/api/lab-work/${lw.id}`, { cost: n })
      replaceRow(data)
      clearDraft(lw.id)
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setSavingId(null)
    }
  }

  const deliveredOptionsFor = (lw: LabWork) => {
    const list = activeDentists.map((d) => ({ id: d.id, name: d.name }))
    if (lw.deliveredDentist && !list.some((d) => d.id === lw.deliveredDentist!.id)) {
      list.push({ id: lw.deliveredDentist.id, name: `${lw.deliveredDentist.name} ${t('treatments:form.inactiveSuffix')}` })
    }
    return list
  }

  const onDeliveredChange = async (lw: LabWork, value: string) => {
    const deliveredDentistId = value === NONE_VALUE ? null : value
    if (deliveredDentistId === lw.deliveredDentistId) return
    setSavingId(lw.id)
    try {
      const { data } = await api.patch<LabWork>(`/api/lab-work/${lw.id}`, { deliveredDentistId })
      replaceRow(data)
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setSavingId(null)
    }
  }

  const [reversal, setReversal] = useState<{ lw: LabWork; which: 'placement' | 'delivered' } | null>(null)
  const togglePaid = async (lw: LabWork, which: 'placement' | 'delivered', confirmed = false) => {
    const reversing = which === 'placement' ? lw.placementPaid : lw.deliveredPaid
    if (reversing && !confirmed) { setReversal({ lw, which }); return }
    setSavingId(lw.id)
    try {
      const { data } = await api.patch<LabWork>(`/api/lab-work/${lw.id}/${which}-paid`, { confirmReversal: reversing })
      replaceRow(data)
      setReversal(null)
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setSavingId(null)
    }
  }

  const [payAllOpen, setPayAllOpen] = useState(false)
  const [payingAll, setPayingAll] = useState(false)

  // System-wide — ignores whatever filters are currently on screen, per the
  // confirmed spec. Only flips halves that already have an assignable
  // dentist (placement always does; delivered only once assigned).
  const payAll = async () => {
    setPayingAll(true)
    try {
      const { data } = await api.post<{ placementCount: number; deliveredCount: number }>(
        '/api/lab-work/pay-all',
      )
      toast({
        title: t('markedPaidToast', { count: data.placementCount + data.deliveredCount }),
      })
      setPayAllOpen(false)
      load()
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setPayingAll(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{t('nav:items.labWork')}</h1>
        {isSuperAdmin && (
          <Button variant="outline" onClick={() => setPayAllOpen(true)}>
            <Banknote className="h-4 w-4" />
            {t('payAllLabCosts')}
          </Button>
        )}
      </div>

      <p className="mb-4 text-sm text-gray-500">{t('sameDayOnly')}</p>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">{t('treatments:page.dentist')}</Label>
          <Select
            value={dentistFilter || ALL_VALUE}
            onValueChange={(v) => {
              setDentistFilter(v === ALL_VALUE ? '' : v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>{t('treatments:page.all')}</SelectItem>
              {dentists.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">{t('labWorkType')}</Label>
          <Select
            value={typeFilter || ALL_VALUE}
            onValueChange={(v) => {
              setTypeFilter(v === ALL_VALUE ? '' : v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>{t('treatments:page.all')}</SelectItem>
              {labWorkTypeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">{t('common:status')}</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">{t('dashboard:from')}</Label>
          <Input
            type="date"
            className="w-40"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">{t('dashboard:to')}</Label>
          <Input
            type="date"
            className="w-40"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Button variant="outline" onClick={clearFilters}>
          {t('common:clearFilters')}
        </Button>
      </div>

      {loadError ? (
        <ErrorCard onRetry={load} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-gray-200 bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common:date')}</TableHead>
                  <TableHead>{t('dashboard:patient')}</TableHead>
                  <TableHead>{t('type')}</TableHead>
                  <TableHead>{t('company')}</TableHead>
                  <TableHead>{t('placementDentist')}</TableHead>
                  <TableHead>{t('deliveringDentist')}</TableHead>
                  <TableHead>{t('dashboard:labCost')}</TableHead>
                  <TableHead>{t('paymentStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={COL_COUNT} className="p-0">
                      <TableSkeleton cols={COL_COUNT} />
                    </TableCell>
                  </TableRow>
                ) : labWorks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COL_COUNT} className="p-0">
                      <EmptyState message={t('noItemsFound')} />
                    </TableCell>
                  </TableRow>
                ) : (
                  labWorks.map((lw) => {
                    const rowSaving = savingId === lw.id
                    return (
                      <TableRow key={lw.id}>
                        <TableCell>{formatThaiDate(lw.treatmentDate)}</TableCell>
                        <TableCell>
                          <div className="font-mono text-xs text-gray-500">{lw.client.hn}</div>
                          <div className="font-medium text-gray-900">
                            {lw.client.nameTitle} {lw.client.firstName} {lw.client.lastName}
                          </div>
                        </TableCell>
                        <TableCell>{labelOf(labWorkTypeOptions, lw.type)}{lw.typeDescription && `: ${lw.typeDescription}`}</TableCell>
                        <TableCell><LabCompanySelect value={lw.companyId} disabled={rowSaving} onChange={async companyId => {
                          setSavingId(lw.id)
                          try {
                            const { data } = await api.patch<LabWork>(`/api/lab-work/${lw.id}`, { companyId })
                            replaceRow(data)
                          } catch (err) { toast({ variant: 'destructive', title: getApiErrorMessage(err) }) }
                          finally { setSavingId(null) }
                        }} /></TableCell>
                        <TableCell>{lw.placementDentist.name}</TableCell>
                        <TableCell>
                          <Select
                            value={lw.deliveredDentistId ?? NONE_VALUE}
                            onValueChange={(v) => onDeliveredChange(lw, v)}
                          >
                            <SelectTrigger className="w-40" disabled={rowSaving || lw.deliveredPaid}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE_VALUE}>{t('notYetAssigned')}</SelectItem>
                              {deliveredOptionsFor(lw).map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {d.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {/* Assignment date is recorded automatically by the server; manual entry is hidden for now. */}
                        </TableCell>
                        <TableCell>
                          <Input
                            className="w-28"
                            inputMode="decimal"
                            placeholder="0.00"
                            disabled={rowSaving || lw.placementPaid || lw.deliveredPaid}
                            value={costValue(lw)}
                            onChange={(e) =>
                              setCostDrafts((prev) => ({ ...prev, [lw.id]: e.target.value }))
                            }
                            onBlur={() => onCostBlur(lw)}
                          />
                          {lw.cost !== null && (
                            <p className="mt-1 text-xs text-gray-400">
                              {t('perHalf')} {formatBaht(lw.cost / 2)}
                            </p>
                          )}
                          {(lw.placementPaid || lw.deliveredPaid) && <p className="text-xs text-gray-500">{t('reverseBeforeEdit')}</p>}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1.5" title={t('sameDayOnly')}>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="w-14 shrink-0 text-gray-500">{t('placement')}</span>
                              <LabPaymentStatus status={lw.placementPaid ? 'paid' : 'unpaid'} paidAt={lw.placementPaidAt} />
                              <PaidToggle
                                paid={lw.placementPaid}
                                disabled={lw.cost === null || (lw.placementPaid && !lw.placementReversible)}
                                saving={rowSaving}
                                onClick={() => togglePaid(lw, 'placement')}
                              />
                            </div>
                            {lw.deliveredDentistId ? (
                              <div className="flex items-center gap-2 text-xs">
                                <span className="w-14 shrink-0 text-gray-500">{t('delivered')}</span>
                                <LabPaymentStatus status={lw.deliveredPaid ? 'paid' : 'unpaid'} paidAt={lw.deliveredPaidAt} />
                                <PaidToggle
                                  paid={lw.deliveredPaid}
                                  disabled={lw.cost === null || (lw.deliveredPaid && !lw.deliveredReversible)}
                                  saving={rowSaving}
                                  onClick={() => togglePaid(lw, 'delivered')}
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-xs text-gray-400">
                                <span className="w-14 shrink-0">{t('delivered')}</span>
                                <span>{t('awaitingDeliveringDentist')}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>{rangeText}</span>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}

      <ConfirmDialog open={!!reversal} onOpenChange={open => { if (!open && !savingId) setReversal(null) }}
        title={t('reverseBeforeEdit')} description={t('reverseWarning')} destructive isLoading={!!savingId}
        onConfirm={() => { if (reversal) void togglePaid(reversal.lw, reversal.which, true) }} />
      <ConfirmDialog
        open={payAllOpen}
        onOpenChange={setPayAllOpen}
        title={t('payAllLabCosts')}
        description={t('payAllDescription')}
        confirmLabel={t('confirmPayAll')}
        isLoading={payingAll}
        onConfirm={payAll}
      />
    </div>
  )
}
