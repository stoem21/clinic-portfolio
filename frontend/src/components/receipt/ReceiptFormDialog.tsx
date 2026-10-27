import { useEffect, useRef, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { getApiErrorMessage } from '@/lib/apiError'
import { downloadReceiptPdf } from '@/lib/generateReceiptPdf'
import { formatBaht } from '@/lib/format'
import type { Receipt, ReceiptInput, ReceiptLineItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ReceiptDocument } from './ReceiptDocument'

export interface ReceiptFormInitial {
  customerName: string
  customerAddress?: string
  customerTaxId?: string
  patientHn?: string
  issueDate: string // yyyy-mm-dd, for the date input
  lineItems: ReceiptLineItem[]
  treatmentRecordIds: string[]
}

interface ReceiptFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: 'individual' | 'bulk'
  initial: ReceiptFormInitial | null
  onIssued?: () => void
}

// Editable pre-generation form — customer info + line items, all defaulted
// from `initial` but adjustable before the receipt is actually issued. On
// confirm: POST /api/receipts, then render the styled document off-screen and
// export it to a downloaded PDF.
export function ReceiptFormDialog({
  open,
  onOpenChange,
  kind,
  initial,
  onIssued,
}: ReceiptFormDialogProps) {
  const { t } = useTranslation('receipts')
  const { toast } = useToast()
  const [bookNumber, setBookNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerTaxId, setCustomerTaxId] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [lineItems, setLineItems] = useState<ReceiptLineItem[]>([])
  const [submitting, setSubmitting] = useState(false)

  // The issued receipt, rendered off-screen once created so html2canvas can
  // capture it, then exported to PDF.
  const [issuedReceipt, setIssuedReceipt] = useState<Receipt | null>(null)
  const documentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !initial) return
    setBookNumber('')
    setCustomerName(initial.customerName)
    setCustomerAddress(initial.customerAddress ?? '')
    setCustomerTaxId(initial.customerTaxId ?? '')
    setIssueDate(initial.issueDate)
    setLineItems(initial.lineItems)
    setIssuedReceipt(null)
  }, [open, initial])

  const total = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0)

  const patchLine = (index: number, patch: Partial<ReceiptLineItem>) =>
    setLineItems((prev) => prev.map((li, i) => (i === index ? { ...li, ...patch } : li)))
  const addLine = () => setLineItems((prev) => [...prev, { label: '', amount: 0 }])
  const removeLine = (index: number) =>
    setLineItems((prev) => prev.filter((_, i) => i !== index))

  const handleSubmit = async () => {
    if (!initial) return
    if (!customerName.trim()) {
      toast({ variant: 'destructive', title: t('form.customerNameRequired') })
      return
    }
    if (lineItems.length === 0 || lineItems.some((li) => !li.label.trim())) {
      toast({ variant: 'destructive', title: t('form.lineItemsRequired') })
      return
    }
    if (kind === 'bulk' && !customerAddress.trim()) {
      toast({ variant: 'destructive', title: t('form.addressRequiredForBulk') })
      return
    }

    setSubmitting(true)
    try {
      const payload: ReceiptInput = {
        bookNumber: bookNumber.trim() || null,
        kind,
        customerName: customerName.trim(),
        customerAddress: customerAddress.trim() || null,
        customerTaxId: customerTaxId.trim() || null,
        patientHn: initial.patientHn ?? null,
        issueDate,
        lineItems: lineItems.map((li) => ({ label: li.label.trim(), amount: Number(li.amount) || 0 })),
        treatmentRecordIds: initial.treatmentRecordIds,
      }
      const { data } = await api.post<Receipt>('/api/receipts', payload)
      setIssuedReceipt(data)
      toast({ title: t('form.issuedSuccess', { number: data.number, year: data.buddhistYear }) })
      onIssued?.()
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setSubmitting(false)
    }
  }

  // Once the receipt is issued and the off-screen document has rendered,
  // export it to a PDF and close.
  useEffect(() => {
    if (!issuedReceipt || !documentRef.current) return
    const node = documentRef.current
    downloadReceiptPdf(node, `receipt_${issuedReceipt.buddhistYear}-${issuedReceipt.number}.pdf`, issuedReceipt.id)
      .catch((err) => toast({ variant: 'destructive', title: getApiErrorMessage(err) }))
      .finally(() => onOpenChange(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuedReceipt])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {kind === 'bulk' ? t('form.createBulkTitle') : t('form.createTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('form.bookNumber')}</Label>
                <Input value={bookNumber} onChange={(e) => setBookNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('form.customerName')}</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('common:date')}</Label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t('form.address')}{kind === 'bulk' ? ' *' : ''}</Label>
                <Input
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('form.taxId')}</Label>
                <Input
                  value={customerTaxId}
                  onChange={(e) => setCustomerTaxId(e.target.value)}
                />
              </div>
              {initial?.patientHn && (
                <div className="space-y-2">
                  <Label>{t('form.patientHn')}</Label>
                  <Input value={initial.patientHn} disabled readOnly className="bg-gray-50" />
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-base">{t('form.items')}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-4 w-4" />
                  {t('form.addItem')}
                </Button>
              </div>
              <div className="space-y-2">
                {lineItems.map((li, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <Input
                      className="min-w-40 flex-1"
                      placeholder={t('form.itemPlaceholder')}
                      value={li.label}
                      onChange={(e) => patchLine(index, { label: e.target.value })}
                    />
                    <Input
                      className="w-32"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={String(li.amount)}
                      onChange={(e) => patchLine(index, { amount: Number(e.target.value) || 0 })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={lineItems.length <= 1}
                      onClick={() => removeLine(index)}
                    >
                      <X className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-right text-sm font-medium text-gray-900">
                {t('form.grandTotal')} ฿ {formatBaht(total)}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:cancel')}
            </Button>
            <Button type="button" disabled={submitting} onClick={handleSubmit}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('form.confirmCreate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Off-screen — rendered only to be captured by html2canvas once issued. */}
      {issuedReceipt && (
        <div style={{ position: 'fixed', top: 0, left: -9999 }}>
          <ReceiptDocument ref={documentRef} receipt={issuedReceipt} />
        </div>
      )}
    </>
  )
}
