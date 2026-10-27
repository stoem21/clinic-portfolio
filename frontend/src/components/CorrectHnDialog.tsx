import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/apiError'
import type { Client } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export function CorrectHnDialog({ client, onClose, onSaved }: {
  client: Client; onClose: () => void; onSaved: (client: Client) => void
}) {
  const { t } = useTranslation('clients')
  const [hn, setHn] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const valid = /^\d{6,12}$/.test(hn) && hn.slice(0, 2) === client.hn.slice(0, 2)
    && Number(hn.slice(2)) > 0 && Number(hn.slice(2)) < Number(client.hn.slice(2)) && !!reason.trim()
  const save = async () => {
    if (!valid || saving) return
    setSaving(true); setError('')
    try {
      const { data } = await api.patch<Client>(`/api/clients/${client.id}/hn`, { hn, expectedHn: client.hn, reason: reason.trim() })
      onSaved(data); onClose()
    } catch (err) { setError(getApiErrorMessage(err)) }
    finally { setSaving(false) }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{t('hnCorrection.title')}</DialogTitle></DialogHeader>
      <p className="text-sm">{t('hnCorrection.current')}: <strong>{client.hn}</strong></p>
      <Label htmlFor="correct-hn">{t('hnCorrection.new')}</Label>
      <Input id="correct-hn" inputMode="numeric" value={hn} maxLength={12} disabled={saving} onChange={e => setHn(e.target.value)} />
      <p className="text-sm text-gray-600">{t('hnCorrection.help')}</p>
      <Label htmlFor="correct-hn-reason">{t('hnCorrection.reason')}</Label>
      <Input id="correct-hn-reason" value={reason} maxLength={500} disabled={saving} onChange={e => setReason(e.target.value)} />
      <p className="text-sm text-amber-800">{t('hnCorrection.warning')}</p>
      {valid && <p className="font-mono">{client.hn} → {hn}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button variant="outline" disabled={saving} onClick={onClose}>{t('common:cancel')}</Button>
        <Button disabled={!valid || saving} onClick={save}>{t('hnCorrection.save')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
