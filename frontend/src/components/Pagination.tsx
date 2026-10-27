import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

// Build a page list with at most 5 numbers and '...' ellipses around the
// current page.
function buildPages(page: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const pages: (number | 'ellipsis')[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(totalPages - 1, page + 1)

  if (start > 2) pages.push('ellipsis')
  for (let p = start; p <= end; p++) pages.push(p)
  if (end < totalPages - 1) pages.push('ellipsis')

  pages.push(totalPages)
  return pages
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const { t } = useTranslation()
  if (totalPages <= 1) return null
  const pages = buildPages(page, totalPages)

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
        {t('common:previous')}
      </button>

      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`e${i}`} className="px-2 text-sm text-gray-400">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={cn(
              'min-w-8 rounded px-2.5 py-1 text-sm',
              p === page
                ? 'bg-blue-600 font-medium text-white'
                : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {t('common:next')}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
