import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Eye, FileText, Loader2, Pencil, Plus, Receipt as ReceiptIcon, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from '@/hooks/useToast'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  downloadCsv,
  formatDateBuddhist,
  todayStamp,
  type ExportColumn,
} from '@/lib/exportCsv'
import type {
  Client,
  Dentist,
  ExistingReceiptMatch,
  TreatmentListResponse,
  TreatmentRecord,
} from '@/types'
import { paymentTypeOptions, labelOf } from '@/lib/treatmentOptions'
import { canSeeTreatmentCost } from '@/lib/treatmentAccess'
import { formatBaht, formatThaiDate } from '@/lib/format'
import { TreatmentItemSummary, formatDetail, typeText } from '@/components/treatment/TreatmentItemSummary'
import { TreatmentFormDialog } from '@/components/treatment/TreatmentFormDialog'
import { ReceiptFormDialog, type ReceiptFormInitial } from '@/components/receipt/ReceiptFormDialog'
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
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { ErrorCard } from '@/components/ErrorCard'
import { TableSkeleton } from '@/components/TableSkeleton'
import { Pagination } from '@/components/Pagination'
import { ExportDialog } from '@/components/ExportDialog'

const PAGE_SIZE = 10

// Built from the active translation at call time (not a module-level
// constant) since ExportDialog renders `col.header` directly as final text.
function getTreatmentExportColumns(t: (key: string) => string): ExportColumn[] {
  return [
    { key: 'treatmentDateFormatted', header: t('treatments:exportColumns.treatmentDate') },
    { key: 'clientHn', header: 'HN' },
    { key: 'clientName', header: t('treatments:exportColumns.clientName') },
    { key: 'dentistName', header: t('treatments:exportColumns.dentist') },
    { key: 'treatmentTypesThai', header: t('treatments:exportColumns.treatmentType') },
    { key: 'totalCostFormatted', header: t('treatments:exportColumns.totalCostBaht') },
    { key: 'note', header: t('treatments:form.note') },
  ]
}

function prepareTreatmentRow(record: TreatmentRecord): Record<string, any> {
  const typeLabels = record.items.map((item) => typeText(item.type)).join(', ')

  return {
    treatmentDateFormatted: formatDateBuddhist(record.treatmentDate),
    clientHn: record.client.hn,
    clientName: `${record.client.nameTitle}${record.client.firstName} ${record.client.lastName}`,
    dentistName: record.dentist.name,
    treatmentTypesThai: typeLabels,
    totalCostFormatted:
      record.totalCost !== null ? record.totalCost.toFixed(2) : '',
    note: record.note ?? '',
  }
}

const toDateInput = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/* ----------------------------------------------------------- Detail ------- */

