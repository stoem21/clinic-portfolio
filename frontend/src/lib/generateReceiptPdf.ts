import { api } from '@/lib/api'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

// Rasterizes the rendered receipt DOM node into a PDF sized to match it
// exactly (no page-fitting math needed), then triggers a download. Chosen
// over embedding real text in jsPDF specifically to avoid the well-known pain
// of getting Thai glyphs to render correctly with jsPDF's font system —
// html2canvas captures whatever the browser already renders correctly.
export async function downloadReceiptPdf(node: HTMLElement, filename: string, receiptId: string): Promise<void> {
  // The receipt node is mounted off-screen and captured on the same tick it
  // appears, via a useEffect that fires right after mount — but html2canvas
  // reads layout/font metrics as they are *right now*, and fonts can still be
  // mid-load at that instant. Capturing before they've settled makes
  // html2canvas mis-measure text, so every border-bottom underline renders a
  // few pixels too high (cutting through the text instead of sitting below
  // it) despite the live page looking correct moments later. Waiting for
  // fonts plus a couple of animation frames lets layout fully settle first.
  await document.fonts.ready
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

  const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' })
  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF({
    orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height],
  })
  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height)
  await api.post('/api/audit/export', { entity: 'receipt', entityId: receiptId, format: 'pdf', count: 1, columns: [] })
  pdf.save(filename)
}
