// Shared value→label option lists for treatment item fields. Both the form
// components and the read-only summary import from here so labels stay in
// sync. `label` holds an i18n key (resolved by `labelOf`), not literal text,
// so every consumer automatically follows the active UI language.

import i18n from '@/i18n'

export interface Option {
  value: string
  label: string
}

export const TOOTH_EXTRA_VALUE = 'supernumeraryTooth'

// Fixed set — matches backend/src/routes/treatments.ts's PAYMENT_TYPES.
export const paymentTypeOptions: Option[] = [
  { value: 'transfer', label: 'treatmentItems:paymentType.transfer' },
  { value: 'cash', label: 'treatmentItems:paymentType.cash' },
  { value: 'socialSecurity', label: 'treatmentItems:paymentType.socialSecurity' },
]

// Fixed set — matches backend/src/routes/treatments.ts's LAB_WORK_TYPES.
// Note: 'implant' here is LabWork.type, a separate column from a
// TreatmentItem's own `type` (which also has an 'implant' value) — the two
// are never compared to each other.
export const labWorkTypeOptions: Option[] = [
  { value: 'rtn', label: 'treatmentItems:labWorkType.rtn' },
  { value: 'implant', label: 'treatmentItems:labWorkType.implant' },
  { value: 'denture', label: 'treatmentItems:labWorkType.denture' },
  { value: 'other', label: 'treatmentItems:labWorkType.other' },
]

export const scalingAreaOptions: Option[] = [
  { value: 'top', label: 'treatmentItems:scalingArea.top' },
  { value: 'bottom', label: 'treatmentItems:scalingArea.bottom' },
]

export const rootPlanAreaOptions: Option[] = [
  { value: 'Q1', label: 'treatmentItems:rootPlanArea.Q1' },
  { value: 'Q2', label: 'treatmentItems:rootPlanArea.Q2' },
  { value: 'Q3', label: 'treatmentItems:rootPlanArea.Q3' },
  { value: 'Q4', label: 'treatmentItems:rootPlanArea.Q4' },
]

export const rootTypeOptions: Option[] = [
  { value: 'oc', label: 'treatmentItems:rootType.oc' },
  { value: 'lt', label: 'treatmentItems:rootType.lt' },
  { value: 'mi', label: 'treatmentItems:rootType.mi' },
  { value: 'frc', label: 'treatmentItems:rootType.frc' },
  { value: 'changeMed', label: 'treatmentItems:rootType.changeMed' },
  { value: 'bleachDead', label: 'treatmentItems:rootType.bleachDead' },
]

export const dentureTypeOptions: Option[] = [
  { value: 'TP', label: 'treatmentItems:dentureType.TP' },
  { value: 'RPD', label: 'treatmentItems:dentureType.RPD' },
  { value: 'VP', label: 'treatmentItems:dentureType.VP' },
  { value: 'CD', label: 'treatmentItems:dentureType.CD' },
]

export const crownTypeOptions: Option[] = [
  { value: 'fullMetal', label: 'treatmentItems:crownType.fullMetal' },
  { value: 'pfm', label: 'treatmentItems:crownType.pfm' },
  { value: 'allCeramic', label: 'treatmentItems:crownType.allCeramic' },
  { value: 'veneer', label: 'treatmentItems:crownType.veneer' },
]

// `adjust` renders with the chosen month appended in the summary. `rtnUpper`/
// `rtnLower` require picking a material from rtnMaterialOptions below.
export const orthoActivityOptions: Option[] = [
  { value: 'adjust', label: 'treatmentItems:orthoActivity.adjust' },
  { value: 'printMount', label: 'treatmentItems:orthoActivity.printMount' },
  { value: 'bondUpper', label: 'treatmentItems:orthoActivity.bondUpper' },
  { value: 'bondLower', label: 'treatmentItems:orthoActivity.bondLower' },
  { value: 'removeAppliance', label: 'treatmentItems:orthoActivity.removeAppliance' },
  { value: 'rtnUpper', label: 'treatmentItems:orthoActivity.rtnUpper' },
  { value: 'rtnLower', label: 'treatmentItems:orthoActivity.rtnLower' },
  { value: 'others', label: 'treatmentItems:orthoActivity.others' },
]

// Required material choice when rtnUpper or rtnLower is selected.
export const rtnMaterialOptions: Option[] = [
  { value: 'wire', label: 'treatmentItems:rtnMaterial.wire' },
  { value: 'clear', label: 'treatmentItems:rtnMaterial.clear' },
]

export const xrayTypeOptions: Option[] = [
  { value: 'small', label: 'treatmentItems:xrayType.small' },
  { value: 'big', label: 'treatmentItems:xrayType.big' },
]

export const xrayFilmTypeOptions: Option[] = [
  { value: 'opg', label: 'treatmentItems:xrayFilmType.opg' },
  { value: 'lateralCeph', label: 'treatmentItems:xrayFilmType.lateralCeph' },
]

export const pediatricsTreatmentTypeOptions: Option[] = [
  { value: 'extraction', label: 'treatmentItems:pediatricsTreatmentType.extraction' },
  { value: 'filling', label: 'treatmentItems:pediatricsTreatmentType.filling' },
  { value: 'rootCanal', label: 'treatmentItems:pediatricsTreatmentType.rootCanal' },
  { value: 'ssc', label: 'treatmentItems:pediatricsTreatmentType.ssc' },
]

export function labelOf(options: Option[], value: string): string {
  const key = options.find((o) => o.value === value)?.label
  return key ? i18n.t(key) : value
}

// A tooth value is normally its number; the sentinel maps to a translated
// "supernumerary tooth" label.
export function toothLabel(value: string): string {
  return value === TOOTH_EXTRA_VALUE ? i18n.t('treatmentItems:toothExtra') : value
}
