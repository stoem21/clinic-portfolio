import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Banknote,
  CalendarDays,
  ClipboardList,
  ListTree,
  UserPlus,
  Users,
} from 'lucide-react'

import { api } from '@/lib/api'
import { clinicToday } from '@/lib/clinicDay'
import type { DashboardData } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { paymentTypeOptions, labelOf } from '@/lib/treatmentOptions'
import { formatBaht, formatNumber, formatThaiDate } from '@/lib/format'
import { typeText } from '@/components/treatment/TreatmentItemSummary'
import { ErrorCard } from '@/components/ErrorCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function monthStartISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}-01`
}

function StatCard({
  icon,
  label,
  value,
  loading,
  accent = 'text-blue-600',
}: {
  icon: React.ReactNode
  label: string
  value: string
  loading: boolean
  accent?: string
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      {loading ? (
        <div className="mt-2 h-9 w-24 animate-pulse rounded bg-gray-100" />
      ) : (
        <p className={`mt-2 text-3xl font-bold ${accent}`}>{value}</p>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { t } = useTranslation('dashboard')
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)
  // Only the owner can pick a custom period; USER/ADMIN are locked to today.
  const isOwner = role === 'SUPER_ADMIN'
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [from, setFrom] = useState(isOwner ? monthStartISO() : todayISO())
  const [to, setTo] = useState(todayISO())
  // Lab cost defaults to showing every unpaid entry regardless of date (an
  // all-time standing balance) even for the owner — only once they actually
  // touch a date input does it start following from/to, same as income.
  const [labCostTouched, setLabCostTouched] = useState(false)
  // Picked from the dropdown below, independent of any single day's row —
  // navigates to that dentist's full report for the selected period.
  const [selectedDentistId, setSelectedDentistId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<DashboardData>('/api/dashboard', {
        params: isOwner ? { from, to } : {},
      })
      setData(res.data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [from, to, isOwner])

  useEffect(() => {
    load()
  }, [load])

  const maxTypeCount = data
    ? Math.max(1, ...data.treatmentsByType.map((t) => t.count))
    : 1
  const maxDentistSlots = data
    ? Math.max(0, ...data.dailyBreakdown.map((d) => d.dentists.length))
    : 0
  // Every dentist with any activity in the selected period, deduplicated
  // across days and sorted by name, for the "view detail" dropdown below.
  const dentistOptions = data
    ? Array.from(
        new Map(
          data.dailyBreakdown.flatMap((d) => d.dentists).map((x) => [x.dentistId, x]),
        ).values(),
      ).sort((a, b) => a.name.localeCompare(b.name))
    : []

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>

      {error ? (
        <div className="lg:max-w-2xl">
          <ErrorCard onRetry={load} />
        </div>
      ) : (
        <>
          {/* Headline stats — shown to SUPER_ADMIN only */}
          {isOwner && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              icon={<Banknote className="h-5 w-5" />}
              label={t('revenueToday')}
              value={`฿ ${formatBaht(data?.revenueToday ?? 0)}`}
              loading={loading}
              accent="text-green-600"
            />
            {isOwner && (
              <StatCard
                icon={<Banknote className="h-5 w-5" />}
                label={t('revenueMonth')}
                value={`฿ ${formatBaht(data?.revenueMonth ?? 0)}`}
                loading={loading}
                accent="text-green-600"
              />
            )}
            <StatCard
              icon={<ClipboardList className="h-5 w-5" />}
              label={t('todayRecords')}
              value={formatNumber(data?.todayTreatments ?? 0)}
              loading={loading}
            />
            <StatCard
              icon={<Users className="h-5 w-5" />}
              label={t('totalClients')}
              value={formatNumber(data?.totalClients ?? 0)}
              loading={loading}
            />
            <StatCard
              icon={<UserPlus className="h-5 w-5" />}
              label={t('newPatientsMonth')}
              value={formatNumber(data?.newPatientsMonth ?? 0)}
              loading={loading}
            />
          </div>
          )}

          {/* By-type chart (this month) — shown to SUPER_ADMIN only */}
          {isOwner && (
          <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">
                {t('treatmentTypesThisMonth')}
              </h2>
            </div>
            {loading ? (
              <div className="h-32 animate-pulse rounded bg-gray-100" />
            ) : !data || data.treatmentsByType.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {t('noDataThisMonth')}
              </p>
            ) : (
              <div className="space-y-3">
                {data.treatmentsByType.map((tt) => (
                  <div key={tt.type} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-sm text-gray-700">
                      {typeText(tt.type)}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
                      <div
                        className="h-full rounded bg-blue-500"
                        style={{ width: `${(tt.count / maxTypeCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm font-medium text-gray-900">
                      {tt.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Period summary — the date range drives income-by-type, total
              income, and the per-dentist report below. */}
          <div className="space-y-6 rounded-md border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-gray-500" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {isOwner ? t('summaryByPeriod') : t('summaryToday')}
                </h2>
              </div>
              {isOwner && (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('from')}</Label>
                    <Input
                      type="date"
                      value={from}
                      max={to}
                      onChange={(e) => {
                        setFrom(e.target.value)
                        setLabCostTouched(true)
                      }}
                      className="w-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('to')}</Label>
                    <Input
                      type="date"
                      value={to}
                      min={from}
                      max={clinicToday()}
                      onChange={(e) => {
                        if (e.target.value > clinicToday()) return
                        setTo(e.target.value)
                        setLabCostTouched(true)
                      }}
                      className="w-40"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Total income for the selected period */}
            <div className="flex items-center justify-between rounded-md bg-green-50 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-green-700">
                <Banknote className="h-5 w-5" />
                {isOwner ? t('totalRevenueSelectedPeriod') : t('totalRevenueToday')}
              </span>
              {loading ? (
                <div className="h-7 w-32 animate-pulse rounded bg-green-100" />
              ) : (
                <span className="text-2xl font-bold text-green-700">
                  ฿ {formatBaht(data?.rangeTotalRevenue ?? 0)}
                </span>
              )}
            </div>

            {/* Jump to one dentist's full drill-down report (separate page)
                for the selected period, independent of any single day's row
                in the table below. */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                {t('viewDentistDetail.title')}
              </h3>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-56 space-y-1">
                  <Label className="text-xs">{t('viewDentistDetail.selectLabel')}</Label>
                  <Select value={selectedDentistId} onValueChange={setSelectedDentistId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('viewDentistDetail.placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {dentistOptions.map((d) => (
                        <SelectItem key={d.dentistId} value={d.dentistId}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  disabled={!selectedDentistId}
                  onClick={() => {
                    if (!selectedDentistId) return
                    navigate(
                      `/dashboard/dentist/${selectedDentistId}?from=${from}&to=${to}${
                        isOwner && labCostTouched ? '&scopeLabCost=true' : ''
                      }`,
                    )
                  }}
                >
                  <ListTree className="h-4 w-4" />
                  {t('viewDentistDetail.button')}
                </Button>
              </div>
              {!loading && dentistOptions.length === 0 && (
                <p className="mt-2 text-sm text-gray-400">{t('noDataSelectedPeriod')}</p>
              )}
            </div>

            {/* Day-by-day breakdown — one row per calendar day with any
                activity in the period: how that day's income was received
                (cash/transfer/social security), supply cost, and each
                active dentist's revenue that day. Dentist columns are
                generic numbered slots (not one fixed column per dentist)
                since which dentists work which day varies — the actual
                dentist name is shown inside each cell, linking to their
                full drill-down report. */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                {t('dailyBreakdown.title')}
              </h3>
              {loading ? (
                <div className="h-40 animate-pulse rounded bg-gray-100" />
              ) : !data || data.dailyBreakdown.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">
                  {t('noDataSelectedPeriod')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">{t('common:date')}</TableHead>
                        <TableHead className="text-right">{labelOf(paymentTypeOptions, 'cash')}</TableHead>
                        <TableHead className="text-right">{labelOf(paymentTypeOptions, 'transfer')}</TableHead>
                        <TableHead className="text-right">{labelOf(paymentTypeOptions, 'socialSecurity')}</TableHead>
                        <TableHead className="text-right">{t('dailyBreakdown.supplyCost')}</TableHead>
                        {Array.from({ length: maxDentistSlots }).map((_, i) => (
                          <TableHead key={i} className="whitespace-nowrap text-right">
                            {t('dailyBreakdown.dentistColumn', { n: i + 1 })}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.dailyBreakdown.map((day) => (
                        <TableRow key={day.date}>
                          <TableCell className="whitespace-nowrap font-medium text-gray-900">
                            {formatThaiDate(day.date)}
                          </TableCell>
                          <TableCell className="text-right">฿ {formatBaht(day.cash)}</TableCell>
                          <TableCell className="text-right">฿ {formatBaht(day.transfer)}</TableCell>
                          <TableCell className="text-right">฿ {formatBaht(day.socialSecurity)}</TableCell>
                          <TableCell className="text-right">฿ {formatBaht(day.supplyCost)}</TableCell>
                          {Array.from({ length: maxDentistSlots }).map((_, i) => {
                            const dentist = day.dentists[i]
                            return (
                              <TableCell key={i} className="whitespace-nowrap text-right">
                                {dentist ? (
                                  <Link
                                    to={`/dashboard/dentist/${dentist.dentistId}?from=${from}&to=${to}${
                                      isOwner && labCostTouched ? '&scopeLabCost=true' : ''
                                    }`}
                                    className="text-blue-600 hover:underline"
                                  >
                                    {dentist.name}: ฿ {formatBaht(dentist.revenue)}
                                  </Link>
                                ) : (
                                  '—'
                                )}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold text-gray-900">
                        <TableCell>{t('dailyBreakdown.totalRow')}</TableCell>
                        <TableCell className="text-right">
                          ฿ {formatBaht(data.dailyBreakdown.reduce((sum, d) => sum + d.cash, 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          ฿ {formatBaht(data.dailyBreakdown.reduce((sum, d) => sum + d.transfer, 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          ฿ {formatBaht(data.dailyBreakdown.reduce((sum, d) => sum + d.socialSecurity, 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          ฿ {formatBaht(data.dailyBreakdown.reduce((sum, d) => sum + d.supplyCost, 0))}
                        </TableCell>
                        {Array.from({ length: maxDentistSlots }).map((_, i) => (
                          <TableCell key={i} />
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
