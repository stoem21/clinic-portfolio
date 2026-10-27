// Shared date/number formatting, consolidating what used to be ~11 duplicated
// per-page copies. Dates stay on the Buddhist calendar year regardless of UI
// language — the app's own receipt numbering and HN generation are already
// tied to the Buddhist year (see backend Receipt.buddhistYear/HnCounter), so
// showing Gregorian dates in English mode would be inconsistent with how
// those numbers actually work.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

// Accepts either a full ISO datetime (e.g. treatmentDate/createdAt from the
// API) or a bare YYYY-MM-DD date (e.g. a backup file's date stamp). Date-only
// strings are split manually rather than parsed as a Date, since
// `new Date('YYYY-MM-DD')` parses as UTC midnight and can shift a day off in
// local time zones behind UTC.
export function formatThaiDate(input: string): string {
  if (DATE_ONLY.test(input)) {
    const [y, m, d] = input.split('-')
    return `${d}/${m}/${Number(y) + 543}`
  }
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return '—'
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${date.getFullYear() + 543}`
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export function formatBaht(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
