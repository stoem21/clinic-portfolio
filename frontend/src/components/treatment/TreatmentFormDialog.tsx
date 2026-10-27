import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { LabCompanySelect } from '@/components/LabCompanySelect'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from '@/hooks/useToast'
import { useClients } from '@/hooks/useClients'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatBaht } from '@/lib/format'
import { clinicToday } from '@/lib/clinicDay'
import type {
  Client,
  Dentist,
  LabWorkType,
  PaymentType,
  TreatmentInput,
  TreatmentRecord,
} from '@/types'
import { treatmentTypes } from '@/lib/toothData'
import { paymentTypeOptions, labWorkTypeOptions } from '@/lib/treatmentOptions'
import {
  treatmentItemComponentMap,
  validateTreatmentItem,
} from '@/components/treatment'
import type { ItemData } from '@/components/treatment/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Checkbox } from '@/components/ui/checkbox'

const PRELOAD_THRESHOLD = 50

const toDateInput = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}
export const clientOptionLabel = (c: {
  hn: string
  nameTitle: string
  firstName: string
  lastName: string
}) => `${c.hn} – ${c.nameTitle} ${c.firstName} ${c.lastName}`

/* ---------------------------------------------------- Client combobox ---- */

function ClientCombobox({
  value,
  displayLabel,
  onChange,
  error,
}: {
  value: string
  displayLabel: string
  onChange: (clientId: string, label: string, client: Client | null) => void
  error?: string
}) {
  const { t } = useTranslation('treatments')
  const { fetchClients, fetchClientCount } = useClients()
  const [preloadMode, setPreloadMode] = useState(false)
  const [allClients, setAllClients] = useState<Client[]>([])
  const [text, setText] = useState(displayLabel)
  const [results, setResults] = useState<Client[]>([])
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setText(displayLabel)
  }, [displayLabel])

  // Decide strategy once: preload everything if the client base is small.
  useEffect(() => {
    let active = true
    fetchClientCount().then((count) => {
      if (!active) return
      if (count <= PRELOAD_THRESHOLD) {
        setPreloadMode(true)
        fetchClients({ limit: PRELOAD_THRESHOLD }).then(
          (res) => active && setAllClients(res.data)
        )
      } else {
        setPreloadMode(false)
      }
    })
    return () => {
      active = false
    }
  }, [fetchClientCount, fetchClients])

  // Search mode: debounce remote search on 2+ chars.
  useEffect(() => {
    if (preloadMode) return
    const handle = setTimeout(() => {
      const q = text.trim()
      if (q.length >= 2) {
        fetchClients({ q, limit: 20 }).then((res) => setResults(res.data))
      } else {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [text, preloadMode, fetchClients])

  const options = useMemo(() => {
    if (!preloadMode) return results
    const q = text.trim().toLowerCase()
    if (!q) return allClients
    return allClients.filter((c) =>
      `${c.hn} ${c.firstName} ${c.lastName} ${c.phoneNumber}`
        .toLowerCase()
        .includes(q)
    )
  }, [preloadMode, results, allClients, text])

  const select = (c: Client) => {
    const label = clientOptionLabel(c)
    setText(label)
    onChange(c.id, label, c)
    setOpen(false)
  }

  return (
    <div className="relative">
      <Input
        placeholder={
          preloadMode ? t('form.searchClientPlaceholder') : t('form.searchClientMinChars')
        }
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          if (value) onChange('', '', null) // typing invalidates the prior selection
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150)
        }}
      />
      {open && options.length > 0 && (
        <ul
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-md"
          onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
        >
          {options.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                onClick={() => select(c)}
              >
                {clientOptionLabel(c)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  )
}

/* ------------------------------------------------------------ Form -------- */

interface ItemRow {
  type: string
  data: ItemData
  price: string
}

interface PaymentRow {
  type: string
  amount: string
}

interface LabWorkRow {
  typeDescription: string
  type: string
  companyId: string
  cost: string
}

export function TreatmentFormDialog({
  open,
  onOpenChange,
  record,
  dentists,
  lockedClient,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: TreatmentRecord | null
  dentists: Dentist[]
  // When provided (create mode), the client is pre-selected and the picker is
  // hidden — used by the client detail page to add a record for that patient.
  lockedClient?: Client | null
  onSaved: () => void
}) {
  const { t } = useTranslation('treatments')
  const { toast } = useToast()
  const role = useAuthStore((s) => s.user?.role)
  const isSuperAdmin = role === 'SUPER_ADMIN'
  const canEnterLabCost = isSuperAdmin || role === 'ADMIN'
  const todayStr = clinicToday()
  const [clientId, setClientId] = useState('')
  const [clientLabel, setClientLabel] = useState('')
  const [dentistId, setDentistId] = useState('')
  const [treatmentDate, setTreatmentDate] = useState('')
  const [note, setNote] = useState('')

  // The selected client's current ortho status — drives the ortho-case panel
  // and the End-case dentist prefill.
  const [clientOrtho, setClientOrtho] = useState<{
    orthoDentId: string | null
    orthoDent: { id: string; name: string } | null
  } | null>(null)

  // Only active dentists are selectable; when editing a record whose dentist
  // has since been deactivated/removed, keep showing that one so the value
  // isn't silently lost. The client's ortho dentist is also kept selectable so
  // the End-case prefill resolves even when that dentist is now inactive.
  const dentistOptions = useMemo(() => {
    const list = dentists.map((d) => ({ id: d.id, name: d.name }))
    if (record && !list.some((d) => d.id === record.dentistId)) {
      list.unshift({
        id: record.dentistId,
        name: `${record.dentist.name} ${t('form.inactiveSuffix')}`,
      })
    }
    if (clientOrtho?.orthoDent && !list.some((d) => d.id === clientOrtho.orthoDent!.id)) {
      list.push({ id: clientOrtho.orthoDent.id, name: clientOrtho.orthoDent.name })
    }
    return list
  }, [dentists, record, clientOrtho, t])
  const [items, setItems] = useState<ItemRow[]>([
    { type: '', data: {}, price: '' },
  ])
  // At least one is required — their amounts must sum to exactly the items'
  // total cost (validated on submit; also enforced server-side).
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [paymentError, setPaymentError] = useState('')
  const [costError, setCostError] = useState('')
  // Create-mode only: while true, a single cash row is kept pinned to the
  // live items total (see the effect below). Flips off the instant the user
  // manually touches the payment section, so their edit sticks.
  const [paymentIsAuto, setPaymentIsAuto] = useState(false)
  // New lab jobs only; existing jobs remain managed on the Lab Work page.
  const [labWorks, setLabWorks] = useState<LabWorkRow[]>([])
  const [labWorkError, setLabWorkError] = useState('')
  const [headerErrors, setHeaderErrors] = useState<Record<string, string>>({})
  const [itemErrors, setItemErrors] = useState<Record<string, string>[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  // Explicit start/end ortho action the user opted into (off by default).
  const [orthoAction, setOrthoAction] = useState<'start' | 'end' | null>(null)
  const [confirmOrtho, setConfirmOrtho] = useState(false)
  const [pendingPayload, setPendingPayload] = useState<TreatmentInput | null>(null)
  // Snapshot of the form taken when it opens, to detect unsaved changes.
  const initialRef = useRef('')

  const snapshot = () =>
    JSON.stringify({ clientId, dentistId, treatmentDate, note, items, payments, labWorks })
  const attemptClose = () => {
    if (snapshot() !== initialRef.current) setConfirmClose(true)
    else onOpenChange(false)
  }

  useEffect(() => {
    if (!open) return
    setConfirmClose(false)
    setOrthoAction(null)
    if (record) {
      setClientId(record.clientId)
      setClientLabel(clientOptionLabel(record.client))
      setDentistId(record.dentistId)
      setTreatmentDate(toDateInput(record.treatmentDate))
      setNote(record.note ?? '')
      setClientOrtho({
        orthoDentId: record.client.orthoDentId,
        orthoDent: record.client.orthoDent,
      })
      setItems(
        record.items.map((i) => ({
          type: i.type,
          data: i.data ?? {},
          price: i.price === null ? '' : String(i.price),
        }))
      )
      setPayments(
        record.payments.map((p) => ({ type: p.type, amount: String(p.amount) }))
      )
      setPaymentIsAuto(false)
      // Start with no additions; never resubmit existing lab jobs.
      setLabWorks([])
    } else {
      // Create mode: pre-fill the client when locked to one.
      setClientId(lockedClient?.id ?? '')
      setClientLabel(lockedClient ? clientOptionLabel(lockedClient) : '')
      setDentistId('')
      setTreatmentDate(todayStr)
      setNote('')
      setClientOrtho(
        lockedClient
          ? { orthoDentId: lockedClient.orthoDentId, orthoDent: lockedClient.orthoDent }
          : null
      )
      setItems([{ type: '', data: {}, price: '' }])
      // Default payment: a single cash row pinned to the (initially zero)
      // items total; kept in sync by the auto-tracking effect below.
      setPayments([{ type: 'cash', amount: '' }])
      setPaymentIsAuto(true)
      setLabWorks([])
    }
    setHeaderErrors({})
    setItemErrors([])
    setPaymentError('')
    setCostError('')
    setLabWorkError('')
    // Record the opening state so attemptClose can detect edits.
    initialRef.current = record
      ? JSON.stringify({
          clientId: record.clientId,
          dentistId: record.dentistId,
          treatmentDate: toDateInput(record.treatmentDate),
          note: record.note ?? '',
          items: record.items.map((i) => ({
            type: i.type,
            data: i.data ?? {},
            price: i.price === null ? '' : String(i.price),
          })),
          payments: record.payments.map((p) => ({ type: p.type, amount: String(p.amount) })),
          labWorks: [],
        })
      : JSON.stringify({
          clientId: lockedClient?.id ?? '',
          dentistId: '',
          treatmentDate: todayStr,
          note: '',
          items: [{ type: '', data: {}, price: '' }],
          payments: [{ type: 'cash', amount: '' }],
          labWorks: [],
        })
  }, [open, record, lockedClient, todayStr])

  // Switching the client invalidates any pending ortho toggle. Dentist is
  // intentionally not a dep: the End-case prefill sets the dentist
  // programmatically, and a pending Start is already re-validated by
  // effectiveOrthoAction + the submit confirmation.
  useEffect(() => {
    setOrthoAction(null)
  }, [clientId])

  const liveTotal = useMemo(() => {
    const prices = items
      .map((i) => (i.price.trim() === '' ? null : Number(i.price)))
      .filter((p): p is number => p !== null && !Number.isNaN(p))
    return prices.length === 0 ? null : prices.reduce((a, b) => a + b, 0)
  }, [items])

  // Create-mode default: keep a single cash row pinned to the live items
  // total until the user manually edits the payment section (paymentIsAuto
  // flips to false in that case — see addPayment/removePayment/patchPayment).
  useEffect(() => {
    if (!paymentIsAuto) return
    setPayments([{ type: 'cash', amount: liveTotal === null ? '' : String(liveTotal) }])
  }, [liveTotal, paymentIsAuto])

  const addItem = () =>
    setItems((prev) => [...prev, { type: '', data: {}, price: '' }])
  const removeItem = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index))
  const patchItem = (index: number, patch: Partial<ItemRow>) =>
    setItems((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const paymentsTotal = useMemo(
    () =>
      payments.reduce((sum, p) => {
        const n = Number(p.amount);
        return sum + (Number.isNaN(n) ? 0 : n);
      }, 0),
    [payments],
  )
  const addPayment = () => {
    setPaymentIsAuto(false)
    setPayments((prev) => [...prev, { type: '', amount: '' }])
  }
  const removePayment = (index: number) => {
    setPaymentIsAuto(false)
    setPayments((prev) => prev.filter((_, i) => i !== index))
  }
  const patchPayment = (index: number, patch: Partial<PaymentRow>) => {
    setPaymentIsAuto(false)
    setPayments((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const addLabWork = () => setLabWorks((prev) => [...prev, { type: '', companyId: '', cost: '', typeDescription: '' }])
  const removeLabWork = (index: number) =>
    setLabWorks((prev) => prev.filter((_, i) => i !== index))
  const patchLabWork = (index: number, patch: Partial<LabWorkRow>) =>
    setLabWorks((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  // Past-day lock: a non-SUPER_ADMIN editing a record dated before today can't
  // see or change cost, or change the item set (the date field is locked
  // separately, below). `!lockItems` doubles as "cost is visible" in every
  // case (create mode, today's record, or SUPER_ADMIN).
  const visitIsToday =
    !!record &&
    toDateInput(record.treatmentDate) === todayStr
  const lockItems = !isSuperAdmin && !!record && !visitIsToday

  // Ortho-case panel derivations.
  const selectedDentist = dentists.find((d) => d.id === dentistId)
  const selectedDentistIsOrtho = selectedDentist?.isOrthoDent ?? false
  const clientHasOrtho = (clientOrtho?.orthoDentId ?? null) !== null
  const showOrthoPanel =
    clientOrtho !== null && (selectedDentistIsOrtho || clientHasOrtho)
  // Guard the toggle against stale state (e.g. dentist changed after checking).
  const effectiveOrthoAction: 'start' | 'end' | null = !showOrthoPanel
    ? null
    : orthoAction === 'end' && clientHasOrtho
      ? 'end'
      : orthoAction === 'start' && !clientHasOrtho && selectedDentistIsOrtho
        ? 'start'
        : null

  const doSubmit = async (payload: TreatmentInput) => {
    setSubmitting(true)
    try {
      if (record) {
        await api.put(`/api/treatments/${record.id}`, payload)
        toast({ title: t('form.savedSuccess') })
      } else {
        await api.post('/api/treatments', payload)
        toast({ title: t('form.createdSuccess') })
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = () => {
    // Header validation
    const hErr: Record<string, string> = {}
    if (!clientId) hErr.clientId = t('form.clientRequired')
    if (!dentistId) hErr.dentistId = t('form.dentistRequired')
    if (!treatmentDate) hErr.treatmentDate = t('form.dateRequired')
    setHeaderErrors(hErr)

    // Per-item validation
    const iErr = items.map((it) =>
      !it.type
        ? { type: t('form.itemTypeRequired') }
        : validateTreatmentItem(it.type, it.data)
    )
    setItemErrors(iErr)

    const hasError =
      Object.keys(hErr).length > 0 ||
      iErr.some((e) => Object.keys(e).length > 0)
    if (hasError) return

    // Cost validation — every record needs a known non-negative total (also
    // enforced server-side). Skipped when cost isn't visible/editable.
    setCostError('')
    if (!lockItems && (liveTotal === null || liveTotal < 0 || items.some(i =>
      i.price.trim() !== '' && (!Number.isFinite(Number(i.price)) || Number(i.price) < 0)
    ))) {
      setCostError(t('form.totalCostMustBeNonNegative'))
      return
    }

    // Payment validation — at least one row is now mandatory, every row
    // needs a type + positive amount, and the sum must match the items'
    // total exactly (also enforced server-side; compared in cents to avoid
    // floating-point mismatches).
    setPaymentError('')
    if (!lockItems && liveTotal !== 0) {
      if (payments.length === 0) {
        setPaymentError(t('form.paymentRequired'))
        return
      }
      const invalidRow = payments.some(
        (p) => !p.type || !p.amount.trim() || Number.isNaN(Number(p.amount)) || Number(p.amount) <= 0,
      )
      if (invalidRow) {
        setPaymentError(t('form.paymentRowIncomplete'))
        return
      }
      const itemsTotalCents = Math.round((liveTotal ?? 0) * 100)
      const paymentsTotalCents = Math.round(paymentsTotal * 100)
      if (itemsTotalCents !== paymentsTotalCents) {
        setPaymentError(
          t('form.paymentTotalMismatch', {
            paid: formatBaht(paymentsTotal),
            total: formatBaht(liveTotal ?? 0),
          }),
        )
        return
      }
    }

    // Validate new lab jobs in both create and edit modes.
    setLabWorkError('')
    if (labWorks.some((lw) => !lw.type || !lw.companyId)) {
      setLabWorkError(t('labWork:companyAndTypeRequired'))
      return
    }

    if (labWorks.some((lw) => lw.type === 'other' && (!lw.typeDescription.trim() || lw.typeDescription.trim().length > 200))) {
      setLabWorkError(t('form.labOtherRequired'))
      return
    }
    if (labWorks.some((lw) => lw.cost.trim() !== '' &&
      (!Number.isFinite(Number(lw.cost)) || Number(lw.cost) < 0 || Number(lw.cost) > 99999999.99))) {
      setLabWorkError(t('form.invalidLabCost'))
      return
    }

    const payload: TreatmentInput = {
      clientId,
      dentistId,
      treatmentDate,
      note: note.trim() || null,
      items: items.map((i) => ({
        type: i.type,
        data: i.data,
        price: i.price.trim() === '' ? null : Number(i.price),
      })),
      payments: lockItems
        ? undefined
        : liveTotal === 0 ? [] : payments.map((p) => ({ type: p.type as PaymentType, amount: Number(p.amount) })),
      labWorks: labWorks.map((lw) => ({ type: lw.type as LabWorkType, companyId: lw.companyId,
        ...(lw.type === 'other' ? { typeDescription: lw.typeDescription.trim() } : {}),
        ...(canEnterLabCost && lw.cost.trim() !== '' ? { cost: Number(lw.cost) } : {}),
      })),
      orthoCaseAction: effectiveOrthoAction,
    }

    // Mutating the client's ortho dentist gets an explicit confirmation.
    if (effectiveOrthoAction) {
      setPendingPayload(payload)
      setConfirmOrtho(true)
      return
    }
    void doSubmit(payload)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : attemptClose())}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {record ? t('form.editTitle') : t('form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Header fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('form.patient')}</Label>
              {lockedClient && !record ? (
                <Input value={clientLabel} disabled readOnly />
              ) : (
                <ClientCombobox
                  value={clientId}
                  displayLabel={clientLabel}
                  onChange={(id, label, client) => {
                    setClientId(id)
                    setClientLabel(label)
                    setClientOrtho(
                      client
                        ? { orthoDentId: client.orthoDentId, orthoDent: client.orthoDent }
                        : null
                    )
                  }}
                  error={headerErrors.clientId}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>{t('form.dentist')}</Label>
              <Select
                value={dentistId || undefined}
                onValueChange={setDentistId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('form.selectDentist')} />
                </SelectTrigger>
                <SelectContent>
                  {dentistOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {headerErrors.dentistId && (
                <p className="text-sm text-destructive">{headerErrors.dentistId}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t('form.treatmentDate')}</Label>
              <Input
                type="date"
                value={treatmentDate}
                disabled={!isSuperAdmin}
                onChange={(e) => setTreatmentDate(e.target.value)}
              />
              {headerErrors.treatmentDate && (
                <p className="text-sm text-destructive">
                  {headerErrors.treatmentDate}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t('form.note')}</Label>
              <Textarea
                rows={1}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {/* Ortho case start/end — mutates the client's assigned orthodontist */}
          {showOrthoPanel && (
            <div className="rounded-md border border-teal-200 bg-teal-50/60 p-3">
              <p className="text-sm text-gray-700">
                {clientHasOrtho ? (
                  <>
                    {t('form.currentOrthoCase')}{' '}
                    <span className="font-medium text-gray-900">
                      {clientOrtho?.orthoDent?.name ?? '—'}
                    </span>
                  </>
                ) : (
                  t('form.noOrthoCaseYet')
                )}
              </p>
              {clientHasOrtho ? (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={orthoAction === 'end'}
                    onCheckedChange={(c) => {
                      if (c === true) {
                        setOrthoAction('end')
                        // Credit the closing visit to the ortho dentist (overridable).
                        if (clientOrtho?.orthoDent) setDentistId(clientOrtho.orthoDent.id)
                      } else {
                        setOrthoAction(null)
                      }
                    }}
                  />
                  <span>
                    {t('form.endOrthoCaseLabel', { name: clientOrtho?.orthoDent?.name ?? '' })}
                  </span>
                </label>
              ) : (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={orthoAction === 'start'}
                    onCheckedChange={(c) => setOrthoAction(c === true ? 'start' : null)}
                  />
                  <span>
                    {t('form.startOrthoCaseLabel', { name: selectedDentist?.name ?? '' })}
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-base">{t('form.items')}</Label>
              {!lockItems && (
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4" />
                  {t('form.addItem')}
                </Button>
              )}
            </div>

            {lockItems && (
              <p className="mb-2 text-xs text-amber-600">
                {t('form.pastDayLockNotice')}
              </p>
            )}

            <div className="space-y-3">
              {items.map((item, index) => {
                const FormComp = item.type
                  ? treatmentItemComponentMap[item.type]
                  : null
                const errs = itemErrors[index] ?? {}
                return (
                  <div
                    key={index}
                    className="rounded-md border border-gray-200 bg-gray-50/50 p-3"
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-48 flex-1 space-y-1">
                        <Select
                          value={item.type || undefined}
                          onValueChange={(type) =>
                            // Changing type clears the detail and price — when
                            // locked, price isn't shown/edited anyway and the
                            // server ignores whatever is submitted for it.
                            patchItem(index, { type, data: {}, price: '' })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('form.selectTreatmentType')} />
                          </SelectTrigger>
                          <SelectContent>
                            {treatmentTypes.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {t(opt.text)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errs.type && (
                          <p className="text-sm text-destructive">{errs.type}</p>
                        )}
                      </div>
                      {!lockItems && (
                        <div className="w-32 space-y-1">
                          <Input
                            inputMode="decimal"
                            placeholder={t('form.pricePlaceholder')}
                            value={item.price}
                            onChange={(e) =>
                              patchItem(index, { price: e.target.value })
                            }
                          />
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={lockItems || items.length <= 1}
                        onClick={() => removeItem(index)}
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>

                    {FormComp && (
                      <div className="mt-3">
                        <FormComp
                          key={index + item.type}
                          value={item.data}
                          onChange={(data) => patchItem(index, { data })}
                          error={errs}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {!lockItems && liveTotal !== null && (
              <div className="mt-3 text-right text-sm font-medium text-gray-900">
                {t('form.itemsTotal')} ฿ {formatBaht(liveTotal)}
              </div>
            )}
            {!lockItems && costError && (
              <p className="mt-2 text-right text-sm text-destructive">{costError}</p>
            )}
          </div>

          {/* Payments — required for positive totals, and the sum must match
              the items' total exactly. Defaults to a single auto-tracking
              cash row in create mode (see paymentIsAuto). Hidden entirely
              when cost isn't visible/editable (same condition as the price
              inputs above). */}
          {!lockItems && liveTotal === 0 && (
            <p className="text-sm text-gray-500">{t('form.zeroCostNoPayment')}</p>
          )}
          {!lockItems && liveTotal !== 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-base">{t('form.payments')}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addPayment}>
                  <Plus className="h-4 w-4" />
                  {t('form.addPayment')}
                </Button>
              </div>

              <div className="space-y-2">
                {payments.map((p, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <div className="min-w-40 flex-1">
                      <Select
                        value={p.type || undefined}
                        onValueChange={(type) => patchPayment(index, { type })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('form.paymentType')} />
                        </SelectTrigger>
                        <SelectContent>
                          {paymentTypeOptions
                            .filter(
                              (o) =>
                                o.value === p.type ||
                                !payments.some(
                                  (other, i) => i !== index && other.type === o.value,
                                ),
                            )
                            .map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {t(o.label)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-32">
                      <Input
                        inputMode="decimal"
                        placeholder={t('form.paymentAmountPlaceholder')}
                        value={p.amount}
                        onChange={(e) => patchPayment(index, { amount: e.target.value })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={payments.length <= 1}
                      onClick={() => removePayment(index)}
                    >
                      <X className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="mt-3 text-right text-sm font-medium text-gray-900">
                {t('form.paymentsTotal')} ฿ {formatBaht(paymentsTotal)}
              </div>
              {paymentError && (
                <p className="mt-2 text-sm text-destructive">{paymentError}</p>
              )}
            </div>
          )}

          {/* New jobs are appended; existing jobs are managed on the Lab Work page. */}
          {(
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-base">{t(record ? 'form.newLabWorkItems' : 'form.labWorkItems')}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLabWork}>
                  <Plus className="h-4 w-4" />
                  {t('form.addLabWorkItem')}
                </Button>
              </div>

              {record && <p className="mb-2 text-sm text-gray-500">{t('form.labWorkAddHint')}</p>}
              {labWorks.length === 0 ? (
                <p className="text-sm text-gray-400">{t('form.noLabWorkItems')}</p>
              ) : (
                <div className="space-y-2">
                  {labWorks.map((lw, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      {canEnterLabCost && <Input
                        className="w-40"
                        type="number" min="0" max="99999999.99" step="0.01"
                        aria-label={t('form.labCostOptional')}
                        placeholder={t('form.labCostOptional')}
                        value={lw.cost}
                        onChange={(e) => patchLabWork(index, { cost: e.target.value })}
                      />}
                      <LabCompanySelect value={lw.companyId} onChange={(companyId) => patchLabWork(index, { companyId })} />
                      <div className="min-w-40 flex-1">
                        <Select
                          value={lw.type || undefined}
                          onValueChange={(type) => patchLabWork(index, { type })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('form.selectLabWorkType')} />
                          </SelectTrigger>
                          <SelectContent>
                            {labWorkTypeOptions.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {t(o.label)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {lw.type === 'other' && <Input
                        className="min-w-40 flex-1" required maxLength={200}
                        aria-label={t('form.labOtherDescription')}
                        placeholder={t('form.labOtherDescription')}
                        value={lw.typeDescription}
                        onChange={(e) => patchLabWork(index, { typeDescription: e.target.value })}
                      />}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLabWork(index)}
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {labWorkError && (
                <p className="mt-2 text-sm text-destructive">{labWorkError}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={attemptClose}>
              {t('common:cancel')}
            </Button>
            <Button type="button" disabled={submitting} onClick={handleSubmit}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {record ? t('form.save') : t('form.addRecord')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={t('form.unsavedChangesTitle')}
        description={t('form.unsavedChangesDescription')}
        confirmLabel={t('form.close')}
        destructive
        onConfirm={() => {
          setConfirmClose(false)
          onOpenChange(false)
        }}
      />

      <ConfirmDialog
        open={confirmOrtho}
        onOpenChange={setConfirmOrtho}
        title={effectiveOrthoAction === 'start' ? t('form.startOrthoCaseTitle') : t('form.endOrthoCaseTitle')}
        description={
          effectiveOrthoAction === 'start'
            ? t('form.confirmStartOrtho', { name: selectedDentist?.name ?? '' })
            : t('form.confirmEndOrtho', { name: clientOrtho?.orthoDent?.name ?? '' })
        }
        confirmLabel={t('common:confirm')}
        onConfirm={() => {
          setConfirmOrtho(false)
          if (pendingPayload) void doSubmit(pendingPayload)
        }}
      />
    </Dialog>
  )
}
