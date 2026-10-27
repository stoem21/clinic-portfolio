import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function LabCompanySelect({ value, onChange, disabled }: { value?: string | null; onChange: (value: string) => void; disabled?: boolean }) {
  const { t } = useTranslation('labWork')
  const [options, setOptions] = useState<{ id: string; name: string }[]>([])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    api.get('/api/clients/clinical-options').then(r => setOptions(r.data.labCompanies)).catch(() => setFailed(true))
  }, [])
  return <div>
    <Select value={value ?? ''} onValueChange={onChange} disabled={disabled || !options.length}>
      <SelectTrigger aria-label={t('company')} className="min-w-40"><SelectValue placeholder={t('company')} /></SelectTrigger>
      <SelectContent>{options.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
    </Select>
    {failed && <p role="alert" className="text-sm text-destructive">{t('companyLoadError')}</p>}
  </div>
}
