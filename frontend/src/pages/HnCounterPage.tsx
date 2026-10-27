import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/apiError'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorCard } from '@/components/ErrorCard'
import { ConfirmDialog } from '@/components/ConfirmDialog'

type Counter = { year: number; count: number; minimum: number; version: number; highestHn: string | null; nextHn: string }
export default function HnCounterPage() {
  const { t } = useTranslation('clients')
  const { toast } = useToast()
  const [state, setState] = useState<Counter | null>(null)
  const [count, setCount] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const { data } = await api.get<Counter>('/api/hn-counter')
      setState(data)
      setCount(String(data.count))
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const numeric = Number(count)
  const valid = !!state && /^\d+$/.test(count) && Number.isInteger(numeric) && numeric >= state.minimum && numeric <= 2147483646
  const next = valid && state ? `${String(state.year).slice(-2)}${String(numeric + 1).padStart(4, '0')}` : '—'
  const save = async () => {
    if (!state || !valid || saving) return
    setSaving(true)
    try {
      const { data } = await api.put<Counter>('/api/hn-counter', {
        year: state.year, count: numeric, expectedCount: state.count, expectedVersion: state.version, reason: reason.trim(),
      })
      setState(data)
      setCount(String(data.count))
      setReason('')
      toast({ title: t('counter.saved') })
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
      await load()
    } finally { setSaving(false); setConfirm(false) }
  }
  return <div className="max-w-2xl space-y-5">
    <h1 className="text-2xl font-semibold">{t('counter.title')}</h1>
    <p className="text-sm text-gray-600">{t('counter.intro')}</p>
    {loading ? <p role="status">{t('common:loading')}</p> : error ? <ErrorCard onRetry={load} /> : state && <>
      <dl className="space-y-3 rounded-lg border bg-white p-5">
        <div><dt className="text-sm text-gray-500">{t('counter.year')}</dt><dd>{state.year}</dd></div>
        <div><dt className="text-sm text-gray-500">{t('counter.current')}</dt><dd className="font-mono">{state.count}</dd></div>
        <div><dt className="text-sm text-gray-500">{t('counter.highest')}</dt><dd className="font-mono">{state.highestHn ?? t('counter.empty')}</dd></div>
      </dl>
      <div className="space-y-4 rounded-lg border bg-white p-5">
        <div className="space-y-2">
          <Label htmlFor="hn-count">{t('counter.count')}</Label>
          <Input id="hn-count" type="number" min={state.minimum} max={2147483646} step={1} value={count} onChange={e => setCount(e.target.value)} disabled={saving} />
          <p className="text-sm text-gray-500">{t('counter.minimum', { minimum: state.minimum })}</p>
          <Button variant="outline" disabled={saving} onClick={() => setCount(String(state.minimum))}>{t('counter.reset')}</Button>
        </div>
        <p>{t('counter.next')}: <strong className="font-mono">{next}</strong></p>
        <div className="space-y-2">
          <Label htmlFor="hn-reason">{t('counter.reason')}</Label>
          <Input id="hn-reason" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} disabled={saving} />
        </div>
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{t('counter.warning')}</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!valid || !reason.trim() || numeric === state.count || saving} onClick={() => setConfirm(true)}>{t('counter.save')}</Button>
          <Button variant="outline" disabled={saving} onClick={load}>{t('counter.reload')}</Button>
        </div>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={t('counter.confirm')}
        description={t('counter.confirmText', { before: state.count, after: numeric, next })}
        isLoading={saving} onConfirm={save} />
    </>}
  </div>
}
