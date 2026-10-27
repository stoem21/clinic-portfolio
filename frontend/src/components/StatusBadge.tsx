import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  active: boolean
  activeLabel?: string
  inactiveLabel?: string
}

// Green = active, gray = inactive.
export function StatusBadge({
  active,
  activeLabel,
  inactiveLabel,
}: StatusBadgeProps) {
  const { t } = useTranslation()
  const effectiveActiveLabel = activeLabel ?? t('common:active')
  const effectiveInactiveLabel = inactiveLabel ?? t('common:inactive')
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium',
        active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
      )}
    >
      {active ? effectiveActiveLabel : effectiveInactiveLabel}
    </span>
  )
}
