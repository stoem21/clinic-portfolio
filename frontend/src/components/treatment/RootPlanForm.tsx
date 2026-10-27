import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import { toothList } from '@/lib/toothData'
import { rootPlanAreaOptions } from '@/lib/treatmentOptions'
import { CheckboxGroup } from './CheckboxGroup'
import { ToothMultiSelect } from './ToothMultiSelect'
import type { TreatmentItemFormProps } from './types'

// rootPlaning — choose EITHER quadrant areas OR specific teeth (mutually exclusive)
export function RootPlanForm({ value, onChange, error }: TreatmentItemFormProps) {
  const { t } = useTranslation('treatmentItems')
  const area: string[] = value.area ?? []
  const tooth: string[] = value.tooth ?? []
  const usingTooth = tooth.length > 0
  const usingArea = area.length > 0

  const switchMethod = () => onChange({ area: [], tooth: [] })

  // Once one method has values, hide the other and offer a switch link.
  const showArea = !usingTooth
  const showTooth = !usingArea

  return (
    <div className="space-y-3">
      {(usingArea || usingTooth) && (
        <button
          type="button"
          className="text-xs text-blue-600 hover:underline"
          onClick={switchMethod}
        >
          {t('forms.switchSelectionMethod')}
        </button>
      )}

      {showArea && (
        <div className="space-y-2">
          <Label>Quadrant {!usingTooth && '*'}</Label>
          <CheckboxGroup
            options={rootPlanAreaOptions}
            value={area}
            onChange={(next) => onChange({ ...value, area: next, tooth: [] })}
          />
        </div>
      )}

      {showTooth && (
        <div className="space-y-2">
          <Label>{t('forms.tooth')} {!usingArea && '*'}</Label>
          <ToothMultiSelect
            options={toothList}
            value={tooth}
            onChange={(next) => onChange({ ...value, tooth: next, area: [] })}
          />
        </div>
      )}

      {error?.area && <p className="text-sm text-destructive">{error.area}</p>}
    </div>
  )
}
