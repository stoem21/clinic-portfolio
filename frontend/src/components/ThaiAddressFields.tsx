import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useLanguageStore } from '@/stores/languageStore'
import {
  ensureAddressDataLoaded,
  listDistricts,
  listSubDistricts,
  searchProvinces,
} from '@/lib/thaiAddress'

export interface ThaiAddressValue {
  subDistrict: string
  district: string
  province: string
  zipCode: string
}

interface ThaiAddressFieldsProps {
  value: ThaiAddressValue
  onChange: (value: ThaiAddressValue) => void
  errors?: Partial<Record<keyof ThaiAddressValue, string>>
}

type Field = 'province' | 'district' | 'subDistrict'

interface Suggestion {
  key: string
  label: string
  onSelect: () => void
}

// Cascading Thai address picker: choose province → district (scoped to the
// province) → sub-district (scoped to the district), then the postal code is
// filled in automatically. Labels/suggestions switch between Thai and
// English names together, driven by the active UI language — both are real
// values from the underlying dataset, not a translation of one or the other.
export function ThaiAddressFields({
  value,
  onChange,
  errors,
}: ThaiAddressFieldsProps) {
  const { t } = useTranslation('clients')
  const lang = useLanguageStore((s) => s.language)
  const baseId = useId()
  const [openField, setOpenField] = useState<Field | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [, setAddressDataReady] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The address dataset (~7,400 entries) is lazily loaded rather than
  // shipped in the main bundle — start the fetch as soon as this section
  // mounts, and re-render once it's ready so any already-typed text gets
  // suggestions.
  useEffect(() => {
    let cancelled = false
    ensureAddressDataLoaded().then(() => {
      if (!cancelled) setAddressDataReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const anyFilled =
    !!value.subDistrict ||
    !!value.district ||
    !!value.province ||
    !!value.zipCode

  // Available scoped options (also used to enable/disable downstream fields).
  const districtsAvail = value.province ? listDistricts(value.province, lang) : []
  const subAvail =
    value.province && value.district
      ? listSubDistricts(value.province, value.district, lang)
      : []

  // Selecting a value cascades: changing one level clears the levels below it.
  const selectProvince = (province: string) => {
    onChange({ province, district: '', subDistrict: '', zipCode: '' })
    close()
  }
  const selectDistrict = (district: string) => {
    onChange({ ...value, district, subDistrict: '', zipCode: '' })
    close()
  }
  const selectSubDistrict = (subDistrict: string, zipCode: string) => {
    onChange({ ...value, subDistrict, zipCode })
    close()
  }

  const close = () => {
    setOpenField(null)
    setSuggestions([])
  }

  const compute = (field: Field, text: string): Suggestion[] => {
    if (field === 'province') {
      return searchProvinces(text, lang).map((p) => ({
        key: p,
        label: p,
        onSelect: () => selectProvince(p),
      }))
    }
    if (field === 'district') {
      if (!value.province) return []
      return listDistricts(value.province, lang, text).map((d) => ({
        key: d,
        label: d,
        onSelect: () => selectDistrict(d),
      }))
    }
    if (!value.district) return []
    return listSubDistricts(value.province, value.district, lang, text).map((s) => ({
      key: `${s.subDistrict}-${s.zipCode}`,
      label: s.zipCode ? `${s.subDistrict}  ·  ${s.zipCode}` : s.subDistrict,
      onSelect: () => selectSubDistrict(s.subDistrict, s.zipCode),
    }))
  }

  const onType = (field: Field, text: string) => {
    onChange({ ...value, [field]: text })
    const s = compute(field, text)
    setSuggestions(s)
    setOpenField(s.length > 0 ? field : null)
  }

  const onFocusField = (field: Field) => {
    const s = compute(field, value[field])
    if (s.length > 0) {
      setSuggestions(s)
      setOpenField(field)
    }
  }

  const closeSoon = () => {
    blurTimer.current = setTimeout(() => setOpenField(null), 150)
  }
  const cancelClose = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current)
  }

  const req = (label: string) => (
    <>
      {label}
      {anyFilled && <span className="ml-0.5 text-destructive">*</span>}
    </>
  )

  const renderField = (
    field: Field,
    label: string,
    placeholder: string,
    disabled: boolean
  ) => (
    <div className="relative space-y-2">
      <Label htmlFor={`${baseId}-${field}`}>{req(label)}</Label>
      <Input
        id={`${baseId}-${field}`}
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        value={value[field]}
        onChange={(e) => onType(field, e.target.value)}
        onFocus={() => onFocusField(field)}
        onBlur={closeSoon}
      />
      {openField === field && suggestions.length > 0 && (
        <ul
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-md"
          onMouseDown={cancelClose}
        >
          {suggestions.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                onClick={s.onSelect}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {errors?.[field] && (
        <p className="text-sm text-destructive">{errors[field]}</p>
      )}
    </div>
  )

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {renderField('province', t('address.province'), t('address.provincePlaceholder'), false)}
      {renderField(
        'district',
        t('address.district'),
        value.province ? t('address.districtPlaceholder') : t('address.districtPlaceholderNoProvince'),
        districtsAvail.length === 0
      )}
      {renderField(
        'subDistrict',
        t('address.subDistrict'),
        value.district ? t('address.subDistrictPlaceholder') : t('address.subDistrictPlaceholderNoDistrict'),
        subAvail.length === 0
      )}
      <div className="space-y-2">
        <Label htmlFor={`${baseId}-zipCode`}>{req(t('address.zipCode'))}</Label>
        <Input
          id={`${baseId}-zipCode`}
          inputMode="numeric"
          readOnly
          placeholder={t('address.zipCodePlaceholder')}
          value={value.zipCode}
          className={cn('bg-gray-50', errors?.zipCode && 'border-destructive')}
        />
        {errors?.zipCode && (
          <p className="text-sm text-destructive">{errors.zipCode}</p>
        )}
      </div>
    </div>
  )
}
