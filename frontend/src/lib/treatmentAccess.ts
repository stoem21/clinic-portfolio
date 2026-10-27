import type { Role } from '@/types'

// Only SUPER_ADMIN sees cost on a record whose visit date isn't today.
export function canSeeTreatmentCost(role: Role | undefined, treatmentDateIso: string): boolean {
  if (role === 'SUPER_ADMIN') return true
  const today = new Date().toLocaleDateString('en-CA')
  const visitDay = new Date(treatmentDateIso).toLocaleDateString('en-CA')
  return visitDay === today
}
