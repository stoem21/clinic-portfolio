import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { getApiErrorMessage } from '@/lib/apiError'
import type {
  Client,
  Dentist,
  TreatmentListResponse,
  TreatmentRecord,
} from '@/types'
import { formatThaiDate } from '@/lib/format'
import { typeText } from '@/components/treatment/TreatmentItemSummary'
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

function Section({
  title,
  loading,
  empty,
  children,
}: {
  title: string
  loading: boolean
  empty: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation('trash')
  return (
    <div className="rounded-md border border-gray-200 bg-white shadow-sm">
      <h2 className="border-b border-gray-100 px-4 py-3 text-base font-semibold text-gray-900">
        {title}
      </h2>
      {loading ? (
        <div className="py-8 text-center text-gray-400">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      ) : empty ? (
        <EmptyState message={t('noDeletedItems')} />
      ) : (
        children
      )}
    </div>
  )
}

export default function TrashPage() {
  const { t } = useTranslation('trash')
  const { toast } = useToast()
  const [clients, setClients] = useState<Client[]>([])
  const [dentists, setDentists] = useState<Dentist[]>([])
  const [treatments, setTreatments] = useState<TreatmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, d, t] = await Promise.all([
        api.get<{ data: Client[] }>('/api/clients', {
          params: { deleted: 'true', limit: 'all' },
        }),
        api.get<Dentist[]>('/api/dentists', { params: { deleted: 'true' } }),
        api.get<TreatmentListResponse>('/api/treatments', {
          params: { deleted: 'true', limit: 'all' },
        }),
      ])
      setClients(c.data.data)
      setDentists(d.data)
      setTreatments(t.data.data)
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const restore = async (kind: 'clients' | 'dentists' | 'treatments', id: string) => {
    setBusy(id)
    try {
      await api.patch(`/api/${kind}/${id}/restore`)
      toast({ title: t('restoredSuccess') })
      load()
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const RestoreBtn = ({
    kind,
    id,
  }: {
    kind: 'clients' | 'dentists' | 'treatments'
    id: string
  }) => (
    <Button
      variant="outline"
      size="sm"
      disabled={busy === id}
      onClick={() => restore(kind, id)}
    >
      {busy === id ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RotateCcw className="h-4 w-4" />
      )}
      {t('restore')}
    </Button>
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">{t('nav:items.trash')}</h1>
      <p className="-mt-3 text-sm text-gray-500">
        {t('subtitle')}
      </p>

      <Section title={t('patientsSection', { count: clients.length })} loading={loading} empty={clients.length === 0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>HN</TableHead>
              <TableHead>{t('clients:page.fullName')}</TableHead>
              <TableHead>{t('clients:page.phone')}</TableHead>
              <TableHead className="text-right">{t('common:actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono">{c.hn}</TableCell>
                <TableCell className="font-medium text-gray-900">
                  {c.nameTitle}
                  {c.firstName} {c.lastName}
                </TableCell>
                <TableCell>{c.phoneNumber}</TableCell>
                <TableCell className="text-right">
                  <RestoreBtn kind="clients" id={c.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title={t('dentistsSection', { count: dentists.length })} loading={loading} empty={dentists.length === 0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('dentists:name')}</TableHead>
              <TableHead>{t('dentists:licenseId')}</TableHead>
              <TableHead className="text-right">{t('common:actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dentists.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium text-gray-900">{d.name}</TableCell>
                <TableCell>{d.licenseId}</TableCell>
                <TableCell className="text-right">
                  <RestoreBtn kind="dentists" id={d.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title={t('treatmentsSection', { count: treatments.length })}
        loading={loading}
        empty={treatments.length === 0}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common:date')}</TableHead>
              <TableHead>HN</TableHead>
              <TableHead>{t('dashboard:patient')}</TableHead>
              <TableHead>{t('labWork:type')}</TableHead>
              <TableHead className="text-right">{t('common:actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {treatments.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatThaiDate(r.treatmentDate)}</TableCell>
                <TableCell className="font-mono">{r.client.hn}</TableCell>
                <TableCell>
                  {r.client.firstName} {r.client.lastName}
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {r.items.map((i) => typeText(i.type)).join(', ')}
                </TableCell>
                <TableCell className="text-right">
                  <RestoreBtn kind="treatments" id={r.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  )
}
