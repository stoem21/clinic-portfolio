import i18n from '@/i18n'
import { treatmentTypes, toothSideOptions } from '@/lib/toothData'
import {
  crownTypeOptions,
  dentureTypeOptions,
  labelOf,
  orthoActivityOptions,
  pediatricsTreatmentTypeOptions,
  rootTypeOptions,
  rtnMaterialOptions,
  scalingAreaOptions,
  toothLabel,
  xrayFilmTypeOptions,
  xrayTypeOptions,
} from '@/lib/treatmentOptions'

export interface TreatmentItemSummaryProps {
  item: {
    type: string
    data: Record<string, any>
    price: number | null
  }
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : [])
const sideLabel = (v: string) =>
  toothSideOptions.find((s) => s.value === v)?.label ?? v

export function typeText(type: string): string {
  const key = treatmentTypes.find((t) => t.value === type)?.text
  return key ? i18n.t(key) : type
}

// Build the human-readable detail string for an item. Exported for reuse by
// the receipt feature, which builds one line item per treatment item using
// the same "<type label>: <detail>" text this component renders.
export function formatDetail(type: string, data: Record<string, any>): string {
  switch (type) {
    case 'post':
    case 'extraction':
    case 'surgicalRemoval':
      return arr(data.tooth).map(toothLabel).join(', ')
    case 'scaling':
      return arr(data.area).map((a) => labelOf(scalingAreaOptions, a)).join(', ')
    case 'rootPlaning':
      return arr(data.area).length > 0
        ? arr(data.area).join(', ')
        : arr(data.tooth).join(', ')
    case 'filling':
      return data.otherText ?? ''
    case 'rootCanalTreatment': {
      const roots = arr(data.rootType)
        .map((r) => labelOf(rootTypeOptions, r))
        .join(', ')
      return roots ? `${data.tooth ?? ''} (${roots})` : `${data.tooth ?? ''}`
    }
    case 'removableDentures':
      return `${labelOf(dentureTypeOptions, data.type ?? '')}: ${arr(data.tooth).join(', ')}`
    case 'crown': {
      const teeth = arr(data.tooth).join(', ')
      return data.type ? `${teeth} (${labelOf(crownTypeOptions, data.type)})` : teeth
    }
    case 'implant': {
      const teeth = arr(data.tooth).join(', ')
      return data.note ? `${teeth} - ${data.note}` : teeth
    }
    case 'ortho':
      return arr(data.activity)
        .map((a) => {
          if (a === 'adjust') {
            return `${labelOf(orthoActivityOptions, a)} ${data.month ?? ''}`.trim()
          }
          if ((a === 'rtnUpper' || a === 'rtnLower') && data.rtnMaterial) {
            return `${labelOf(orthoActivityOptions, a)} (${labelOf(rtnMaterialOptions, data.rtnMaterial)})`
          }
          if (a === 'others' && data.otherText) {
            return `${labelOf(orthoActivityOptions, a)}: ${data.otherText}`
          }
          return labelOf(orthoActivityOptions, a)
        })
        .join(', ')
    case 'xRay': {
      if (data.type === 'small') {
        return `${labelOf(xrayTypeOptions, 'small')}: ${arr(data.tooth).join(', ')}`
      }
      if (data.type === 'big') {
        const films = arr(data.filmType)
          .map((f) => labelOf(xrayFilmTypeOptions, f))
          .join(', ')
        return `${labelOf(xrayTypeOptions, 'big')}: ${films}`
      }
      return ''
    }
    case 'pediatrics': {
      const tt = labelOf(pediatricsTreatmentTypeOptions, data.treatmentType ?? '')
      if (data.treatmentType === 'filling') {
        const rows = (Array.isArray(data.fillings) ? data.fillings : []) as {
          tooth?: string
          side?: string
        }[]
        const detail = rows
          .map((r) => `${r.tooth ?? ''}${r.side ? ` ${sideLabel(r.side)}` : ''}`)
          .join(', ')
        return `${tt}: ${detail}`
      }
      return `${tt}: ${arr(data.tooth).join(', ')}`
    }
    case 'bleaching':
    case 'fluoride':
    case 'supply':
    case 'others':
      return data.otherText ?? ''
    default:
      return ''
  }
}

export function TreatmentItemSummary({ item }: TreatmentItemSummaryProps) {
  const detail = formatDetail(item.type, item.data ?? {})
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="whitespace-pre-wrap break-words text-sm text-gray-900">
        {typeText(item.type)}
        {detail ? `: ${detail}` : ''}
      </span>
      {item.price !== null && (
        <span className="shrink-0 text-sm font-medium text-gray-700">
          ฿ {item.price.toFixed(2)}
        </span>
      )}
    </div>
  )
}
