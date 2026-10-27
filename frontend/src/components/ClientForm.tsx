import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { useClients } from '@/hooks/useClients'
import { useToast } from '@/hooks/useToast'
import type { Client, ClientInput, Dentist } from '@/types'
import { getApiErrorMessage } from '@/lib/apiError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ThaiAddressFields,
  type ThaiAddressValue,
} from '@/components/ThaiAddressFields'

// A trimmed client record returned by the duplicate-check endpoint.
interface DuplicateClient {
  id: string
  hn: string
  nameTitle: string
  firstName: string
  lastName: string
  nationalId: string | null
  birthday: string
}

interface DuplicateResult {
  nationalIdMatch: DuplicateClient | null
  nameMatches: DuplicateClient[]
}

// dd/mm/(year+543) — Thai Buddhist display date.
function formatBirthday(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${String(d.getDate()).padStart(2, '0')}/${String(
    d.getMonth() + 1,
  ).padStart(2, '0')}/${d.getFullYear() + 543}`
}

// Values stay the literal Thai text stored in the database (nameTitle/gender
// are plain string columns) regardless of UI language — only the label shown
// in the picker is translated, via NAME_TITLE_KEYS/GENDER_KEYS below. This
// keeps every patient record's stored value consistent no matter which
// language was active when it was entered.
const NAME_TITLES = ['นาย', 'นาง', 'นางสาว', 'เด็กหญิง', 'เด็กชาย', 'อื่นๆ'] as const
const STANDARD_TITLES: string[] = ['นาย', 'นาง', 'นางสาว', 'เด็กหญิง', 'เด็กชาย']
const OTHER_TITLE = 'อื่นๆ'
const NAME_TITLE_KEYS: Record<string, string> = {
  'นาย': 'nameTitle.mr',
  'นาง': 'nameTitle.mrs',
  'นางสาว': 'nameTitle.miss',
  'เด็กหญิง': 'nameTitle.girl',
  'เด็กชาย': 'nameTitle.boy',
  'อื่นๆ': 'nameTitle.other',
}
const GENDERS = ['ชาย', 'หญิง', 'อื่นๆ'] as const
const GENDER_KEYS: Record<string, string> = {
  'ชาย': 'gender.male',
  'หญิง': 'gender.female',
  'อื่นๆ': 'gender.other',
}
const EMPTY_ADDRESS: ThaiAddressValue = {
  subDistrict: '',
  district: '',
  province: '',
  zipCode: '',
}

// yyyy-mm-dd for a native date input.
function toDateInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

const clientSchema = z.object({
  nameTitle: z.string().min(1, 'clients:form.nameTitleRequired'),
  firstName: z.string().min(1, 'clients:form.firstNameRequired'),
  lastName: z.string().min(1, 'clients:form.lastNameRequired'),
  gender: z.string().min(1, 'clients:form.genderRequired'),
  birthday: z.string().min(1, 'clients:form.birthdayRequired'),
  phoneNumber: z.string().min(1, 'clients:form.phoneRequired'),
  nationalId: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{13}$/.test(v), 'clients:form.nationalIdLength'),
  orthoDentId: z.string().optional(),
  addressDetail: z.string().optional(),
  medCon: z.string().optional(),
  drugAllergy: z.string().optional(),
  drugEat: z.string().optional(),
})
type ClientFormValues = z.infer<typeof clientSchema>

// Initial form values from a client (or blank on create). Used as RHF
// defaultValues so every field — including the unregistered `nameTitle` — is in
// the form state from the first render.
function toFormValues(client: Client | null): ClientFormValues {
  return {
    nameTitle: client?.nameTitle ?? '',
    firstName: client?.firstName ?? '',
    lastName: client?.lastName ?? '',
    gender: client?.gender ?? '',
    birthday: client ? toDateInput(client.birthday) : '',
    phoneNumber: client?.phoneNumber ?? '',
    nationalId: client?.nationalId ?? '',
    orthoDentId: client?.orthoDentId ?? '',
    addressDetail: client?.addressDetail ?? '',
    medCon: client?.medCon ?? '',
    drugAllergy: client?.drugAllergy ?? '',
    drugEat: client?.drugEat ?? '',
  }
}

function initialAddress(client: Client | null): ThaiAddressValue {
  if (!client) return EMPTY_ADDRESS
  return {
    subDistrict: client.addressSubDistrict ?? '',
    district: client.addressDistrict ?? '',
    province: client.addressProvince ?? '',
    zipCode: client.addressZipCode ?? '',
  }
}

// A non-standard saved title (incl. legacy literal "อื่นๆ") opens as the "อื่นๆ"
// choice with the free-text box pre-filled.
function initialTitle(client: Client | null): { choice: string; custom: string } {
  const t = client?.nameTitle ?? ''
  if (!t) return { choice: '', custom: '' }
  if (STANDARD_TITLES.includes(t)) return { choice: t, custom: '' }
  return { choice: OTHER_TITLE, custom: t }
}

export interface ClientFormHandle {
  submit: () => Promise<void>
  isDirty: () => boolean
}

interface ClientFormProps {
  client: Client | null
  orthoDentists: Dentist[]
  onSaved: (saved: Client) => void
  // Create only: the pre-reserved HN to display + save (managed by the parent).
  reservedHn?: string
  hnVersion?: number
  reserving?: boolean
}

// The full client create/edit form (fields only — the container renders the
// Save/Cancel buttons and calls `submit()` via the ref). Used by both the
// create modal and the client detail page's edit mode.
export const ClientForm = forwardRef<ClientFormHandle, ClientFormProps>(
  function ClientForm(
    { client, orthoDentists, onSaved, reservedHn = '', hnVersion, reserving = false },
    ref
  ) {
    const { t } = useTranslation('clients')
    const { createClient, updateClient } = useClients()
    const { toast } = useToast()
    const [address, setAddress] = useState<ThaiAddressValue>(() =>
      initialAddress(client)
    )
    const [addressDirty, setAddressDirty] = useState(false)
    const [addressErrors, setAddressErrors] = useState<
      Partial<Record<keyof ThaiAddressValue, string>>
    >({})
    const [titleChoice, setTitleChoice] = useState(() => initialTitle(client).choice)
    const [customTitle, setCustomTitle] = useState(() => initialTitle(client).custom)

    const {
      register,
      handleSubmit,
      setValue,
      watch,
      formState: { errors, isDirty },
    } = useForm<ClientFormValues>({
      resolver: zodResolver(clientSchema),
      defaultValues: toFormValues(client),
    })

    const gender = watch('gender')
    const orthoDentId = watch('orthoDentId')
    const nationalId = watch('nationalId')
    const dirty = isDirty || addressDirty

    const isCreate = !client
    // Live national-ID duplicate check: when the field reaches 13 digits (create
    // only), look it up and surface an inline error immediately.
    const [natIdDup, setNatIdDup] = useState<DuplicateClient | null>(null)
    // Same first+last name warning, shown as a confirm dialog on submit.
    const [nameDup, setNameDup] = useState<{
      payload: ClientInput
      matches: DuplicateClient[]
    } | null>(null)
    const [savingAnyway, setSavingAnyway] = useState(false)

    useEffect(() => {
      if (!isCreate) return
      const nid = (nationalId ?? '').trim()
      if (!/^\d{13}$/.test(nid)) {
        setNatIdDup(null)
        return
      }
      let active = true
      api
        .get<DuplicateResult>('/api/clients/check-duplicate', {
          params: { nationalId: nid },
        })
        .then((r) => {
          if (active) setNatIdDup(r.data.nationalIdMatch)
        })
        .catch(() => {
          if (active) setNatIdDup(null)
        })
      return () => {
        active = false
      }
    }, [nationalId, isCreate])

    const orthoDentOptions = useMemo(() => {
      const list = orthoDentists.map((d) => ({ id: d.id, name: d.name }))
      if (client?.orthoDent && !list.some((d) => d.id === client.orthoDent!.id)) {
        list.unshift({
          id: client.orthoDent.id,
          name: `${client.orthoDent.name} ${t('treatments:form.inactiveSuffix')}`,
        })
      }
      return list
    }, [orthoDentists, client, t])

    const handleAddressChange = (next: ThaiAddressValue) => {
      setAddress(next)
      setAddressDirty(true)
    }
    const handleTitleChoice = (choice: string) => {
      setTitleChoice(choice)
      setValue('nameTitle', choice === OTHER_TITLE ? customTitle : choice, {
        shouldValidate: true,
        shouldDirty: true,
      })
    }
    const handleCustomTitle = (text: string) => {
      setCustomTitle(text)
      setValue('nameTitle', text, { shouldValidate: true, shouldDirty: true })
    }

    // Address is all-or-nothing.
    const validateAddress = (): boolean => {
      const filled = Object.values(address).filter((v) => v.trim() !== '')
      if (filled.length === 0 || filled.length === 4) {
        setAddressErrors({})
        return true
      }
      const errs: Partial<Record<keyof ThaiAddressValue, string>> = {}
      ;(Object.keys(address) as (keyof ThaiAddressValue)[]).forEach((k) => {
        if (!address[k].trim()) errs[k] = t('form.addressIncomplete')
      })
      setAddressErrors(errs)
      return false
    }

    // Persist a client (create or update) and notify the container.
    const persist = async (payload: ClientInput) => {
      try {
        const saved = client
          ? await updateClient(client.id, payload)
          : await createClient(payload)
        toast({ title: client ? t('form.savedSuccess') : t('form.createdSuccess') })
        onSaved(saved)
      } catch (err) {
        toast({ variant: 'destructive', title: getApiErrorMessage(err) })
      }
    }

    const onSubmit = async (values: ClientFormValues) => {
      if (!validateAddress()) return
      const hasAddress = Object.values(address).every((v) => v.trim() !== '')
      const payload: ClientInput = {
        hn: client ? undefined : reservedHn || undefined,
        hnVersion: client ? undefined : hnVersion,
        nameTitle: values.nameTitle,
        firstName: values.firstName,
        lastName: values.lastName,
        gender: values.gender,
        birthday: values.birthday,
        phoneNumber: values.phoneNumber,
        nationalId: values.nationalId || null,
        orthoDentId: values.orthoDentId || null,
        addressSubDistrict: hasAddress ? address.subDistrict : null,
        addressDistrict: hasAddress ? address.district : null,
        addressProvince: hasAddress ? address.province : null,
        addressZipCode: hasAddress ? address.zipCode : null,
        // Independent of the structured address — not part of the all-4 rule.
        addressDetail: values.addressDetail?.trim() || null,
        medCon: values.medCon || null,
        drugAllergy: values.drugAllergy || null,
        drugEat: values.drugEat || null,
      }

      // On edit, save directly (the server still guards national-ID uniqueness).
      if (client) {
        await persist(payload)
        return
      }

      // On create, run a duplicate check before saving.
      let dup: DuplicateResult | null = null
      try {
        const r = await api.get<DuplicateResult>('/api/clients/check-duplicate', {
          params: {
            nationalId: values.nationalId || '',
            firstName: values.firstName,
            lastName: values.lastName,
          },
        })
        dup = r.data
      } catch {
        dup = null // fail open — the server still enforces national-ID uniqueness
      }

      // Hard block: national ID already exists.
      if (dup?.nationalIdMatch) {
        setNatIdDup(dup.nationalIdMatch)
        toast({
          variant: 'destructive',
          title: t('form.nationalIdExists', { hn: dup.nationalIdMatch.hn }),
        })
        return
      }

      // Soft warning: same first + last name — let the user decide.
      if (dup?.nameMatches && dup.nameMatches.length > 0) {
        setNameDup({ payload, matches: dup.nameMatches })
        return
      }

      await persist(payload)
    }

    const confirmSaveAnyway = async () => {
      if (!nameDup) return
      setSavingAnyway(true)
      try {
        await persist(nameDup.payload)
      } finally {
        setSavingAnyway(false)
        setNameDup(null)
      }
    }

    // Expose submit/isDirty to the container; use refs so the latest closure runs.
    const onSubmitRef = useRef(onSubmit)
    onSubmitRef.current = onSubmit
    const dirtyRef = useRef(dirty)
    dirtyRef.current = dirty
    useImperativeHandle(
      ref,
      () => ({
        submit: () => handleSubmit((v) => onSubmitRef.current(v))(),
        isDirty: () => dirtyRef.current,
      }),
      [handleSubmit]
    )

    return (
      <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* HN — reserved up front on create so it can be written on paper */}
        <div className="space-y-2">
          <Label>HN</Label>
          <Input
            value={
              client
                ? client.hn
                : reserving
                  ? t('form.issuingHn')
                  : reservedHn || t('form.hnAutoGenerated')
            }
            readOnly
            disabled
            className="bg-gray-50 font-mono text-base font-semibold text-gray-900"
          />
          {!client && reservedHn && (
            <p className="text-xs text-blue-600">
              {t('form.hnReservedNotice')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>{t('form.title')}</Label>
            <Select value={titleChoice || undefined} onValueChange={handleTitleChoice}>
              <SelectTrigger>
                <SelectValue placeholder={t('form.select')} />
              </SelectTrigger>
              <SelectContent>
                {NAME_TITLES.map((title) => (
                  <SelectItem key={title} value={title}>
                    {t(NAME_TITLE_KEYS[title])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {titleChoice === OTHER_TITLE && (
              <Input
                placeholder={t('form.customTitlePlaceholder')}
                value={customTitle}
                onChange={(e) => handleCustomTitle(e.target.value)}
              />
            )}
            {errors.nameTitle && (
              <p className="text-sm text-destructive">
                {titleChoice === OTHER_TITLE
                  ? t('form.customTitleRequired')
                  : t(errors.nameTitle.message as string)}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="firstName">{t('form.firstName')}</Label>
            <Input id="firstName" {...register('firstName')} />
            {errors.firstName && (
              <p className="text-sm text-destructive">{t(errors.firstName.message as string)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">{t('form.lastName')}</Label>
            <Input id="lastName" {...register('lastName')} />
            {errors.lastName && (
              <p className="text-sm text-destructive">{t(errors.lastName.message as string)}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>{t('form.gender')}</Label>
            <RadioGroup
              className="flex gap-4 pt-2"
              value={gender || ''}
              onValueChange={(v) => setValue('gender', v, { shouldValidate: true })}
            >
              {GENDERS.map((g) => (
                <label key={g} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={g} /> {t(GENDER_KEYS[g])}
                </label>
              ))}
            </RadioGroup>
            {errors.gender && (
              <p className="text-sm text-destructive">{t(errors.gender.message as string)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="birthday">{t('form.birthday')}</Label>
            <Input id="birthday" type="date" {...register('birthday')} />
            {errors.birthday && (
              <p className="text-sm text-destructive">{t(errors.birthday.message as string)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">{t('form.phoneNumber')}</Label>
            <Input id="phoneNumber" {...register('phoneNumber')} />
            {errors.phoneNumber && (
              <p className="text-sm text-destructive">{t(errors.phoneNumber.message as string)}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nationalId">{t('form.nationalId')}</Label>
            <Input id="nationalId" maxLength={13} {...register('nationalId')} />
            {errors.nationalId && (
              <p className="text-sm text-destructive">{t(errors.nationalId.message as string)}</p>
            )}
            {natIdDup && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {t('form.nationalIdExists', { hn: natIdDup.hn })} — {natIdDup.firstName}{' '}
                {natIdDup.lastName}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>{t('form.orthoDentist')}</Label>
            <Select
              value={orthoDentId || undefined}
              onValueChange={(v) =>
                setValue('orthoDentId', v === '__none__' ? '' : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t('form.notSpecified')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('form.notSpecified')}</SelectItem>
                {orthoDentOptions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-gray-900">{t('form.address')}</Label>
          <div className="space-y-2">
            <Label htmlFor="addressDetail" className="font-normal text-gray-600">
              {t('form.addressDetail')}
            </Label>
            <Input
              id="addressDetail"
              placeholder={t('form.addressDetailPlaceholder')}
              {...register('addressDetail')}
            />
          </div>
          <ThaiAddressFields
            value={address}
            onChange={handleAddressChange}
            errors={addressErrors}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="medCon">{t('form.medicalConditions')}</Label>
            <Textarea id="medCon" rows={2} {...register('medCon')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="drugAllergy">{t('form.drugAllergies')}</Label>
            <Textarea id="drugAllergy" rows={2} {...register('drugAllergy')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="drugEat">{t('form.currentMedications')}</Label>
            <Textarea id="drugEat" rows={2} {...register('drugEat')} />
          </div>
        </div>
      </form>

      {/* Same first + last name — confirm before saving a possible duplicate */}
      <Dialog open={!!nameDup} onOpenChange={(o) => !o && setNameDup(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t('form.duplicateNameTitle')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {t('form.duplicateNameWarning', {
              countSuffix:
                nameDup && nameDup.matches.length > 1
                  ? t('form.duplicateCountSuffix', { count: nameDup.matches.length })
                  : '',
            })}
          </p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {nameDup?.matches.map((m) => (
              <div
                key={m.id}
                className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm"
              >
                <div className="font-medium text-gray-900">
                  {m.nameTitle}
                  {m.firstName} {m.lastName}{' '}
                  <span className="font-mono text-xs text-gray-500">({m.hn})</span>
                </div>
                <div className="mt-1 grid grid-cols-1 gap-x-4 text-xs text-gray-600 sm:grid-cols-2">
                  <span>{t('form.duplicateNationalIdLabel')} {m.nationalId ?? '-'}</span>
                  <span>{t('form.duplicateBirthdayLabel')} {formatBirthday(m.birthday)}</span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDup(null)}>
              {t('common:cancel')}
            </Button>
            <Button onClick={confirmSaveAnyway} disabled={savingAnyway}>
              {t('form.saveAsNew')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
    )
  }
)
