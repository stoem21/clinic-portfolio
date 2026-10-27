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
import { rootTypeOptions } from '@/lib/treatmentOptions'
import { CheckboxGroup } from './CheckboxGroup'
import type { TreatmentItemFormProps } from './types'

// rootCanalTreatment — single tooth + root-type checkbox group (>=1 required)
export function RootTreatmentForm({
  value,
  onChange,
  error,
}: TreatmentItemFormProps) {
  const { t } = useTranslation('treatmentItems')
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>{t('forms.tooth')} *</Label>
        <Select
          value={value.tooth || undefined}
          onValueChange={(tooth) => onChange({ ...value, tooth })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('forms.selectTooth')} />
          </SelectTrigger>
          <SelectContent>
            {toothList.map((tooth) => (
              <SelectItem key={tooth} value={tooth}>
                {tooth}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error?.tooth && <p className="text-sm text-destructive">{error.tooth}</p>}
      </div>

      <div className="space-y-2">
        <Label>{t('forms.type')} *</Label>
        <CheckboxGroup
          options={rootTypeOptions}
          value={value.rootType ?? []}
          onChange={(rootType) => onChange({ ...value, rootType })}
        />
        {error?.rootType && (
          <p className="text-sm text-destructive">{error.rootType}</p>
        )}
      </div>
    </div>
  )
}
