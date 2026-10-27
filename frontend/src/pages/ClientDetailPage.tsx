import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Pencil, Plus, Receipt as ReceiptIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { useClients } from '@/hooks/useClients'
import { useAuthStore } from '@/stores/authStore'
import type { Client, Dentist, ExistingReceiptMatch, TreatmentListResponse, TreatmentRecord } from '@/types'
import { paymentTypeOptions, labelOf } from '@/lib/treatmentOptions'
import { canSeeTreatmentCost } from '@/lib/treatmentAccess'
import { formatBaht, formatThaiDate } from '@/lib/format'
import { TreatmentItemSummary, formatDetail, typeText } from '@/components/treatment/TreatmentItemSummary'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorCard } from '@/components/ErrorCard'
import { Pagination } from '@/components/Pagination'
import { CorrectHnDialog } from '@/components/CorrectHnDialog'
import { ClientForm, type ClientFormHandle } from '@/components/ClientForm'
import { TreatmentFormDialog } from '@/components/treatment/TreatmentFormDialog'
import { ReceiptFormDialog, type ReceiptFormInitial } from '@/components/receipt/ReceiptFormDialog'

const toDateInput = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value || '—'}</dd>
    </div>
  )
}

export default function ClientDetailPage() {
  const { t } = useTranslation('clients')
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { fetchClient } = useClients()
  const role = useAuthStore((s) => s.user?.role)

  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [orthoDentists, setOrthoDentists] = useState<Dentist[]>([])
  const [activeDentists, setActiveDentists] = useState<Dentist[]>([])
  const [addTreatmentOpen, setAddTreatmentOpen] = useState(false)

  const [correctHnOpen, setCorrectHnOpen] = useState(false)
  const [editMode, setEditMode] = useState(
    (location.state as { edit?: boolean } | null)?.edit === true
  )
  const [saving, setSaving] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const formRef = useRef<ClientFormHandle>(null)

  const [treatments, setTreatments] = useState<TreatmentRecord[]>([])
  const [treatmentsLoading, setTreatmentsLoading] = useState(true)
  const [historyPage, setHistoryPage] = useState({ clientId: id, page: 1 })
  const page = historyPage.clientId === id ? historyPage.page : 1
  const [historyTotalPages, setHistoryTotalPages] = useState(1)
  const [historyError, setHistoryError] = useState(false)
  const historyRequest = useRef(0)
  const [viewingRecord, setViewingRecord] = useState<TreatmentRecord | null>(null)

  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)
  const [receiptInitial, setReceiptInitial] = useState<ReceiptFormInitial | null>(null)

  // Warns before issuing a receipt that would duplicate one already covering
  // this same treatment record — `onProceed` opens the receipt dialog.
  const [duplicateWarning, setDuplicateWarning] = useState<{
    matches: ExistingReceiptMatch[]
    onProceed: () => void
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const c = await fetchClient(id)
      setClient(c)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [fetchClient, id])

  useEffect(() => {
    load()
  }, [load])

  // Active ortho dentists (for the edit form's dropdown).
  useEffect(() => {
    api
      .get<Dentist[]>('/api/dentists', {
        params: { isOrthoDent: true, isActive: true },
      })
      .then((res) => setOrthoDentists(res.data))
      .catch(() => setOrthoDentists([]))
  }, [])

  // All active dentists (for the add-treatment form's dropdown).
  useEffect(() => {
    api
      .get<Dentist[]>('/api/dentists', { params: { isActive: true } })
      .then((res) => setActiveDentists(res.data))
      .catch(() => setActiveDentists([]))
  }, [])

  // This client's treatment history.
  const loadTreatments = useCallback(() => {
    if (!id) return
    const request = ++historyRequest.current
    setTreatmentsLoading(true)
    setHistoryError(false)
    api
      .get<TreatmentListResponse>('/api/treatments', {
        params: { clientId: id, page, limit: 5 },
      })
      .then((res) => {
        if (request !== historyRequest.current) return
        const lastPage = Math.max(1, res.data.totalPages)
        setHistoryTotalPages(lastPage)
        if (page > lastPage) setHistoryPage({ clientId: id, page: lastPage })
        else setTreatments(res.data.data)
      })
      .catch(() => { if (request === historyRequest.current) setHistoryError(true) })
      .finally(() => { if (request === historyRequest.current) setTreatmentsLoading(false) })
  }, [id, page])

  useEffect(() => {
    loadTreatments()
    return () => { historyRequest.current++ }
  }, [loadTreatments])

  const onSaved = (saved: Client) => {
    setClient(saved)
    setEditMode(false)
  }

  // The full client (with address) is already loaded here, unlike the
  // treatments list page — no extra fetch needed before opening the dialog.
  const openReceipt = async (record: TreatmentRecord) => {
    if (!client) return
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
      setReceiptInitial({
        customerName: `${client.nameTitle}${client.firstName} ${client.lastName}`,
        customerAddress: address || undefined,
        customerTaxId: client.nationalId || undefined,
        patientHn: client.hn,
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

    try {
      const { data } = await api.post<{ data: ExistingReceiptMatch[] }>(
        '/api/receipts/check-existing',
        { treatmentRecordIds: [record.id] },
      )
      if (data.data.length > 0) {
        setDuplicateWarning({ matches: data.data, onProceed: openDialog })
        return
      }
    } catch {
      // Duplicate check failing shouldn't block issuing a receipt.
    }
    openDialog()
  }

  const onSave = async () => {
    setSaving(true)
    try {
      await formRef.current?.submit()
    } finally {
      setSaving(false)
    }
  }

  const onCancelEdit = () => {
    if (formRef.current?.isDirty()) setCancelConfirm(true)
    else setEditMode(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }
  if (loadError || !client) {
    return (
      <div className="mx-auto max-w-md">
        <ErrorCard message={t('detail.loadError')} onRetry={load} />
      </div>
    )
  }

  const fullName = `${client.nameTitle}${client.firstName} ${client.lastName}`
  const address = [
    client.addressDetail,
    client.addressSubDistrict,
    client.addressDistrict,
    client.addressProvince,
    client.addressZipCode,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{fullName}</h1>
          <p className="font-mono text-sm text-gray-500">HN {client.hn}</p>
          {!editMode && (role === 'ADMIN' || role === 'SUPER_ADMIN') &&
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setCorrectHnOpen(true)}>{t('hnCorrection.title')}</Button>}
          {correctHnOpen && <CorrectHnDialog client={client} onClose={() => setCorrectHnOpen(false)} onSaved={setClient} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Client info / edit */}
        <div className="lg:col-span-2">
          <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{t('detail.patientInfo')}</h2>
              {!editMode && (
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                  <Pencil className="h-4 w-4" />
                  {t('common:edit')}
                </Button>
              )}
            </div>

            {editMode ? (
              <>
                <ClientForm
                  key={client.id}
                  ref={formRef}
                  client={client}
                  orthoDentists={orthoDentists}
                  onSaved={onSaved}
                />
                <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
                  <Button variant="outline" onClick={onCancelEdit} disabled={saving}>
                    {t('common:cancel')}
                  </Button>
                  <Button onClick={onSave} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('common:confirm')}
                  </Button>
                </div>
              </>
            ) : (
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Detail label={t('detail.title')} value={client.nameTitle} />
                <Detail label={t('page.fullName')} value={`${client.firstName} ${client.lastName}`} />
                <Detail label={t('page.gender')} value={client.gender} />
                <Detail label={t('page.birthday')} value={formatThaiDate(client.birthday)} />
                <Detail label={t('page.phone')} value={client.phoneNumber} />
                <Detail label={t('form.nationalId')} value={client.nationalId} />
                <Detail label={t('form.orthoDentist')} value={client.orthoDent?.name} />
                <Detail label={t('form.address')} value={address} />
                <Detail label={t('form.medicalConditions')} value={client.medCon} />
                <Detail label={t('form.drugAllergies')} value={client.drugAllergy} />
                <Detail label={t('form.currentMedications')} value={client.drugEat} />
              </dl>
            )}
          </div>
        </div>

        {/* Treatment history */}
        <div className="lg:col-span-1">
          <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {t('detail.treatmentHistory')}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddTreatmentOpen(true)}
              >
                <Plus className="h-4 w-4" />
                {t('common:add')}
              </Button>
            </div>
            {treatmentsLoading ? (
              <div className="py-8 text-center text-gray-400">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : historyError ? (
              <ErrorCard onRetry={loadTreatments} />
            ) : treatments.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {t('detail.noHistory')}
              </p>
            ) : (
              <ul className="space-y-2">
                {treatments.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setViewingRecord(r)}
                      className="w-full rounded-md border border-gray-200 p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {formatThaiDate(r.treatmentDate)}
                        </span>
                        {canSeeTreatmentCost(role, r.treatmentDate) && (
                          <span className="text-sm text-gray-600">
                            {r.totalCost === null ? '—' : `฿ ${formatBaht(r.totalCost)}`}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {r.dentist.name} · {r.items.map((i) => typeText(i.type)).join(', ')}
                      </p>
                      {client.hn === '000000' && r.items.some(i => i.data._legacyPatientContext?.clientName) && (
                        <p className="mt-1 break-words text-sm text-gray-700">
                          {r.items.find(i => i.data._legacyPatientContext?.clientName)?.data._legacyPatientContext?.clientName}
                        </p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!treatmentsLoading && !historyError && (
              <div className="mt-4 overflow-x-auto">
                <Pagination page={page} totalPages={historyTotalPages}
                  onPageChange={(next) => setHistoryPage({ clientId: id, page: next })} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add a treatment record for this client (pre-selected + locked) */}
      <TreatmentFormDialog
        open={addTreatmentOpen}
        onOpenChange={setAddTreatmentOpen}
        record={null}
        dentists={activeDentists}
        lockedClient={client}
        onSaved={() => {
          if (page === 1) loadTreatments()
          else setHistoryPage({ clientId: id, page: 1 })
        }}
      />

      {/* Read-only treatment record viewer */}
      <Dialog
        open={!!viewingRecord}
        onOpenChange={(o) => !o && setViewingRecord(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('detail.treatmentDetailsTitle')}</DialogTitle>
          </DialogHeader>
          {viewingRecord && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-md bg-gray-50 p-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-gray-500">{t('detail.dateLabel')}</span>{' '}
                  {formatThaiDate(viewingRecord.treatmentDate)}
                </div>
                <div>
                  <span className="text-gray-500">{t('detail.dentistLabel')}</span>{' '}
                  {viewingRecord.dentist.name}
                </div>
                {viewingRecord.note && (
                  <div className="sm:col-span-2">
                    <span className="text-gray-500">{t('detail.noteLabel')}</span>{' '}
                    {viewingRecord.note}
                  </div>
                )}
              </div>
              <div className="divide-y divide-gray-100 rounded-md border border-gray-200 px-3">
                {viewingRecord.items.map((item) => (
                  <TreatmentItemSummary key={item.id ?? item.type} item={item} />
                ))}
              </div>
              {canSeeTreatmentCost(role, viewingRecord.treatmentDate) && (
                <div className="text-right text-sm font-semibold text-gray-900">
                  {t('detail.grandTotal')}{' '}
                  {viewingRecord.totalCost === null
                    ? '—'
                    : `฿ ${formatBaht(viewingRecord.totalCost)}`}
                </div>
              )}
              {canSeeTreatmentCost(role, viewingRecord.treatmentDate) &&
                viewingRecord.payments.length > 0 && (
                  <div className="divide-y divide-gray-100 rounded-md border border-gray-200 px-3">
                    {viewingRecord.payments.map((p, i) => (
                      <div key={p.id ?? i} className="flex justify-between py-1.5 text-sm">
                        <span className="text-gray-900">{labelOf(paymentTypeOptions, p.type)}</span>
                        <span className="font-medium text-gray-700">฿ {formatBaht(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const r = viewingRecord
                    setViewingRecord(null)
                    openReceipt(r)
                  }}
                >
                  <ReceiptIcon className="h-4 w-4" />
                  {t('detail.createReceipt')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setViewingRecord(null)
                    navigate(`/treatments?recordId=${encodeURIComponent(viewingRecord.id)}`)
                  }}
                >
                  {t('detail.goToTreatments')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelConfirm}
        onOpenChange={setCancelConfirm}
        title={t('detail.cancelEditTitle')}
        description={t('detail.cancelEditDescription')}
        confirmLabel={t('detail.cancelEditConfirm')}
        destructive
        onConfirm={() => {
          setCancelConfirm(false)
          setEditMode(false)
          load()
        }}
      />

      <ReceiptFormDialog
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
        kind="individual"
        initial={receiptInitial}
      />

      <ConfirmDialog
        open={!!duplicateWarning}
        onOpenChange={(o) => !o && setDuplicateWarning(null)}
        title={t('receipts:duplicateWarning.title')}
        description={
          duplicateWarning
            ? t('receipts:duplicateWarning.singleDescription', {
                number: duplicateWarning.matches[0].number,
                year: duplicateWarning.matches[0].buddhistYear,
                date: formatThaiDate(duplicateWarning.matches[0].issueDate),
                customerName: duplicateWarning.matches[0].customerName,
              })
            : undefined
        }
        confirmLabel={t('receipts:duplicateWarning.confirmAnyway')}
        onConfirm={() => {
          duplicateWarning?.onProceed()
          setDuplicateWarning(null)
        }}
      />
    </div>
  )
}
