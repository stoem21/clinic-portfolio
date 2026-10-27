import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { orthoActivityOptions, rtnMaterialOptions } from '@/lib/treatmentOptions'
import { CheckboxGroup } from './CheckboxGroup'
import type { TreatmentItemFormProps } from './types'

// ortho — activity checkbox group; month input shown only when "adjust" selected;
// a required RTN material choice shown when rtnUpper/rtnLower is selected (shared
// across both if checked together — see treatment/index.ts's validation comment).
export function OrthoForm({ value, onChange, error }: TreatmentItemFormProps) {
  const { t } = useTranslation('treatmentItems')
  const activity: string[] = value.activity ?? []
  const showMonth = activity.includes('adjust')
  const showRtnMaterial = activity.includes('rtnUpper') || activity.includes('rtnLower')
  const showOtherText = activity.includes('others')

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>{t('forms.activity')} *</Label>
        <CheckboxGroup
          options={orthoActivityOptions}
          value={activity}
          onChange={(next) => onChange({ ...value, activity: next })}
        />
        {error?.activity && (
          <p className="text-sm text-destructive">{error.activity}</p>
        )}
      </div>

      {showMonth && (
        <div className="space-y-2">
          <Label>{t('forms.month')} *</Label>
          <Input
            className="w-32"
            value={value.month ?? ''}
            onChange={(e) => onChange({ ...value, month: e.target.value })}
            placeholder={t('forms.monthPlaceholder')}
          />
          {error?.month && (
            <p className="text-sm text-destructive">{error.month}</p>
          )}
        </div>
      )}

      {showRtnMaterial && (
        <div className="space-y-2">
          <Label>{t('forms.rtnMaterial')} *</Label>
          <RadioGroup
            className="flex gap-4"
            value={value.rtnMaterial ?? ''}
            onValueChange={(v) => onChange({ ...value, rtnMaterial: v })}
          >
            {rtnMaterialOptions.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <RadioGroupItem value={o.value} /> {t(o.label)}
              </label>
            ))}
          </RadioGroup>
          {error?.rtnMaterial && (
            <p className="text-sm text-destructive">{error.rtnMaterial}</p>
          )}
        </div>
      )}

      {showOtherText && (
        <div className="space-y-2">
          <Label>{t('forms.details')} *</Label>
          <Input
            value={value.otherText ?? ''}
            onChange={(e) => onChange({ ...value, otherText: e.target.value })}
            placeholder={t('forms.detailsPlaceholder')}
          />
          {error?.otherText && (
            <p className="text-sm text-destructive">{error.otherText}</p>
          )}
        </div>
      )}
    </div>
  )
}
