import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { getApiErrorMessage } from '@/lib/apiError'
import { downloadReceiptPdf } from '@/lib/generateReceiptPdf'
import type { Receipt, ReceiptListResponse } from '@/types'
import { formatThaiDate, formatBaht } from '@/lib/format'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/EmptyState'
import { ErrorCard } from '@/components/ErrorCard'
import { TableSkeleton } from '@/components/TableSkeleton'
import { Pagination } from '@/components/Pagination'
import { ReceiptDocument } from '@/components/receipt/ReceiptDocument'

const PAGE_SIZE = 20

const COL_COUNT = 7

// History of every issued receipt — the reason receipts are persisted at all
// (sequential numbering, an audit trail, and reprinting from the exact
// snapshot that was originally issued, not live/possibly-changed record data).
export default function ReceiptsPage() {
  const { t } = useTranslation('receipts')
  const { toast } = useToast()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [reprintingId, setReprintingId] = useState<string | null>(null)
  const [reprintReceipt, setReprintReceipt] = useState<Receipt | null>(null)
  const reprintRef = useRef<HTMLDivElement>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const { data } = await api.get<ReceiptListResponse>('/api/receipts', {
        params: { page, limit: PAGE_SIZE },
      })
      setReceipts(data.data)
      setTotal(data.total)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    load()
  }, [load])

  const reprint = async (id: string) => {
    setReprintingId(id)
    try {
      const { data } = await api.get<Receipt>(`/api/receipts/${id}`)
      setReprintReceipt(data)
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
      setReprintingId(null)
    }
  }

  // Once the off-screen document has rendered with the fetched snapshot,
  // export it to a PDF.
  useEffect(() => {
    if (!reprintReceipt || !reprintRef.current) return
    const node = reprintRef.current
    downloadReceiptPdf(node, `receipt_${reprintReceipt.buddhistYear}-${reprintReceipt.number}.pdf`, reprintReceipt.id)
      .catch((err) => toast({ variant: 'destructive', title: getApiErrorMessage(err) }))
      .finally(() => {
        setReprintingId(null)
        setReprintReceipt(null)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reprintReceipt])

  const rangeText =
    total === 0
      ? t('treatments:page.showingZero')
      : t('treatments:page.showingRange', {
          start: (page - 1) * PAGE_SIZE + 1,
          end: Math.min(page * PAGE_SIZE, total),
          total,
        })

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">{t('page.title')}</h1>

      {loadError ? (
        <ErrorCard onRetry={load} />
      ) : (
        <>
          <div className="rounded-md border border-gray-200 bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('page.number')}</TableHead>
                  <TableHead>{t('common:date')}</TableHead>
                  <TableHead>{t('labWork:type')}</TableHead>
                  <TableHead>{t('page.customerName')}</TableHead>
                  <TableHead className="text-right">{t('page.totalAmount')}</TableHead>
                  <TableHead>{t('page.issuedBy')}</TableHead>
                  <TableHead className="text-right">{t('common:actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={COL_COUNT} className="p-0">
                      <TableSkeleton cols={COL_COUNT} />
                    </TableCell>
                  </TableRow>
                ) : receipts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COL_COUNT} className="p-0">
                      <EmptyState message={t('page.noReceiptsYet')} />
                    </TableCell>
                  </TableRow>
                ) : (
                  receipts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">
                        {r.number}/{r.buddhistYear}
                      </TableCell>
                      <TableCell>{formatThaiDate(r.issueDate)}</TableCell>
                      <TableCell>{t(`page.${r.kind}`, r.kind)}</TableCell>
                      <TableCell className="font-medium text-gray-900">
                        {r.customerName}
                      </TableCell>
                      <TableCell className="text-right">฿ {formatBaht(r.totalAmount)}</TableCell>
                      <TableCell>{r.issuedByUsername ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={reprintingId === r.id}
                          onClick={() => reprint(r.id)}
                        >
                          {reprintingId === r.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 text-gray-600" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>{rangeText}</span>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}

      {/* Off-screen — rendered only to be captured by html2canvas when reprinting. */}
      {reprintReceipt && (
        <div style={{ position: 'fixed', top: 0, left: -9999 }}>
          <ReceiptDocument ref={reprintRef} receipt={reprintReceipt} />
        </div>
      )}
    </div>
  )
}
