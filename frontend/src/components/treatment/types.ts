// Shared shape for every treatment-item form component.
export type ItemData = Record<string, any>

export interface TreatmentItemFormProps {
  value: ItemData
  onChange: (data: ItemData) => void
  error?: Record<string, string>
}
