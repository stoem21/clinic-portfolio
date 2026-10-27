import { Fragment, useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Banknote, FlaskConical, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { clinicToday } from '@/lib/clinicDay'
import { LabPaymentStatus } from '@/components/LabPaymentStatus'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/authStore'
import type { DentistReport } from '@/types'
import { labWorkTypeOptions, labelOf } from '@/lib/treatmentOptions'
import { formatBaht, formatThaiDate } from '@/lib/format'
import { typeText, formatDetail } from '@/components/treatment/TreatmentItemSummary'
import { ErrorCard } from '@/components/ErrorCard'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default function DentistReportPage() {
  const { t } = useTranslation('dashboard')
  const { dentistId = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isOwner = useAuthStore(s => s.user?.role === 'SUPER_ADMIN')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [data, setData] = useState<DentistReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? undefined
  const scopeLabCost = searchParams.get('scopeLabCost') ?? undefined

  const load = useCallback(async () => {
    if (!dentistId) return
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<DentistReport>(`/api/dashboard/dentist/${dentistId}`, {
        params: { from, to, scopeLabCost },
      })
      setData(res.data)
      setExpanded(new Set())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [dentistId, from, to, scopeLabCost])

  useEffect(() => {
    load()
  }, [load])

  const days = new Map<string, DentistReport['treatmentRecords']>()
  for (const record of data?.treatmentRecords ?? []) {
    const key = record.treatmentDate.slice(0, 10)
    if (!days.has(key)) days.set(key, [])
    days.get(key)!.push(record)
  }
  const changeDate = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('from', from ?? data!.range.from.slice(0, 10))
    params.set('to', to ?? data!.range.to.slice(0, 10))
    params.set(key, value)
    if (params.get('from')! > params.get('to')! || params.get('to')! > clinicToday()) return
    setSearchParams(params)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-md">
        <ErrorCard message={t('dentistReport.loadError')} onRetry={load} />
      </div>
    )
  }

  const displayedLab = data.labCost
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{data.name}</h1>
          <p className="text-sm text-gray-500">{t('dentistReport.subtitle')}</p>
        </div>
      </div>

      {/* 1. Treatment records — patient, what was done, cost */}
      {isOwner && <div className="flex gap-4">
        <label>{t('followUp:from')}<Input type="date" value={from ?? data.range.from.slice(0, 10)} max={to ?? data.range.to.slice(0, 10)} onChange={e => { if (e.target.value) changeDate('from', e.target.value) }} /></label>
        <label>{t('followUp:to')}<Input type="date" max={clinicToday()} value={to ?? data.range.to.slice(0, 10)} min={from ?? data.range.from.slice(0, 10)} onChange={e => { if (e.target.value) changeDate('to', e.target.value) }} /></label>
      </div>}
      <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t('dentistReport.treatmentRecords')}</h2>
        {data.treatmentRecords.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {t('dentistReport.noRecords')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common:date')}</TableHead>
                <TableHead>{t('patient')}</TableHead>
                <TableHead>{t('item')}</TableHead>
                <TableHead className="text-right">{t('dentistReport.treatmentCost')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...days].map(([day, records]) => <Fragment key={day}>
                <TableRow>
                  <TableCell colSpan={3}><Button variant="ghost" aria-expanded={expanded.has(day)} onClick={() => setExpanded(previous => {
                    const next = new Set(previous)
                    if (next.has(day)) next.delete(day); else next.add(day)
                    return next
                  })}>{expanded.has(day) ? '−' : '+'} {formatThaiDate(day)}</Button></TableCell>
                  <TableCell className="text-right font-semibold">฿ {formatBaht(records.reduce((sum, r) => sum + Math.round(r.cost * 100), 0) / 100)}</TableCell>
                </TableRow>
              {expanded.has(day) && records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatThaiDate(r.treatmentDate.slice(0, 10))}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.client.nameTitle}
                    {r.client.firstName} {r.client.lastName}
                  </TableCell>
                  <TableCell>
                    {r.items
                      .map((i) => {
                        const detail = formatDetail(i.type, i.data as Record<string, any>)
                        return detail ? `${typeText(i.type)}: ${detail}` : typeText(i.type)
                      })
                      .join(', ')}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    ฿ {formatBaht(r.cost)}
                  </TableCell>
                </TableRow>
              ))}
              </Fragment>)}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 2. Relevant lab portions, with an explicit per-row deduction. */}
      <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">{t('labWork:periodLab')}</h2>
        </div>
        <p className="mb-3 text-sm text-gray-500">{t(data.labCostMode === 'unpaid-today' ? 'labWork:deductUnpaidToday' : 'labWork:deductPaidPeriod')}</p>
        {data.labCostUnknownDates > 0 && <p role="alert" className="mb-3 text-amber-700">{t('labWork:reviewWarning', { count: data.labCostUnknownDates })}</p>}
        <p className="mb-3 font-semibold">{t('labWork:deduction')} ฿ {formatBaht(displayedLab.total)}</p>
        {displayedLab.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">{t('labWork:noItemsFound')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('patient')}</TableHead>
                <TableHead>{t('labWorkType')}</TableHead>
                <TableHead>{t('labWork:portion')}</TableHead>
                <TableHead>{t('labWork:paymentStatus')}</TableHead>
                <TableHead className="text-right">{t('amount')}</TableHead>
                <TableHead className="text-right">{t('labWork:deduction')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedLab.items.map((item, index) => (<Fragment key={item.id}>
                {item.issue && !displayedLab.items[index - 1]?.issue && <TableRow><TableCell colSpan={6} className="font-semibold text-amber-700">{t('labWork:reviewGroup')}</TableCell></TableRow>}
                <TableRow key={item.id}>
                  <TableCell>{item.patientName}</TableCell>
                  <TableCell>{labelOf(labWorkTypeOptions, item.type)}{item.typeDescription && `: ${item.typeDescription}`}</TableCell>
                  <TableCell>{t(`labWork:${item.portion}`)}</TableCell>
                  <TableCell><LabPaymentStatus status={item.status} paidAt={item.paidAt} />{item.issue && <p className="text-xs text-amber-700">{t(`labWork:issue.${item.issue}`)}</p>}</TableCell>
                  <TableCell className="text-right">{item.amount === null ? t('labWork:issue.missing-cost') : `฿ ${formatBaht(item.amount)}`}</TableCell>
                  <TableCell className="text-right">{item.deduction > 0 ? `฿ ${formatBaht(item.deduction)}` : t('labWork:notDeducted')}</TableCell>
                </TableRow>
              </Fragment>))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 3. Sum */}
      <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Banknote className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">{t('dentistReport.summary')}</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('totalRevenue')}</TableHead>
              <TableHead className="text-right">{t('labWork:deduction')}</TableHead>
              <TableHead className="text-right">{t('labWork:afterDeduction')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>฿ {formatBaht(data.incomeTotal)}</TableCell>
              <TableCell className="text-right">฿ {formatBaht(data.labCost.total)}</TableCell>
              <TableCell
                className={`text-right font-semibold ${
                  data.net < 0 ? 'text-red-600' : 'text-green-700'
                }`}
              >
                ฿ {formatBaht(data.net)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
