import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { formatThaiDate } from '@/lib/format'
import { getApiErrorMessage } from '@/lib/apiError'
import { useToast } from '@/hooks/useToast'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table'

interface Patient {
  id: string; hn: string; nameTitle: string; firstName: string; lastName: string; phoneNumber: string
  orthoDent: { name: string }; lastContactDate: string | null; lastTreatmentDate: string | null
}
interface Call { id: string; callDate: string; createdAt: string; callerName: string }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export function OrthoFollowUp() {
  const { t } = useTranslation('followUp')
  const { toast } = useToast()
  const userId = useAuthStore(s => s.user?.id)
  const [min, setMin] = useState('180')
  const [max, setMax] = useState('360')
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<Patient | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [callLoading, setCallLoading] = useState(false)
  const [callError, setCallError] = useState(false)
  const [callers, setCallers] = useState<{ id: string; username: string }[]>([])
  const [callerId, setCallerId] = useState(userId ?? '')
  const [callDate, setCallDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const generation = useRef(0)
  const valid = /^\d+$/.test(min) && /^\d+$/.test(max) && Number.isSafeInteger(+min) && Number.isSafeInteger(+max) && +min <= +max
  const load = useCallback(async () => {
    const id = ++generation.current
    if (!valid) { setLoading(false); return }
    setLoading(true); setError(false)
    try {
      const res = await api.get('/api/clients/ortho-follow-up', { params: { minDays: min, maxDays: max } })
      if (id === generation.current) setPatients(res.data.data)
    } catch { if (id === generation.current) setError(true) }
    finally { if (id === generation.current) setLoading(false) }
  }, [min, max, valid])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!selected) return
    let active = true
    setCallLoading(true); setCallError(false); setCalls([]); setCallers([])
    Promise.all([api.get(`/api/clients/${selected.id}/follow-up-calls`), api.get('/api/clients/clinical-options')])
      .then(([history, options]) => { if (active) { setCalls(history.data.data); setCallers(options.data.callers) } })
      .catch(() => { if (active) setCallError(true) })
      .finally(() => { if (active) setCallLoading(false) })
    return () => { active = false }
  }, [selected])
  const save = async () => {
    if (!selected || saving) return
    setSaving(true)
    try {
      await api.post(`/api/clients/${selected.id}/follow-up-calls`, { callDate, callerId })
      setSelected(null)
      await load()
    } catch (err) { toast({ variant: 'destructive', title: getApiErrorMessage(err) }) }
    finally { setSaving(false) }
  }
  return <div className="space-y-4">
    <div className="flex gap-4">
      <label>{t('minDays')}<Input type="number" min="0" step="1" value={min} onChange={e => setMin(e.target.value)} /></label>
      <label>{t('maxDays')}<Input type="number" min="0" step="1" value={max} onChange={e => setMax(e.target.value)} /></label>
    </div>
    {!valid ? <p role="alert" className="text-destructive">{t('invalidRange')}</p> : loading ? <p>{t('loading')}</p> : error ? <Button onClick={load}>{t('retry')}</Button> :
      <Table><TableHeader><TableRow>{['patient', 'phone', 'dentist', 'lastContact', 'lastTreatment', 'history'].map(k => <TableHead key={k}>{t(k)}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{patients.length === 0 ? <TableRow><TableCell colSpan={6}>{t('empty')}</TableCell></TableRow> : patients.map(p => <TableRow key={p.id}>
          <TableCell>{p.nameTitle}{p.firstName} {p.lastName}<div className="text-xs text-gray-500">{p.hn}</div></TableCell>
          <TableCell>{p.phoneNumber}</TableCell><TableCell>{p.orthoDent.name}</TableCell>
          <TableCell>{p.lastContactDate ? formatThaiDate(p.lastContactDate.slice(0, 10)) : '—'}</TableCell>
          <TableCell>{p.lastTreatmentDate ? formatThaiDate(p.lastTreatmentDate.slice(0, 10)) : '—'}</TableCell>
          <TableCell><Button variant="outline" onClick={() => { setSelected(p); setCallDate(today()); setCallerId(userId ?? '') }}>{t('history')}</Button></TableCell>
        </TableRow>)}</TableBody>
      </Table>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !saving) setSelected(null) }}>
      <DialogContent><DialogHeader><DialogTitle>{t('history')} — {selected?.firstName} {selected?.lastName}</DialogTitle></DialogHeader>
        {callLoading ? <p>{t('loading')}</p> : callError ? <p role="alert">{t('loadError')}</p> : <>
          <div className="max-h-64 overflow-auto"><Table><TableHeader><TableRow><TableHead>{t('callDate')}</TableHead><TableHead>{t('caller')}</TableHead></TableRow></TableHeader>
            <TableBody>{calls.length ? calls.map(c => <TableRow key={c.id}><TableCell>{formatThaiDate(c.callDate.slice(0, 10))}</TableCell><TableCell>{c.callerName}</TableCell></TableRow>) : <TableRow><TableCell colSpan={2}>{t('noCalls')}</TableCell></TableRow>}</TableBody>
          </Table></div>
          <label>{t('callDate')}<Input type="date" max={today()} value={callDate} disabled={saving} onChange={e => setCallDate(e.target.value)} /></label>
          <label>{t('caller')}<Select value={callerId} onValueChange={setCallerId} disabled={saving}><SelectTrigger><SelectValue placeholder={t('caller')} /></SelectTrigger><SelectContent>{callers.map(c => <SelectItem key={c.id} value={c.id}>{c.username}</SelectItem>)}</SelectContent></Select></label>
          <Button disabled={saving || !callDate || callDate > today() || !callers.some(c => c.id === callerId)} onClick={save}>{t('saveCall')}</Button>
        </>}
      </DialogContent>
    </Dialog>
  </div>
}
