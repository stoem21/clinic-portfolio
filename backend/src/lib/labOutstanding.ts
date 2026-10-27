// Clinical assignment dates are UTC-anchored date-only values. Payments are instants.
export function outstandingAt(assignedDate: Date | null, paid: boolean, paidAt: Date | null, endDay: string): boolean | null {
  if (!assignedDate) return null;
  if (assignedDate.toISOString().slice(0, 10) > endDay) return false;
  if (paid && !paidAt) return null; // Legacy payment with unknown date, not invented history.
  const cutoff = new Date(`${endDay}T23:59:59.999+07:00`);
  return !paidAt || paidAt > cutoff;
}
