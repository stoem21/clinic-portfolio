import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toothList } from '@/lib/toothData'
import { dentureTypeOptions } from '@/lib/treatmentOptions'
import { ToothMultiSelect } from './ToothMultiSelect'
import type { TreatmentItemFormProps } from './types'

// removableDentures — type select + tooth multi-select (with select-all)
export function RemovableDenturesForm({
  value,
  onChange,
  error,
}: TreatmentItemFormProps) {
  const { t } = useTranslation('treatmentItems')
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>{t('forms.type')} *</Label>
        <Select
          value={value.type || undefined}
          onValueChange={(type) => onChange({ ...value, type })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('forms.selectType')} />
          </SelectTrigger>
          <SelectContent>
            {dentureTypeOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error?.type && <p className="text-sm text-destructive">{error.type}</p>}
      </div>

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
    </div>
  )
}
