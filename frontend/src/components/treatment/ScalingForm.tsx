import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import { scalingAreaOptions } from '@/lib/treatmentOptions'
import { CheckboxGroup } from './CheckboxGroup'
import type { TreatmentItemFormProps } from './types'

// scaling — area checkbox group (upper/lower) with "whole mouth" select-all (>=1 required)
export function ScalingForm({ value, onChange, error }: TreatmentItemFormProps) {
  const { t } = useTranslation('treatmentItems')
  return (
    <div className="space-y-2">
      <Label>{t('forms.area')} *</Label>
      <CheckboxGroup
        options={scalingAreaOptions}
        value={value.area ?? []}
        onChange={(area) => onChange({ ...value, area })}
        selectAllLabel={t('forms.wholeMouth')}
      />
      {error?.area && <p className="text-sm text-destructive">{error.area}</p>}
    </div>
  )
}
