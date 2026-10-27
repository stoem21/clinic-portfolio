import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ExportColumn } from '@/lib/exportCsv'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ExportDialogProps {
  open: boolean
  onClose: () => void
  columns: ExportColumn[]
  onExport: (selected: ExportColumn[]) => void
  isLoading?: boolean
  recordCount: number
}

// Column picker shown before generating a CSV. All columns checked by default.
export function ExportDialog({
  open,
  onClose,
  columns,
  onExport,
  isLoading = false,
  recordCount,
}: ExportDialogProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string[]>(() =>
    columns.map((c) => c.key)
  )

  // Re-check everything each time the dialog opens.
  useEffect(() => {
    if (open) setSelected(columns.map((c) => c.key))
  }, [open, columns])

  const toggle = (key: string, checked: boolean) =>
    setSelected((prev) =>
      checked ? [...prev, key] : prev.filter((k) => k !== key)
    )

  const handleExport = () => {
    const chosen = columns.filter((c) => selected.includes(c.key))
    if (chosen.length === 0) return
    onExport(chosen)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('common:export.chooseColumnsTitle')}</DialogTitle>
          <DialogDescription>
            {t('common:export.recordCountFound', { count: recordCount })}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-1 flex items-center gap-3 text-sm">
          <button
            type="button"
            className="text-blue-600 hover:underline"
            onClick={() => setSelected(columns.map((c) => c.key))}
          >
            {t('common:export.selectAll')}
          </button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            className="text-blue-600 hover:underline"
            onClick={() => setSelected([])}
          >
            {t('common:export.deselectAll')}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 text-sm text-gray-800"
            >
              <Checkbox
                checked={selected.includes(col.key)}
                onCheckedChange={(c) => toggle(col.key, c === true)}
              />
              {col.header}
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {t('common:cancel')}
          </Button>
          <Button
            onClick={handleExport}
            disabled={isLoading || selected.length === 0}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t('common:export.exportCsv')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
