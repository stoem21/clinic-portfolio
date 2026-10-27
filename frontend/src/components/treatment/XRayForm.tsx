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
import { xrayFilmTypeOptions, xrayTypeOptions } from '@/lib/treatmentOptions'
import { CheckboxGroup } from './CheckboxGroup'
import { ToothMultiSelect } from './ToothMultiSelect'
import type { TreatmentItemFormProps } from './types'

// xRay — type select; small → tooth multi-select, big → film-type checkboxes
export function XRayForm({ value, onChange, error }: TreatmentItemFormProps) {
  const { t } = useTranslation('treatmentItems')
  const type: string = value.type ?? ''

  // Switch type clears the dependent fields to avoid stale data.
  const setType = (next: string) =>
    onChange({ type: next, tooth: [], filmType: [] })

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>{t('forms.xrayType')} *</Label>
        <Select value={type || undefined} onValueChange={setType}>
          <SelectTrigger className="w-60">
            <SelectValue placeholder={t('forms.selectType')} />
          </SelectTrigger>
          <SelectContent>
            {xrayTypeOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error?.type && <p className="text-sm text-destructive">{error.type}</p>}
      </div>

      {type === 'small' && (
        <div className="space-y-2">
          <Label>{t('forms.tooth')} *</Label>
          <ToothMultiSelect
            options={toothList}
            value={value.tooth ?? []}
            onChange={(tooth) => onChange({ ...value, tooth })}
            error={error?.tooth}
          />
        </div>
      )}

      {type === 'big' && (
        <div className="space-y-2">
          <Label>{t('forms.filmType')} *</Label>
          <CheckboxGroup
            options={xrayFilmTypeOptions}
            value={value.filmType ?? []}
            onChange={(filmType) => onChange({ ...value, filmType })}
          />
          {error?.filmType && (
            <p className="text-sm text-destructive">{error.filmType}</p>
          )}
        </div>
      )}
    </div>
  )
}
