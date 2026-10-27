import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

interface OptionType {
  value: string
  label: string
}

interface ToothMultiSelectProps {
  options: string[] | { value: string; label: string }[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string // kept for API compatibility (unused by the grid)
  showSelectAll?: boolean
  selectAllLabel?: string
  error?: string
}

function normalize(
  options: ToothMultiSelectProps['options']
): OptionType[] {
  return options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o
  )
}

// A tap-to-toggle grid of tooth buttons. Replaces the old react-select dropdown,
// whose portaled menu was unusable inside the Radix modal dialog.
export function ToothMultiSelect({
  options,
  value,
  onChange,
  showSelectAll = false,
  selectAllLabel,
  error,
}: ToothMultiSelectProps) {
  const { t } = useTranslation()
  const effectiveSelectAllLabel = selectAllLabel ?? t('treatmentItems:forms.selectAll')
  const normalized = normalize(options)
  const allSelected =
    value.length === normalized.length && normalized.length > 0

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  // Group consecutive teeth by their first digit (FDI quadrant) so each
  // quadrant sits on its own row — easier to scan and pick.
  const rows: OptionType[][] = []
  let lastKey: string | null = null
  for (const opt of normalized) {
    const key = /^\d/.test(opt.value) ? opt.value[0] : 'other'
    if (key !== lastKey) {
      rows.push([])
      lastKey = key
    }
    rows[rows.length - 1].push(opt)
  }

  return (
    <div>
      {showSelectAll && (
        <div className="mb-1 flex justify-end">
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline"
            onClick={() =>
              onChange(allSelected ? [] : normalized.map((o) => o.value))
            }
          >
            {allSelected ? t('treatmentItems:forms.clearAll') : effectiveSelectAllLabel}
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap gap-1.5">
            {row.map((opt) => {
              const selected = value.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggle(opt.value)}
                  className={cn(
                    'inline-flex h-9 min-w-10 items-center justify-center rounded-md border px-2 text-sm transition-colors',
                    selected
                      ? 'border-blue-600 bg-blue-600 font-medium text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  )
}
