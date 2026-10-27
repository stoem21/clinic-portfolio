import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Download,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserX,
  X,
} from 'lucide-react'

import { useClients } from '@/hooks/useClients'
import { useAuthStore } from '@/stores/authStore'
import { OrthoFollowUp } from '@/components/OrthoFollowUp'
import { useToast } from '@/hooks/useToast'
import type { Client, Dentist } from '@/types'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatThaiDate } from '@/lib/format'
import {
  downloadCsv,
  formatDateBuddhist,
  todayStamp,
  type ExportColumn,
} from '@/lib/exportCsv'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { ErrorCard } from '@/components/ErrorCard'
import { TableSkeleton } from '@/components/TableSkeleton'
import { Pagination } from '@/components/Pagination'
import { ExportDialog } from '@/components/ExportDialog'
import { ClientForm, type ClientFormHandle } from '@/components/ClientForm'

// Built from the active translation at call time (not a module-level
// constant) since ExportDialog renders `col.header` directly as final text.
function getClientExportColumns(t: (key: string) => string): ExportColumn[] {
  return [
    { key: 'hn', header: t('clients:exportColumns.hn') },
    { key: 'nameTitle', header: t('clients:exportColumns.nameTitle') },
    { key: 'firstName', header: t('clients:exportColumns.firstName') },
    { key: 'lastName', header: t('clients:exportColumns.lastName') },
    { key: 'gender', header: t('clients:exportColumns.gender') },
    { key: 'birthdayFormatted', header: t('clients:exportColumns.birthday') },
    { key: 'phoneNumber', header: t('clients:exportColumns.phoneNumber') },
    { key: 'nationalId', header: t('clients:exportColumns.nationalId') },
    { key: 'orthoDentName', header: t('clients:exportColumns.orthoDentist') },
    { key: 'addressDetail', header: t('clients:exportColumns.addressDetail') },
    { key: 'addressSubDistrict', header: t('clients:exportColumns.addressSubDistrict') },
    { key: 'addressDistrict', header: t('clients:exportColumns.addressDistrict') },
    { key: 'addressProvince', header: t('clients:exportColumns.addressProvince') },
    { key: 'addressZipCode', header: t('clients:exportColumns.addressZipCode') },
    { key: 'medCon', header: t('clients:exportColumns.medicalConditions') },
    { key: 'drugAllergy', header: t('clients:exportColumns.drugAllergies') },
    { key: 'drugEat', header: t('clients:exportColumns.currentMedications') },
  ]
}

interface OrthoMissedRow {
  hn: string
  fullName: string
  phoneNumber: string
  lastVisitDate: string | null
}

function prepareClientRow(client: Client): Record<string, any> {
  return {
    hn: client.hn,
    nameTitle: client.nameTitle,
    firstName: client.firstName,
    lastName: client.lastName,
    gender: client.gender,
    birthdayFormatted: formatDateBuddhist(client.birthday),
    phoneNumber: client.phoneNumber,
    nationalId: client.nationalId ?? '',
    orthoDentName: client.orthoDent?.name ?? '',
    addressDetail: client.addressDetail ?? '',
    addressSubDistrict: client.addressSubDistrict ?? '',
    addressDistrict: client.addressDistrict ?? '',
    addressProvince: client.addressProvince ?? '',
    addressZipCode: client.addressZipCode ?? '',
    medCon: client.medCon ?? '',
    drugAllergy: client.drugAllergy ?? '',
    drugEat: client.drugEat ?? '',
  }
}

const PAGE_SIZE = 10

// A clickable column header that drives server-side sorting.
function SortableHead({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string
  sortKey: string
  activeKey: string
  dir: 'asc' | 'desc'
  onSort: (key: string) => void
  className?: string
}) {
  const active = activeKey === sortKey
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-gray-900"
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 text-gray-300" />
        )}
      </button>
    </TableHead>
  )
}

