import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { pediatricsToothList, toothSideOptions } from '@/lib/toothData'
import { pediatricsTreatmentTypeOptions } from '@/lib/treatmentOptions'
import { ToothMultiSelect } from './ToothMultiSelect'
import type { ItemData, TreatmentItemFormProps } from './types'

interface FillingRow {
  tooth: string
  side: string
}

// Sides valid for a given tooth (forTeeth === 'all' or includes the tooth).
function sidesForTooth(tooth: string) {
  return toothSideOptions.filter(
    (s) => s.forTeeth === 'all' || s.forTeeth.includes(tooth)
  )
}

// pediatrics — treatment-type select; filling shows dynamic tooth+side rows,
// other types show a tooth multi-select from the pediatrics list.
export function PediatricsForm({
  value,
  onChange,
  error,
}: TreatmentItemFormProps) {
  const { t } = useTranslation('treatmentItems')
  const treatmentType: string = value.treatmentType ?? ''
  const rows: FillingRow[] = value.fillings ?? [{ tooth: '', side: '' }]

  const setType = (next: string) => {
    const base: ItemData = { treatmentType: next }
    if (next === 'filling') base.fillings = [{ tooth: '', side: '' }]
    else base.tooth = []
    onChange(base)
  }

  const updateRow = (index: number, patch: Partial<FillingRow>) => {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r))
    onChange({ ...value, fillings: next })
  }
  const addRow = () =>
    onChange({ ...value, fillings: [...rows, { tooth: '', side: '' }] })
  const removeRow = (index: number) =>
    onChange({ ...value, fillings: rows.filter((_, i) => i !== index) })

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>{t('forms.treatmentType')} *</Label>
        <Select value={treatmentType || undefined} onValueChange={setType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('forms.selectType')} />
          </SelectTrigger>
          <SelectContent>
            {pediatricsTreatmentTypeOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error?.treatmentType && (
          <p className="text-sm text-destructive">{error.treatmentType}</p>
        )}
      </div>

      {treatmentType && treatmentType !== 'filling' && (
        <div className="space-y-2">
          <Label>{t('forms.tooth')} *</Label>
          <ToothMultiSelect
            options={pediatricsToothList}
            value={value.tooth ?? []}
            onChange={(tooth) => onChange({ ...value, tooth })}
            error={error?.tooth}
          />
        </div>
      )}

      {treatmentType === 'filling' && (
        <div className="space-y-2">
          <Label>{t('forms.fillingList')} *</Label>
          <div className="space-y-2">
            {rows.map((row, i) => {
              const sides = sidesForTooth(row.tooth)
              return (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={row.tooth || undefined}
                    onValueChange={(tooth) =>
                      // Reset side if it's no longer valid for the new tooth.
                      updateRow(i, {
                        tooth,
                        side: sidesForTooth(tooth).some((s) => s.value === row.side)
                          ? row.side
                          : '',
                      })
                    }
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue placeholder={t('forms.tooth')} />
                    </SelectTrigger>
                    <SelectContent>
                      {pediatricsToothList.map((tooth) => (
                        <SelectItem key={tooth} value={tooth}>
                          {tooth}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={row.side || undefined}
                    onValueChange={(side) => updateRow(i, { side })}
                    disabled={!row.tooth}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue placeholder={t('forms.side')} />
                    </SelectTrigger>
                    <SelectContent>
                      {sides.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={rows.length <= 1}
                    onClick={() => removeRow(i)}
                  >
                    <X className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              )
            })}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4" />
            {t('forms.addTooth')}
          </Button>
          {error?.fillings && (
            <p className="text-sm text-destructive">{error.fillings}</p>
          )}
        </div>
      )}
    </div>
  )
}
