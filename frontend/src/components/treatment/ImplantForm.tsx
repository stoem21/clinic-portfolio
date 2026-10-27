import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toothList } from '@/lib/toothData'
import { ToothMultiSelect } from './ToothMultiSelect'
import type { TreatmentItemFormProps } from './types'

// implant — tooth multi-select (with select-all) + optional note
export function ImplantForm({ value, onChange, error }: TreatmentItemFormProps) {
  const { t } = useTranslation('treatmentItems')
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>{t('forms.tooth')} *</Label>
        <ToothMultiSelect
          options={toothList}
          value={value.tooth ?? []}
          onChange={(tooth) => onChange({ ...value, tooth })}
          showSelectAll
          error={error?.tooth}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('forms.note')}</Label>
        <Input
          value={value.note ?? ''}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
        />
      </div>
    </div>
  )
}