// A single labelled filter input with a clear (×) button.
function FilterInput({
  label,
  placeholder,
  value,
  onChange,
  width,
  withIcon = false,
  inputMode,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  width: string
  withIcon?: boolean
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-500">{label}</Label>
      <div className="relative">
        {withIcon && (
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        )}
        <Input
          className={cn(width, withIcon && 'pl-9', 'pr-9')}
          placeholder={placeholder}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// Debounce a filter input (300ms) into a query state. The query activates only
// on 2+ characters; resets to page 1 whenever the resolved query changes.
function useDebouncedFilter(
  input: string,
  setQuery: React.Dispatch<React.SetStateAction<string>>,
  setPage: React.Dispatch<React.SetStateAction<number>>
) {
  useEffect(() => {
    const handle = setTimeout(() => {
      const trimmed = input.trim()
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
  }, [input, setQuery, setPage])
}

/* ----------------------------------------------------- Create modal ------- */

// Create-only modal; view/edit happen on the dedicated /clients/:id page.
function ClientFormDialog({
  open,
  onOpenChange,
  orthoDentists,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orthoDentists: Dentist[]
  onSaved: () => void
}) {
  const { t } = useTranslation('clients')
  const { reserveHn, releaseHn } = useClients()
  const formRef = useRef<ClientFormHandle>(null)
  const [saving, setSaving] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [reservedHn, setReservedHn] = useState('')
  const [hnVersion, setHnVersion] = useState<number>()
  const versionRef = useRef(0)
  const [reserving, setReserving] = useState(false)
  const reservedRef = useRef('')
  const savedRef = useRef(false)
  // The in-flight release POST from the previous close, so the next open can
  // wait for it before reserving (otherwise reserve+release race and skip HNs).
  const pendingReleaseRef = useRef<Promise<void> | null>(null)

  // Reserve an HN when the modal opens; release it on close if it wasn't saved.
  // Keyed on `open` (the dialog stays mounted) so it fires exactly once per
  // open/close — no double reserve under StrictMode/remounts.
  useEffect(() => {
    if (!open) return
    savedRef.current = false
    reservedRef.current = ''
    setReservedHn('')
    setReserving(true)
    let active = true
    const prevRelease = pendingReleaseRef.current
    ;(async () => {
      try {
        if (prevRelease) await prevRelease // serialize after any pending release
        const { hn, version } = await reserveHn()
        if (!active) return
        setReservedHn(hn)
        setHnVersion(version)
        versionRef.current = version
        reservedRef.current = hn
      } catch {
        if (active) setReservedHn('')
      } finally {
        if (active) setReserving(false)
      }
    })()
    return () => {
      active = false
      if (!savedRef.current && reservedRef.current) {
        pendingReleaseRef.current = releaseHn(reservedRef.current, versionRef.current)
        reservedRef.current = ''
      }
    }
  }, [open, reserveHn, releaseHn])

  const attemptClose = () => {
    if (formRef.current?.isDirty()) setConfirmClose(true)
    else onOpenChange(false)
  }

  const onSave = async () => {
    setSaving(true)
    try {
      await formRef.current?.submit()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : attemptClose())}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('page.addPatient')}</DialogTitle>
        </DialogHeader>

        {open && (
          <ClientForm
            ref={formRef}
            client={null}
            orthoDentists={orthoDentists}
            reservedHn={reservedHn}
            hnVersion={hnVersion}
            reserving={reserving}
            onSaved={() => {
              savedRef.current = true
              onOpenChange(false)
              onSaved()
            }}
          />
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={attemptClose}>
            {t('common:cancel')}
          </Button>
          <Button type="button" disabled={saving} onClick={onSave}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('page.addPatient')}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={t('page.unsavedChangesTitle')}
        description={t('page.unsavedChangesDescription')}
        confirmLabel={t('page.close')}
        destructive
        onConfirm={() => {
          setConfirmClose(false)
          onOpenChange(false)
        }}
      />
    </Dialog>
  )
}

/* ---------------------------------------------------------------- Page ---- */

export default function ClientsPage() {
  const { t } = useTranslation('clients')
  const role = useAuthStore((s) => s.user?.role)
  const [patientTab, setPatientTab] = useState<'all' | 'ortho'>('all')
  const canDelete = role === 'ADMIN' || role === 'SUPER_ADMIN'
  const { fetchClients, deleteClient } = useClients()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [hnInput, setHnInput] = useState('')
  const [hnQuery, setHnQuery] = useState('')
  const [hnFromInput, setHnFromInput] = useState('')
  const [hnFromQuery, setHnFromQuery] = useState('')
  const [hnToInput, setHnToInput] = useState('')
  const [hnToQuery, setHnToQuery] = useState('')
  const [firstNameInput, setFirstNameInput] = useState('')
  const [firstNameQuery, setFirstNameQuery] = useState('')
  const [lastNameInput, setLastNameInput] = useState('')
  const [lastNameQuery, setLastNameQuery] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneQuery, setPhoneQuery] = useState('')
  const [nationalIdInput, setNationalIdInput] = useState('')
  const [nationalIdQuery, setNationalIdQuery] = useState('')
  const [orthoOnly, setOrthoOnly] = useState(false)
  const [sortBy, setSortBy] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [orthoDentists, setOrthoDentists] = useState<Dentist[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Client | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // CSV export
  const [exportOpen, setExportOpen] = useState(false)
  const [exportRows, setExportRows] = useState<Client[]>([])
  const [exportLoading, setExportLoading] = useState(false)

  // Ortho missed-follow-up export
  const [orthoMissedOpen, setOrthoMissedOpen] = useState(false)
  const [orthoMissedMonths, setOrthoMissedMonths] = useState('6')
  const [orthoMissedLoading, setOrthoMissedLoading] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetchClients({
        hn: hnQuery,
        hnFrom: hnFromQuery,
        hnTo: hnToQuery,
        firstName: firstNameQuery,
        lastName: lastNameQuery,
        phoneNumber: phoneQuery,
        nationalId: nationalIdQuery,
        hasOrtho: orthoOnly,
        sortBy: sortBy || undefined,
        sortDir,
        page,
        limit: PAGE_SIZE,
      })
      setClients(res.data)
      setTotal(res.total)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [
    fetchClients,
    hnQuery,
    hnFromQuery,
    hnToQuery,
    firstNameQuery,
    lastNameQuery,
    phoneQuery,
    nationalIdQuery,
    orthoOnly,
    sortBy,
    sortDir,
    page,
  ])

  // Clicking a column header sorts by it; clicking again flips direction.
  const toggleSort = (key: string) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  // Fetch every matching record (not just the current page) then open the picker.
  const startExport = async () => {
    setExportLoading(true)
    try {
      const res = await fetchClients({
        hn: hnQuery,
        hnFrom: hnFromQuery,
        hnTo: hnToQuery,
        firstName: firstNameQuery,
        lastName: lastNameQuery,
        phoneNumber: phoneQuery,
        nationalId: nationalIdQuery,
        hasOrtho: orthoOnly,
        sortBy: sortBy || undefined,
        sortDir,
        page: 1,
        limit: 'all',
      })
      setExportRows(res.data)
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
      const rows = exportRows.map(prepareClientRow)
      await downloadCsv(rows, selected, `clients_export_${todayStamp()}.csv`, 'client')
      setExportOpen(false)
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setExportLoading(false)
    }
  }

  const startOrthoMissedExport = async () => {
    setOrthoMissedLoading(true)
    try {
      const res = await api.get<{ data: OrthoMissedRow[] }>('/api/clients/ortho-missed', {
        params: { months: orthoMissedMonths },
      })
      const rows = res.data.data.map((r) => ({
        hn: r.hn,
        fullName: r.fullName,
        phoneNumber: r.phoneNumber,
        lastVisitDateFormatted: r.lastVisitDate
          ? formatDateBuddhist(r.lastVisitDate)
          : t('page.orthoMissedNeverVisited'),
      }))
      const columns: ExportColumn[] = [
        { key: 'hn', header: t('clients:exportColumns.hn') },
        { key: 'fullName', header: t('page.fullName') },
        { key: 'phoneNumber', header: t('clients:exportColumns.phoneNumber') },
        { key: 'lastVisitDateFormatted', header: t('page.orthoMissedLastVisit') },
      ]
      await downloadCsv(rows, columns, `ortho_missed_${orthoMissedMonths}m_${todayStamp()}.csv`, 'ortho-missed')
      setOrthoMissedOpen(false)
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setOrthoMissedLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [load])

  // Load active ortho dentists once for the create form dropdown.
  useEffect(() => {
    api
      .get<Dentist[]>('/api/dentists', {
        params: { isOrthoDent: true, isActive: true },
      })
      .then((res) => setOrthoDentists(res.data))
      .catch(() => setOrthoDentists([]))
  }, [])

  // Debounce each filter input (300ms, active on 2+ chars) into its query,
  // resetting to page 1 whenever a query actually changes.
  useDebouncedFilter(hnInput, setHnQuery, setPage)
  useDebouncedFilter(hnFromInput, setHnFromQuery, setPage)
  useDebouncedFilter(hnToInput, setHnToQuery, setPage)
  useDebouncedFilter(firstNameInput, setFirstNameQuery, setPage)
  useDebouncedFilter(lastNameInput, setLastNameQuery, setPage)
  useDebouncedFilter(phoneInput, setPhoneQuery, setPage)
  useDebouncedFilter(nationalIdInput, setNationalIdQuery, setPage)

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
      await deleteClient(toDelete.id)
      toast({ title: t('page.deletedSuccess') })
      setToDelete(null)
      // If we removed the last row on a page, step back.
      if (clients.length === 1 && page > 1) setPage((p) => p - 1)
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
      <div className="mb-4 flex gap-2" role="tablist">
        <Button role="tab" aria-selected={patientTab === 'all'} variant={patientTab === 'all' ? 'default' : 'outline'} onClick={() => setPatientTab('all')}>{t('followUp:allPatients')}</Button>
        <Button role="tab" aria-selected={patientTab === 'ortho'} variant={patientTab === 'ortho' ? 'default' : 'outline'} onClick={() => setPatientTab('ortho')}>{t('followUp:tab')}</Button>
      </div>
      {patientTab === 'ortho' && <OrthoFollowUp />}
      <div hidden={patientTab !== 'all'}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{t('page.title')}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={startExport}
            disabled={exportLoading}
          >
            {exportLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t('common:export.exportCsv')}
          </Button>
          <Button variant="outline" onClick={() => setOrthoMissedOpen(true)}>
            <UserX className="h-4 w-4" />
            {t('page.orthoMissedButton')}
          </Button>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('page.addPatient')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FilterInput
          label={t('page.hn')}
          placeholder={t('page.searchHn')}
          value={hnInput}
          onChange={setHnInput}
          width="w-36"
        />
        <FilterInput
          label={t('page.hnFrom')}
          placeholder={t('page.hnFromPlaceholder')}
          value={hnFromInput}
          onChange={setHnFromInput}
          width="w-32"
          inputMode="numeric"
        />
        <FilterInput
          label={t('page.hnTo')}
          placeholder={t('page.hnToPlaceholder')}
          value={hnToInput}
          onChange={setHnToInput}
          width="w-32"
          inputMode="numeric"
        />
        <FilterInput
          label={t('page.firstName')}
          placeholder={t('page.searchFirstName')}
          value={firstNameInput}
          onChange={setFirstNameInput}
          width="w-40"
          withIcon
        />
        <FilterInput
          label={t('page.lastName')}
          placeholder={t('page.searchLastName')}
          value={lastNameInput}
          onChange={setLastNameInput}
          width="w-40"
        />
        <FilterInput
          label={t('page.phone')}
          placeholder={t('page.searchPhone')}
          value={phoneInput}
          onChange={setPhoneInput}
          width="w-44"
          inputMode="tel"
        />
        <FilterInput
          label={t('page.nationalId')}
          placeholder={t('page.searchNationalId')}
          value={nationalIdInput}
          onChange={setNationalIdInput}
          width="w-48"
          inputMode="numeric"
        />

        <label className="flex h-9 cursor-pointer items-center gap-2 self-end text-sm text-gray-700">
          <Checkbox
            checked={orthoOnly}
            onCheckedChange={(v) => {
              setOrthoOnly(v === true)
              setPage(1)
            }}
          />
          {t('page.orthoPatientsOnly')}
        </label>

        {(hnInput ||
          hnFromInput ||
          hnToInput ||
          firstNameInput ||
          lastNameInput ||
          phoneInput ||
          nationalIdInput ||
          orthoOnly) && (
          <Button
            variant="outline"
            onClick={() => {
              setHnInput('')
              setHnFromInput('')
              setHnToInput('')
              setFirstNameInput('')
              setLastNameInput('')
              setPhoneInput('')
              setNationalIdInput('')
              setOrthoOnly(false)
              setPage(1)
            }}
          >
            {t('common:clearFilters')}
          </Button>
        )}
      </div>

      {loadError ? (
        <ErrorCard onRetry={load} />
      ) : (
      <>
      <div className="rounded-md border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label={t('page.hn')} sortKey="hn" activeKey={sortBy} dir={sortDir} onSort={toggleSort} />
              <SortableHead label={t('page.fullName')} sortKey="name" activeKey={sortBy} dir={sortDir} onSort={toggleSort} />
              <SortableHead label={t('page.phone')} sortKey="phoneNumber" activeKey={sortBy} dir={sortDir} onSort={toggleSort} />
              <SortableHead label={t('page.nationalId')} sortKey="nationalId" activeKey={sortBy} dir={sortDir} onSort={toggleSort} />
              <SortableHead label={t('page.gender')} sortKey="gender" activeKey={sortBy} dir={sortDir} onSort={toggleSort} />
              <SortableHead label={t('page.birthday')} sortKey="birthday" activeKey={sortBy} dir={sortDir} onSort={toggleSort} />
              <TableHead>{t('page.orthoDentist')}</TableHead>
              <TableHead className="text-right">{t('common:actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <TableSkeleton cols={8} />
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <EmptyState message={t('page.noPatientsFound')} />
                </TableCell>
              </TableRow>
            ) : (
              clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-gray-900">{c.hn}</TableCell>
                  <TableCell className="font-medium text-gray-900">
                    {c.nameTitle}
                    {c.firstName} {c.lastName}
                  </TableCell>
                  <TableCell>{c.phoneNumber}</TableCell>
                  <TableCell className="font-mono">{c.nationalId || '—'}</TableCell>
                  <TableCell>{c.gender}</TableCell>
                  <TableCell>{formatThaiDate(c.birthday)}</TableCell>
                  <TableCell>{c.orthoDent?.name || '—'}</TableCell>
                  <TableCell>
                    <TooltipProvider delayDuration={200}>
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/clients/${c.id}`)}
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
                              onClick={() =>
                                navigate(`/clients/${c.id}`, {
                                  state: { edit: true },
                                })
                              }
                            >
                              <Pencil className="h-4 w-4 text-gray-600" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('common:edit')}</TooltipContent>
                        </Tooltip>
                        {canDelete && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setToDelete(c)}
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

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
        <span>{rangeText}</span>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
      </>
      )}

      <ClientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        orthoDentists={orthoDentists}
        onSaved={load}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('page.deletePatientTitle')}
        description={
          toDelete
            ? t('page.deletePatientConfirm', {
                name: `${toDelete.nameTitle}${toDelete.firstName} ${toDelete.lastName}`,
                hn: toDelete.hn,
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
        columns={getClientExportColumns(t)}
        onExport={handleExport}
        isLoading={exportLoading}
        recordCount={exportRows.length}
      />

      <Dialog open={orthoMissedOpen} onOpenChange={setOrthoMissedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('page.orthoMissedButton')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t('page.orthoMissedPeriod')}</Label>
            <Select value={orthoMissedMonths} onValueChange={setOrthoMissedMonths}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">{t('page.orthoMissedMonths', { count: 3 })}</SelectItem>
                <SelectItem value="6">{t('page.orthoMissedMonths', { count: 6 })}</SelectItem>
                <SelectItem value="9">{t('page.orthoMissedMonths', { count: 9 })}</SelectItem>
                <SelectItem value="12">{t('page.orthoMissedMonths', { count: 12 })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrthoMissedOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button onClick={startOrthoMissedExport} disabled={orthoMissedLoading}>
              {orthoMissedLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {t('common:export.exportCsv')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}
