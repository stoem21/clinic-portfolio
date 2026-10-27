import { AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface ErrorCardProps {
  message?: string
  onRetry: () => void
}

// Shown when a page's initial data load fails.
export function ErrorCard({ message, onRetry }: ErrorCardProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-red-200 bg-red-50 py-12 text-center">
      <AlertCircle className="h-8 w-8 text-red-500" />
      <p className="text-sm text-red-700">{message ?? t('common:loadError')}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('common:retry')}
      </Button>
    </div>
  )
}
