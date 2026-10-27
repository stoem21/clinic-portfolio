import { forwardRef } from 'react'
import type { Receipt } from '@/types'
import demoLogo from '@/assets/demo-logo.svg'

// Fixed clinic letterhead — matches the header on every historical receipt
// (rcp.docx). No "clinic profile" settings exist elsewhere in this app to
// pull this from, so it's a plain constant here.
const CLINIC_NAME = 'คลินิกทันตกรรมตัวอย่าง (DEMO)'
const CLINIC_ADDRESS = 'ที่อยู่สมมติสำหรับแสดงตัวอย่างเท่านั้น'
const CLINIC_PHONE = '000-000-0000'
// The clinic's own tax ID — printed on every receipt, distinct from the
// customer's tax ID (which appears inside the customer-info box below, when
// the customer has one).
const CLINIC_TAX_ID = '0000000000000'

function formatThaiDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear() + 543}`
}
const formatBaht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface ReceiptDocumentProps {
  receipt: Receipt
}

// A field value rendered on its own underline, matching the fill-in-the-blank
// look of the paper receipt book — stretches to fill available width so the
// underline still shows even when the value is empty.
//
// The border is deliberately on its own empty div below the text, not on the
// text element itself: html2canvas (used to rasterize this into the
// downloaded PDF) miscalculates the border position when it shares a box
// with text — sitting mid-glyph instead of below it — but renders correctly
// once the border has no text content of its own. Confirmed by direct
// comparison of the live DOM (always correct) against html2canvas's actual
// captured output (broken until split this way).
function Underline({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex-1">
      <div className="min-h-[1.25rem] px-1">{children}</div>
      <div className="mt-2 border-b border-gray-400" />
    </div>
  )
}

// The printable/exportable receipt layout — used both for the rendered
// on-screen document and as the html2canvas source for the downloaded PDF.
// Laid out to match the clinic's physical receipt book (rcp.pdf / photographed
// sample), including the book/receipt number box and the letterhead logo.
// A forwardRef so the PDF generator can grab the DOM node directly.
export const ReceiptDocument = forwardRef<HTMLDivElement, ReceiptDocumentProps>(
  function ReceiptDocument({ receipt }, ref) {
    return (
      <div
        ref={ref}
        className="mx-auto w-[794px] bg-white p-10 text-gray-900"
        style={{ fontFamily: '"Noto Sans Thai", "Sarabun", sans-serif' }}
      >
        <div className="flex items-start justify-between border-b-2 border-gray-800 pb-3">
          <div className="flex items-start gap-3">
            <img src={demoLogo} alt="" className="h-20 w-20 shrink-0 object-contain" />
            <div>
              <h1 className="text-lg font-bold">{CLINIC_NAME}</h1>
              <p className="text-sm">{CLINIC_ADDRESS}</p>
              <p className="text-sm">โทร. {CLINIC_PHONE}</p>
            </div>
          </div>
          <div className="flex divide-x divide-gray-400 rounded border border-gray-400 text-center text-sm">
            <div className="w-24 px-3 py-2">
              <div className="text-gray-500">เล่มที่</div>
              <div className="mt-1 font-semibold">
                {receipt.bookNumber || ' '}
              </div>
              <div className="mt-2 border-b border-gray-400" />
            </div>
            <div className="w-24 px-3 py-2">
              <div className="text-gray-500">เลขที่</div>
              <div className="mt-1 font-semibold">
                {receipt.number}/{receipt.buddhistYear}
              </div>
              <div className="mt-2 border-b border-gray-400" />
            </div>
          </div>
        </div>

        <h2 className="my-4 text-center text-xl font-bold">ใบเสร็จรับเงิน</h2>

        <div className="flex items-baseline gap-2 text-sm">
          <span className="shrink-0 text-gray-500">เลขประจำตัวผู้เสียภาษี</span>
          <Underline>{CLINIC_TAX_ID}</Underline>
        </div>

        <div className="mt-3 border border-gray-800 text-sm">
          <div className="flex">
            <div className="flex-1 space-y-2 border-r border-gray-800 px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 font-semibold text-gray-700">ชื่อลูกค้า</span>
                <Underline>{receipt.customerName}</Underline>
              </div>
              {receipt.customerTaxId && (
                <div className="flex items-baseline gap-2">
                  <span className="shrink-0 font-semibold text-gray-700">เลขประจำตัวผู้เสียภาษี</span>
                  <Underline>{receipt.customerTaxId}</Underline>
                </div>
              )}
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 font-semibold text-gray-700">ที่อยู่</span>
                <Underline>{receipt.customerAddress}</Underline>
              </div>
            </div>
            <div className="w-40 shrink-0 space-y-3 px-3 py-2">
              <div>
                <div className="text-gray-500">รหัสคนไข้</div>
                <Underline>{receipt.patientHn}</Underline>
              </div>
              <div>
                <div className="text-gray-500">วันที่</div>
                <Underline>{formatThaiDate(receipt.issueDate)}</Underline>
              </div>
            </div>
          </div>

          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col />
              <col style={{ width: '10rem' }} />
            </colgroup>
            <tbody>
              <tr className="border-b-2 border-t border-gray-800">
                <th className="border-r border-gray-800 py-2 pl-3 text-left font-semibold">
                  รายการรักษา
                </th>
                <th className="py-2 pr-3 text-right font-semibold">จำนวนเงิน</th>
              </tr>
              {receipt.lineItems.map((li, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="border-r border-gray-800 py-2 pl-3">• {li.label}</td>
                  <td className="py-2 pr-3 text-right">{formatBaht(li.amount)}</td>
                </tr>
              ))}
              {/* Pad with a few blank rows so the table has visual weight, matching
                  the original paper receipts' fixed-height layout. */}
              {Array.from({ length: Math.max(0, 6 - receipt.lineItems.length) }).map((_, i) => (
                <tr key={`pad-${i}`} className="border-b border-gray-200">
                  <td className="border-r border-gray-800 py-2 pl-3">&nbsp;</td>
                  <td className="py-2 pr-3">&nbsp;</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-800 font-semibold">
                <td className="border-r border-gray-800 py-2 pl-3 text-right">รวมทั้งสิ้น</td>
                <td className="py-2 pr-3 text-right">{formatBaht(receipt.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-center text-sm">
          <p className="font-semibold underline underline-offset-4">{receipt.amountText}</p>
          <p className="mt-1 text-gray-500">จำนวนเงินเป็นตัวอักษร</p>
        </div>

        <div className="mt-16 flex justify-end">
          <div className="w-56 text-center text-sm">
            <div className="border-b border-gray-400 pb-8" />
            <p className="mt-1">ผู้รับเงิน</p>
            <div className="mt-6 flex justify-center">
              <span className="shrink-0">วันที่</span>
              <div className="w-24">
                <div className="min-h-[1.25rem]" />
                <div className="mt-2 border-b border-gray-400" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  },
)
