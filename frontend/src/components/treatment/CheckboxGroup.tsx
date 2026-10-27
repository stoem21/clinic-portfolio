import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import type { Option } from '@/lib/treatmentOptions'

interface CheckboxGroupProps {
  options: Option[]
  value: string[]
  onChange: (value: string[]) => void
  selectAllLabel?: string // when set, renders a "select all" toggle
}

// Multi-select checkbox group used by several treatment item forms.
export function CheckboxGroup({
  options,
  value,
  onChange,
  selectAllLabel,
}: CheckboxGroupProps) {
  const { t } = useTranslation()
  const toggle = (v: string, checked: boolean) => {
    if (checked) onChange([...value, v])
    else onChange(value.filter((x) => x !== v))
  }

  const allValues = options.map((o) => o.value)
  const allSelected =
    value.length === allValues.length && allValues.length > 0

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {selectAllLabel && (
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(c) => onChange(c === true ? allValues : [])}
          />
          {selectAllLabel}
        </label>
      )}
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value.includes(o.value)}
            onCheckedChange={(c) => toggle(o.value, c === true)}
          />
          {t(o.label)}
        </label>
      ))}
    </div>
  )
}
