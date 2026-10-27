import { Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface EmptyStateProps {
  message?: string
}

// Centered neutral empty state for tables with no rows.
export function EmptyState({ message }: EmptyStateProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-400">
      <Inbox className="h-8 w-8" />
      <p className="text-sm">{message ?? t('common:noData')}</p>
    </div>
  )
}
