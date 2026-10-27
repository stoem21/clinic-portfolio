import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import { toothList } from '@/lib/toothData'
import { TOOTH_EXTRA_VALUE } from '@/lib/treatmentOptions'
import { ToothMultiSelect } from './ToothMultiSelect'
import type { TreatmentItemFormProps } from './types'

// extraction, surgicalRemoval — tooth multi-select incl. the supernumerary
// tooth option (required)
export function ToothWithExtraForm({
  value,
  onChange,
  error,
}: TreatmentItemFormProps) {
  const { t } = useTranslation('treatmentItems')
  const options = [
    ...toothList.map((tooth) => ({ value: tooth, label: tooth })),
    { value: TOOTH_EXTRA_VALUE, label: t('toothExtra') },
  ]

  return (
    <div className="space-y-2">
      <Label>{t('forms.tooth')} *</Label>
      <ToothMultiSelect
        options={options}
        value={value.tooth ?? []}
        onChange={(tooth) => onChange({ ...value, tooth })}
        error={error?.tooth}
      />
    </div>
  )
}
