import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import i18n from '@/i18n'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { getApiErrorMessage } from '@/lib/apiError'
import type { AuditLog, AuditListResponse } from '@/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
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
import { EmptyState } from '@/components/EmptyState'
import { Pagination } from '@/components/Pagination'

const ENTITY_KEYS = ['hn-counter', 'client', 'dentist', 'treatment', 'user', 'lab-work', 'receipt', 'follow-up-call', 'session', 'security', 'backup', 'audit', 'ortho-missed', 'ops-schedule', 'ops-exception', 'ops-appointment', 'ops-call', 'ops-expense', 'ops-evidence', 'ops-permission'] as const

const ACTION_KEYS = [
  'create',
  'update',
  'delete',
  'restore',
  'activate',
  'deactivate',
  'reset-password',
  'ortho-start',
  'ortho-end',
  'login-success', 'login-failed', 'login-challenge', 'logout', 'change-password',
  'view', 'list', 'access-denied', 'export-requested', 'print-requested',
  'download-requested', 'download-failed', 'reverse', 'attach', 'discard',
] as const

const ACTION_CLASS: Record<string, string> = {
  create: 'bg-green-50 text-green-700',
  update: 'bg-blue-50 text-blue-700',
  delete: 'bg-red-50 text-red-700',
  restore: 'bg-amber-50 text-amber-700',
  activate: 'bg-green-50 text-green-700',
  deactivate: 'bg-gray-100 text-gray-600',
  'reset-password': 'bg-purple-50 text-purple-700',
  'ortho-start': 'bg-teal-50 text-teal-700',
  'ortho-end': 'bg-orange-50 text-orange-700',
}

function formatChangeValue(v: string | number | boolean | null): string {
  if (v === null || v === '') return i18n.t('audit:empty')
  if (typeof v === 'boolean') return v ? i18n.t('common:yes') : i18n.t('common:no')
  // ISO datetime -> date only, Buddhist year, to match the rest of the page.
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      return `${dd}/${mm}/${d.getFullYear() + 543}`
    }
  }
  return String(v)
}

const ALL = 'all'

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear() + 543} ${hh}:${mi}`
}

export default function AuditPage() {
  const { t } = useTranslation('audit')
  const { toast } = useToast()
  const [rows, setRows] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const [entity, setEntity] = useState(ALL)
  const [action, setAction] = useState(ALL)
  const [hn, setHn] = useState('')
  const [actor, setActor] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<AuditListResponse>('/api/audit', {
        params: {
          page,
          limit: 20,
          entity: entity === ALL ? undefined : entity,
          action: action === ALL ? undefined : action,
          hn: hn.trim() || undefined,
          actor: actor.trim() || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      })
      setRows(res.data.data)
      setTotalPages(res.data.totalPages)
      setTotal(res.data.total)
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setLoading(false)
    }
  }, [page, entity, action, hn, actor, from, to, toast])

  useEffect(() => {
    load()
  }, [load])

  // Reset to page 1 whenever a filter changes.
  const onFilter = (fn: () => void) => {
    fn()
    setPage(1)
  }

  const resetFilters = () => {
    setEntity(ALL)
    setAction(ALL)
    setHn('')
    setActor('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-md border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-2">
          <Label>{t('entityType')}</Label>
          <Select value={entity} onValueChange={(v) => onFilter(() => setEntity(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('treatments:page.all')}</SelectItem>
              {ENTITY_KEYS.map((v) => (
                <SelectItem key={v} value={v}>
                  {t(`entity.${v}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('action')}</Label>
          <Select value={action} onValueChange={(v) => onFilter(() => setAction(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('treatments:page.all')}</SelectItem>
              {ACTION_KEYS.map((v) => (
                <SelectItem key={v} value={v}>
                  {t(`actionLabel.${v}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('hnLabel')}</Label>
          <Input
            placeholder={t('hnPlaceholder')}
            value={hn}
            onChange={(e) => onFilter(() => setHn(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('actor')}</Label>
          <Input
            placeholder={t('actorPlaceholder')}
            value={actor}
            onChange={(e) => onFilter(() => setActor(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('from')}</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => onFilter(() => setFrom(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('to')}</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => onFilter(() => setTo(e.target.value))}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{t('totalRecords', { count: total })}</span>
        <Button variant="outline" size="sm" onClick={resetFilters}>
          {t('common:clearFilters')}
        </Button>
      </div>

      <div className="rounded-md border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-gray-400">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message={t('noRecordsFound')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">{t('time')}</TableHead>
                <TableHead>{t('actor')}</TableHead>
                <TableHead>{t('action')}</TableHead>
                <TableHead>{t('labWork:type')}</TableHead>
                <TableHead>{t('details')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-gray-600">
                    {formatDateTime(r.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium text-gray-900">
                    {r.actorUsername}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        ACTION_CLASS[r.action] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {t(`actionLabel.${r.action}`, r.action)}
                    </span>
                  </TableCell>
                  <TableCell>{t(`entity.${r.entity}`, r.entity)}</TableCell>
                  <TableCell className="text-gray-700">
                    {r.summary ?? '—'}
                    {r.entityId && <div className="text-xs text-gray-500">ID: {r.entityId}</div>}
                    {r.context && (
                      <details className="mt-1 text-xs text-gray-500">
                        <summary className="cursor-pointer">{t('requestDetails')}</summary>
                        <dl className="mt-1 space-y-1 break-all">
                          {Object.entries(r.context).filter(([, value]) => value !== null && value !== '').map(([key, value]) => (
                            <div key={key}>
                              <dt className="inline font-medium">{t(`context.${key}`, key)}: </dt>
                              <dd className="inline">{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                    {r.changes && r.changes.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {r.changes.map((c) => (
                          <li
                            key={c.field}
                            className="text-xs leading-snug text-gray-500"
                          >
                            <span className="font-medium text-gray-600">
                              {t(`field.${c.field}`, c.field)}:
                            </span>{' '}
                            <span className="text-red-600 line-through">
                              {formatChangeValue(c.before)}
                            </span>
                            <span className="mx-1 text-gray-400">→</span>
                            <span className="text-green-700">
                              {formatChangeValue(c.after)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex justify-end">
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  )
}
