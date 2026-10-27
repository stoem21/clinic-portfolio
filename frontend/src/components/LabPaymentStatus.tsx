import { useTranslation } from 'react-i18next'
import { formatThaiDate } from '@/lib/format'

export function LabPaymentStatus({ status, paidAt, historical = false }: {
  status: 'paid' | 'unpaid' | 'paid-later'
  paidAt: string | null
  historical?: boolean
}) {
  const { t } = useTranslation('labWork')
  const date = paidAt ? formatThaiDate(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(paidAt))) : null
  return <div className="space-y-1 text-xs">
    <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
      {status === 'paid' ? t('paid') : historical ? t('unpaidAsOf') : t('unpaid')}
    </span>
    {status !== 'unpaid' && <div className="text-gray-500">{date ? t(status === 'paid-later' ? 'paidLaterDate' : 'paidOnDate', { date }) : t('paymentDateUnknown')}</div>}
  </div>
}
