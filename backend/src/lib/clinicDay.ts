export const CLINIC_TIMEZONE = 'Asia/Bangkok';

export function clinicToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Clinical dates are date-only values stored at UTC midnight, not instants.
export function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function elapsedDays(treatment: Date | null, contact: Date | null, today = clinicToday()): number | null {
  const days = [treatment, contact].filter((d): d is Date => d !== null).map(d => d.toISOString().slice(0, 10));
  if (!days.length) return null;
  const latest = days.sort()[days.length - 1];
  return Math.round((Date.parse(today) - Date.parse(latest)) / 86400000);
}
