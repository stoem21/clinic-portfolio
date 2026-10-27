import type { ComponentType } from 'react'

import i18n from '@/i18n'
import { ToothForm } from './ToothForm'
import { ToothWithExtraForm } from './ToothWithExtraForm'
import { ScalingForm } from './ScalingForm'
import { RootPlanForm } from './RootPlanForm'
import { FillingForm } from './FillingForm'
import { RootTreatmentForm } from './RootTreatmentForm'
import { RemovableDenturesForm } from './RemovableDenturesForm'
import { CrownForm } from './CrownForm'
import { ImplantForm } from './ImplantForm'
import { OrthoForm } from './OrthoForm'
import { XRayForm } from './XRayForm'
import { PediatricsForm } from './PediatricsForm'
import { OtherForm } from './OtherForm'
import type { ItemData, TreatmentItemFormProps } from './types'

export const treatmentItemComponentMap: Record<
  string,
  ComponentType<TreatmentItemFormProps>
> = {
  extraction: ToothWithExtraForm,
  surgicalRemoval: ToothWithExtraForm,
  scaling: ScalingForm,
  rootPlaning: RootPlanForm,
  filling: FillingForm,
  rootCanalTreatment: RootTreatmentForm,
  removableDentures: RemovableDenturesForm,
  post: ToothForm,
  crown: CrownForm,
  implant: ImplantForm,
  ortho: OrthoForm,
  bleaching: OtherForm,
  fluoride: OtherForm,
  xRay: XRayForm,
  pediatrics: PediatricsForm,
  supply: OtherForm,
  others: OtherForm,
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

// Returns field→message errors for an item's data; empty object means valid.
export function validateTreatmentItem(
  type: string,
  data: ItemData
): Record<string, string> {
  const e: Record<string, string> = {}
  const need = i18n.t('treatmentItems:validation.required')
  const pickOne = i18n.t('treatmentItems:validation.pickAtLeastOne')

  switch (type) {
    case 'post':
    case 'extraction':
    case 'surgicalRemoval':
      if (arr(data.tooth).length === 0) e.tooth = need
      break
    case 'scaling':
      if (arr(data.area).length === 0) e.area = pickOne
      break
    case 'rootPlaning':
      if (arr(data.area).length === 0 && arr(data.tooth).length === 0)
        e.area = i18n.t('treatmentItems:validation.quadrantOrTooth')
      break
    case 'filling':
      if (!text(data.otherText)) e.otherText = need
      break
    case 'rootCanalTreatment':
      if (!text(data.tooth)) e.tooth = need
      if (arr(data.rootType).length === 0) e.rootType = pickOne
      break
    case 'removableDentures':
      if (!text(data.type)) e.type = need
      if (arr(data.tooth).length === 0) e.tooth = need
      break
    case 'crown':
      if (arr(data.tooth).length === 0) e.tooth = need
      if (!text(data.type)) e.type = need
      break
    case 'implant':
      if (arr(data.tooth).length === 0) e.tooth = need
      break
    case 'ortho': {
      const activity = arr(data.activity) as string[]
      if (activity.length === 0) e.activity = pickOne
      if (activity.includes('adjust') && !text(data.month)) e.month = need
      // One shared material choice covers rtnUpper/rtnLower together if both
      // are checked on the same item (matches OrthoForm.tsx's showRtnMaterial).
      if (
        (activity.includes('rtnUpper') || activity.includes('rtnLower')) &&
        !text(data.rtnMaterial)
      )
        e.rtnMaterial = need
      if (activity.includes('others') && !text(data.otherText)) e.otherText = need
      break
    }
    case 'xRay': {
      const t = text(data.type)
      if (!t) e.type = need
      else if (t === 'small' && arr(data.tooth).length === 0) e.tooth = need
      else if (t === 'big' && arr(data.filmType).length === 0)
        e.filmType = pickOne
      break
    }
    case 'pediatrics': {
      const tt = text(data.treatmentType)
      if (!tt) {
        e.treatmentType = need
      } else if (tt === 'filling') {
        const rows = arr(data.fillings) as { tooth?: string; side?: string }[]
        const valid =
          rows.length > 0 &&
          rows.every((r) => text(r.tooth) && text(r.side))
        if (!valid) e.fillings = i18n.t('treatmentItems:validation.fillEveryRow')
      } else if (arr(data.tooth).length === 0) {
        e.tooth = need
      }
      break
    }
    case 'bleaching':
    case 'fluoride':
    case 'supply':
    case 'others':
      if (!text(data.otherText)) e.otherText = need
      break
  }

  return e
}
