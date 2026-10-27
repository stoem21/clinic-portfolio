import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TreatmentItemFormProps } from './types'

// filling — placeholder text field (to be expanded once iPad workflow confirmed)
export function FillingForm({ value, onChange, error }: TreatmentItemFormProps) {
  const { t } = useTranslation('treatmentItems')
  return (
    <div className="space-y-2">
      <Label>{t('forms.details')} *</Label>
      <Input
        value={value.otherText ?? ''}
        onChange={(e) => onChange({ ...value, otherText: e.target.value })}
        placeholder={t('forms.fillingDetailsPlaceholder')}
      />
      {error?.otherText && (
        <p className="text-sm text-destructive">{error.otherText}</p>
      )}
    </div>
  )
}