function TreatmentDetailDialog({
  record,
  loading,
  error,
  onRetry,
  onOpenChange,
  onEdit,
  onCreateReceipt,
  receiptLoading,
}: {
  record: TreatmentRecord | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onCreateReceipt: (record: TreatmentRecord) => void
  receiptLoading: boolean
}) {
  const { t } = useTranslation('treatments')
  const role = useAuthStore((s) => s.user?.role)
  const costVisible = !!record && canSeeTreatmentCost(role, record.treatmentDate)
  return (
    <Dialog open={!!record || loading || !!error} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('detail.title')}</DialogTitle>
        </DialogHeader>
        {loading && (
          <div className="flex items-center justify-center gap-2 py-12" role="status">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t('common:loading')}
          </div>
        )}
        {error && <ErrorCard message={error} onRetry={onRetry} />}
        {record && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-md bg-gray-50 p-3 text-sm sm:grid-cols-2">
              <div>
                <span className="text-gray-500">{t('detail.hnLabel')}</span> {record.client.hn}
              </div>
              <div>
                <span className="text-gray-500">{t('detail.patientLabel')}</span>{' '}
                {record.client.nameTitle} {record.client.firstName}{' '}
                {record.client.lastName}
              </div>
              <div>
                <span className="text-gray-500">{t('detail.dentistLabel')}</span>{' '}
                {record.dentist.name}
              </div>
              <div>
                <span className="text-gray-500">{t('detail.dateLabel')}</span>{' '}
                {formatThaiDate(record.treatmentDate)}
              </div>
              {record.note && (
                <div className="sm:col-span-2">
                  <span className="text-gray-500">{t('detail.noteLabel')}</span> {record.note}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-1 text-sm font-medium text-gray-900">
                {t('detail.items')}
              </h3>
              <div className="divide-y divide-gray-100 rounded-md border border-gray-200 px-3">
                {record.items.map((item) => (
                  <TreatmentItemSummary key={item.id ?? item.type} item={item} />
                ))}
              </div>
            </div>

            {costVisible && (
              <div className="text-right text-sm font-semibold text-gray-900">
                {t('detail.grandTotal')}{' '}
                {record.totalCost === null
                  ? '—'
                  : `฿ ${formatBaht(record.totalCost)}`}
              </div>
            )}

            {costVisible && record.payments.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-medium text-gray-900">
                  {t('detail.payments')}
                </h3>
                <div className="divide-y divide-gray-100 rounded-md border border-gray-200 px-3">
                  {record.payments.map((p, i) => (
                    <div key={p.id ?? i} className="flex justify-between py-1.5 text-sm">
                      <span className="text-gray-900">{labelOf(paymentTypeOptions, p.type)}</span>
                      <span className="font-medium text-gray-700">฿ {formatBaht(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                disabled={receiptLoading}
                onClick={() => onCreateReceipt(record)}
              >
                {receiptLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ReceiptIcon className="h-4 w-4" />
                )}
                {t('detail.createReceipt')}
              </Button>
              <Button onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                {t('common:edit')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------------------------- Bulk receipt filter - */

function BulkReceiptFilterDialog({
  open,
  onOpenChange,
  from,
  to,
  onFromChange,
  onToChange,
  paymentTypes,
  onTogglePaymentType,
  loading,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  paymentTypes: string[]
  onTogglePaymentType: (value: string) => void
  loading: boolean
  onConfirm: () => void
}) {
  const { t } = useTranslation('treatments')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('bulkReceipt.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t('bulkReceipt.fromDate')}</Label>
              <Input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => onFromChange(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('bulkReceipt.toDate')}</Label>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => onToChange(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('bulkReceipt.paymentType')}</Label>
            <p className="text-xs text-gray-500">
              {t('bulkReceipt.multiSelectHint')}
            </p>
            <div className="space-y-2">
              {paymentTypeOptions.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={paymentTypes.includes(o.value)}
                    onCheckedChange={() => onTogglePaymentType(o.value)}
                  />
                  {t(o.label)}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:cancel')}
          </Button>
          <Button type="button" disabled={loading} onClick={onConfirm}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('bulkReceipt.title')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------- Page ------- */

export default function TreatmentsPage() {
  const { t } = useTranslation('treatments')
  const role = useAuthStore((s) => s.user?.role)
  const canDelete = role === 'ADMIN' || role === 'SUPER_ADMIN'
  // Bulk receipts are ADMIN+ only — individual receipts are open to any role
  // (see the per-row and detail-dialog receipt buttons below, both ungated).
  const canBulkReceipt = role === 'ADMIN' || role === 'SUPER_ADMIN'
  // Cost column is always shown, but each row's cell is only filled in when
  // canSeeTreatmentCost(role, row.treatmentDate) allows it. CSV export is
  // gated purely by role: only SUPER_ADMIN can export the cost column at all.
  const isSuperAdmin = role === 'SUPER_ADMIN'
  const colCount = 7
  const { toast } = useToast()

  const [records, setRecords] = useState<TreatmentRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // CSV export
  const [exportOpen, setExportOpen] = useState(false)
  const [exportRows, setExportRows] = useState<TreatmentRecord[]>([])
  const [exportLoading, setExportLoading] = useState(false)

  // Receipts
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)
  const [receiptKind, setReceiptKind] = useState<'individual' | 'bulk'>('individual')
  const [receiptInitial, setReceiptInitial] = useState<ReceiptFormInitial | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [bulkReceiptLoading, setBulkReceiptLoading] = useState(false)

  // Warns before issuing a receipt that would duplicate one already covering
  // the same treatment record(s) — `onProceed` is whatever the caller was
  // about to do (open the individual/bulk receipt dialog).
  const [duplicateWarning, setDuplicateWarning] = useState<{
    matches: ExistingReceiptMatch[]
    ids: string[]
    onProceed: () => void
  } | null>(null)

  const checkExistingReceipts = async (recordIds: string[]) => {
    const { data } = await api.post<{ data: ExistingReceiptMatch[] }>(
      '/api/receipts/check-existing',
      { treatmentRecordIds: recordIds },
    )
    return data.data
  }

  const duplicateWarningDescription = (() => {
    if (!duplicateWarning) return undefined
    const { matches, ids } = duplicateWarning
    if (ids.length === 1 && matches.length === 1) {
      const m = matches[0]
      return t('receipts:duplicateWarning.singleDescription', {
        number: m.number,
        year: m.buddhistYear,
        date: formatThaiDate(m.issueDate),
        customerName: m.customerName,
      })
    }
    const covered = new Set(
      matches.flatMap((m) => m.treatmentRecordIds).filter((id) => ids.includes(id)),
    ).size
    return t('receipts:duplicateWarning.bulkDescription', {
      covered,
      total: ids.length,
    })
  })()

  // Bulk receipt filter — its own date range + payment-type multi-select,
  // independent of the table's filters above.
  const [bulkFilterOpen, setBulkFilterOpen] = useState(false)
  const [bulkFrom, setBulkFrom] = useState('')
  const [bulkTo, setBulkTo] = useState('')
  const [bulkPaymentTypes, setBulkPaymentTypes] = useState<string[]>([])
  const toggleBulkPaymentType = (value: string) =>
    setBulkPaymentTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )

  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [dentistFilter, setDentistFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [dentists, setDentists] = useState<Dentist[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TreatmentRecord | null>(null)
  const [viewing, setViewing] = useState<TreatmentRecord | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const recordId = searchParams.get('recordId')
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailAttempt, setDetailAttempt] = useState(0)

  // Fetch the selected record directly, even when it is outside the current
  // list's page or filters. Abort on navigation so stale requests cannot reopen it.
  useEffect(() => {
    if (!recordId) return
    const controller = new AbortController()
    setViewing(null)
    setDetailLoading(true)
    setDetailError(null)
    api.get<TreatmentRecord>(`/api/treatments/${encodeURIComponent(recordId)}`, {
      signal: controller.signal,
    }).then(({ data }) => {
      if (!controller.signal.aborted) setViewing(data)
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setDetailError(getApiErrorMessage(err))
    }).finally(() => {
      if (!controller.signal.aborted) setDetailLoading(false)
    })
    return () => {
      controller.abort()
      setViewing(null)
      setDetailLoading(false)
      setDetailError(null)
    }
  }, [recordId, detailAttempt])

  const closeDetail = () => {
    setViewing(null)
    setDetailLoading(false)
    setDetailError(null)
    if (recordId) {
      setSearchParams((params) => {
        const next = new URLSearchParams(params)
        next.delete('recordId')
        return next
      }, { replace: true })
    }
  }
  const [toDelete, setToDelete] = useState<TreatmentRecord | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Top filter shows all dentists (to filter historical records); the create
  // form only offers active ones.
  const activeDentists = useMemo(() => dentists.filter((d) => d.isActive), [dentists])

  // Only SUPER_ADMIN can export the cost column, regardless of which rows are
  // visible on screen.
  const exportColumns = useMemo(() => {
    const all = getTreatmentExportColumns(t)
    return isSuperAdmin ? all : all.filter((c) => c.key !== 'totalCostFormatted')
  }, [isSuperAdmin, t])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const params: Record<string, string | number> = {
        page,
        limit: PAGE_SIZE,
      }
      if (dentistFilter) params.dentistId = dentistFilter
      if (from) params.from = from
      if (to) params.to = to
      if (query) params.q = query

      const { data } = await api.get<TreatmentListResponse>('/api/treatments', {
        params,
      })
      setRecords(data.data)
      setTotal(data.total)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [page, dentistFilter, from, to, query])

  // Fetch all records matching the active filters, then open the column picker.
  const startExport = async () => {
    setExportLoading(true)
    try {
      const params: Record<string, string | number> = { limit: 'all', page: 1 }
      if (dentistFilter) params.dentistId = dentistFilter
      if (from) params.from = from
      if (to) params.to = to
      if (query) params.q = query

      const { data } = await api.get<TreatmentListResponse>('/api/treatments', {
        params,
      })
      setExportRows(data.data)
      setExportOpen(true)
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setExportLoading(false)
    }
  }

  const handleExport = async (selected: ExportColumn[]) => {
    setExportLoading(true)
    try {
      const rows = exportRows.map(prepareTreatmentRow)
      await downloadCsv(rows, selected, `treatments_export_${todayStamp()}.csv`, 'treatment')
      setExportOpen(false)
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setExportLoading(false)
    }
  }

  // Individual receipt: the treatment list's embedded client has no address,
  // so fetch the full client record first, then prefill one line item per
  // treatment item (same "<type>: <detail>" text TreatmentItemSummary shows).
  const openIndividualReceipt = async (record: TreatmentRecord) => {
    setReceiptLoading(true)
    try {
      const { data: client } = await api.get<Client>(`/api/clients/${record.clientId}`)
      const address = [
        client.addressDetail,
        client.addressSubDistrict,
        client.addressDistrict,
        client.addressProvince,
        client.addressZipCode,
      ]
        .filter(Boolean)
        .join(' ')

      const openDialog = () => {
        setReceiptKind('individual')
        setReceiptInitial({
          customerName: `${record.client.nameTitle}${record.client.firstName} ${record.client.lastName}`,
          customerAddress: address || undefined,
          customerTaxId: client.nationalId || undefined,
          patientHn: record.client.hn,
          issueDate: toDateInput(record.treatmentDate),
          lineItems: record.items.map((i) => {
            const detail = formatDetail(i.type, i.data as Record<string, any>)
            return {
              label: detail ? `${typeText(i.type)}: ${detail}` : typeText(i.type),
              amount: i.price ?? 0,
            }
          }),
          treatmentRecordIds: [record.id],
        })
        setReceiptDialogOpen(true)
      }

      const matches = await checkExistingReceipts([record.id])
      if (matches.length > 0) {
        setDuplicateWarning({ matches, ids: [record.id], onProceed: openDialog })
      } else {
        openDialog()
      }
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setReceiptLoading(false)
    }
  }

  // Bulk receipt: sums every record matching the filter picked in
  // BulkReceiptFilterDialog (date range + payment type, independent of the
  // table's own filters above) into one lump line item, defaulting the
  // receipt date to the latest treatmentDate among them.
  const startBulkReceipt = async () => {
    setBulkReceiptLoading(true)
    try {
      const params: Record<string, string | number> = { limit: 'all', page: 1 }
      if (bulkFrom) params.from = bulkFrom
      if (bulkTo) params.to = bulkTo
      if (bulkPaymentTypes.length > 0) params.paymentType = bulkPaymentTypes.join(',')

      const { data } = await api.get<TreatmentListResponse>('/api/treatments', { params })
      if (data.data.length === 0) {
        toast({ variant: 'destructive', title: t('bulkReceipt.noMatchingRecords') })
        return
      }

      const totalAmount = data.data.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
      const latestTime = Math.max(...data.data.map((r) => new Date(r.treatmentDate).getTime()))
      const recordIds = data.data.map((r) => r.id)

      const openDialog = () => {
        setReceiptKind('bulk')
        setReceiptInitial({
          customerName: 'ประกันสังคม',
          issueDate: toDateInput(new Date(latestTime).toISOString()),
          lineItems: [{ label: 'ค่าบริการทางทันตกรรม', amount: totalAmount }],
          treatmentRecordIds: recordIds,
        })
        setBulkFilterOpen(false)
        setReceiptDialogOpen(true)
      }

      const matches = await checkExistingReceipts(recordIds)
      if (matches.length > 0) {
        setDuplicateWarning({ matches, ids: recordIds, onProceed: openDialog })
      } else {
        openDialog()
      }
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setBulkReceiptLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api
      .get<Dentist[]>('/api/dentists')
      .then((res) => setDentists(res.data))
      .catch(() => setDentists([]))
  }, [])

  // Debounced search (HN or name), min 2 chars.
  useEffect(() => {
    const handle = setTimeout(() => {
      const trimmed = searchInput.trim()
      const next = trimmed.length >= 2 ? trimmed : ''
      setQuery((prev) => {
        if (prev !== next) {
          setPage(1)
          return next
        }
        return prev
      })
    }, 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  const clearFilters = () => {
    setSearchInput('')
    setQuery('')
    setDentistFilter('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  const rangeText = useMemo(() => {
    if (total === 0) return t('page.showingZero')
    const start = (page - 1) * PAGE_SIZE + 1
    const end = Math.min(page * PAGE_SIZE, total)
    return t('page.showingRange', { start, end, total })
  }, [page, total, t])

  const runDelete = async () => {
    if (!toDelete) return
    setDeleteLoading(true)
    try {
      await api.delete(`/api/treatments/${toDelete.id}`)
      toast({ title: t('page.deletedSuccess') })
      setToDelete(null)
      if (records.length === 1 && page > 1) setPage((p) => p - 1)
      else load()
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
      setToDelete(null)
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{t('nav:items.treatments')}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={startExport} disabled={exportLoading}>
            {exportLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t('common:export.exportCsv')}
          </Button>
          {canBulkReceipt && (
            <Button
              variant="outline"
              onClick={() => {
                setBulkFrom('')
                setBulkTo('')
                setBulkPaymentTypes([])
                setBulkFilterOpen(true)
              }}
            >
              <FileText className="h-4 w-4" />
              {t('bulkReceipt.title')}
            </Button>
          )}
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            {t('page.addRecord')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">{t('page.searchLabel')}</Label>
          <Input
            className="w-56"
            placeholder={t('page.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">{t('page.dentist')}</Label>
          <Select
            value={dentistFilter || '__all__'}
            onValueChange={(v) => {
              setDentistFilter(v === '__all__' ? '' : v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('page.all')}</SelectItem>
              {dentists.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
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
      <div className="rounded-md border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('treatments:exportColumns.treatmentDate')}</TableHead>
              <TableHead>HN</TableHead>
              <TableHead>{t('page.clientName')}</TableHead>
              <TableHead>{t('page.dentist')}</TableHead>
              <TableHead>{t('treatments:exportColumns.treatmentType')}</TableHead>
              <TableHead>{t('page.total')}</TableHead>
              <TableHead className="text-right">{t('common:actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={colCount} className="p-0">
                  <TableSkeleton cols={colCount} />
                </TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="p-0">
                  <EmptyState message={t('page.noRecordsFound')} />
                </TableCell>
              </TableRow>
            ) : (
              records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatThaiDate(r.treatmentDate)}</TableCell>
                  <TableCell className="font-mono">{r.client.hn}</TableCell>
                  <TableCell className="font-medium text-gray-900">
                    {r.client.nameTitle} {r.client.firstName} {r.client.lastName}
                  </TableCell>
                  <TableCell>{r.dentist.name}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {r.items.map((i) => typeText(i.type)).join(', ')}
                  </TableCell>
                  <TableCell>
                    {canSeeTreatmentCost(role, r.treatmentDate)
                      ? r.totalCost === null
                        ? '—'
                        : `฿ ${formatBaht(r.totalCost)}`
                      : null}
                  </TableCell>
                  <TableCell>
                    <TooltipProvider delayDuration={200}>
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setViewing(r)}
                            >
                              <Eye className="h-4 w-4 text-gray-600" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('page.view')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditing(r)
                                setFormOpen(true)
                              }}
                            >
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
                              disabled={receiptLoading}
                              onClick={() => openIndividualReceipt(r)}
                            >
                              <ReceiptIcon className="h-4 w-4 text-gray-600" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('detail.createReceipt')}</TooltipContent>
                        </Tooltip>
                        {canDelete && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setToDelete(r)}
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('common:delete')}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              ))
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

      <TreatmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        record={editing}
        dentists={activeDentists}
        onSaved={load}
      />

      <TreatmentDetailDialog
        record={viewing}
        loading={detailLoading}
        error={detailError}
        onRetry={() => setDetailAttempt((attempt) => attempt + 1)}
        onOpenChange={(o) => !o && closeDetail()}
        onEdit={() => {
          const r = viewing
          closeDetail()
          setEditing(r)
          setFormOpen(true)
        }}
        onCreateReceipt={(r) => {
          closeDetail()
          openIndividualReceipt(r)
        }}
        receiptLoading={receiptLoading}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t('page.deleteRecordTitle')}
        description={
          toDelete
            ? t('page.deleteRecordConfirm', {
                name: `${toDelete.client.nameTitle}${toDelete.client.firstName}`,
                date: formatThaiDate(toDelete.treatmentDate),
              })
            : undefined
        }
        confirmLabel={t('common:delete')}
        destructive
        isLoading={deleteLoading}
        onConfirm={runDelete}
      />

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        columns={exportColumns}
        onExport={handleExport}
        isLoading={exportLoading}
        recordCount={exportRows.length}
      />

      <ReceiptFormDialog
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
        kind={receiptKind}
        initial={receiptInitial}
      />

      <ConfirmDialog
        open={!!duplicateWarning}
        onOpenChange={(o) => !o && setDuplicateWarning(null)}
        title={t('receipts:duplicateWarning.title')}
        description={duplicateWarningDescription}
        confirmLabel={t('receipts:duplicateWarning.confirmAnyway')}
        onConfirm={() => {
          duplicateWarning?.onProceed()
          setDuplicateWarning(null)
        }}
      />

      <BulkReceiptFilterDialog
        open={bulkFilterOpen}
        onOpenChange={setBulkFilterOpen}
        from={bulkFrom}
        to={bulkTo}
        onFromChange={setBulkFrom}
        onToChange={setBulkTo}
        paymentTypes={bulkPaymentTypes}
        onTogglePaymentType={toggleBulkPaymentType}
        loading={bulkReceiptLoading}
        onConfirm={startBulkReceipt}
      />
    </div>
  )
}
