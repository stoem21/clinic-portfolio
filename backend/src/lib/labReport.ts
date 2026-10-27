import { clinicToday } from './clinicDay';

export interface LabPortion {
  assignedDate: Date | null;
  paid: boolean;
  paidAt: Date | null;
  amount: number | null;
}

// Dates of clinical assignments are UTC-anchored date-only values. Payments
// are real instants, converted to Bangkok calendar days before comparison.
export function labPortionInPeriod(portion: LabPortion, from: string, to: string, today = clinicToday()) {
  const assigned = portion.assignedDate?.toISOString().slice(0, 10) ?? null;
  const paidDay = portion.paidAt ? clinicToday(portion.paidAt) : null;
  const hidden = { visible: false, deduction: 0, issue: null } as const;
  if (assigned && assigned > to) return hidden;
  if (!assigned || (portion.paid && !paidDay) || (!portion.paid && paidDay)) {
    return { visible: true, deduction: 0, issue: 'incomplete-dates' } as const;
  }
  if (paidDay && paidDay < assigned) return { visible: true, deduction: 0, issue: 'payment-before-assignment' } as const;
  if (assigned < from && portion.paid && paidDay! < from) return hidden;
  if (portion.amount === null) return { visible: true, deduction: 0, issue: 'missing-cost' } as const;
  const paidInPeriod = portion.paid && paidDay! >= from && paidDay! <= to;
  const deduct = paidInPeriod || (to === today && !portion.paid);
  return { visible: true, deduction: deduct ? portion.amount : 0, issue: null } as const;
}

export function canReverseLabPayment(paidAt: Date | null, now = new Date()): boolean {
  return paidAt !== null && clinicToday(paidAt) === clinicToday(now);
}
