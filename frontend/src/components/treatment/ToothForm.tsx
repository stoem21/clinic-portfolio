import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import { toothList } from '@/lib/toothData'
import { ToothMultiSelect } from './ToothMultiSelect'
import type { TreatmentItemFormProps } from './types'

// post — tooth multi-select (required)
export function ToothForm({ value, onChange, error }: TreatmentItemFormProps) {
  const { t } = useTranslation('treatmentItems')
  return (
    <div className="space-y-2">
      <Label>{t('forms.tooth')} *</Label>
      <ToothMultiSelect
        options={toothList}
        value={value.tooth ?? []}
        onChange={(tooth) => onChange({ ...value, tooth })}
        error={error?.tooth}
      />
    </div>
  )
}
