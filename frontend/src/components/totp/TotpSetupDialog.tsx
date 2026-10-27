import { useState } from 'react'
import { Copy, Download, Loader2, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { getApiErrorMessage } from '@/lib/apiError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface SetupData {
  qrDataUrl: string
  backupCodes: string[]
  secret: string
}

type Step = 'loading' | 'qr' | 'verify' | 'done'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

// Format raw 8-char code as XXXX-XXXX for display.
function formatCode(c: string): string {
  return `${c.slice(0, 4)}-${c.slice(4)}`
}

export function TotpSetupDialog({ open, onOpenChange, onSuccess }: Props) {
  const { t } = useTranslation('account')
  const { toast } = useToast()
  const [step, setStep] = useState<Step>('loading')
  const [setupData, setSetupData] = useState<SetupData | null>(null)
  const [savedConfirmed, setSavedConfirmed] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  const startSetup = async () => {
    setStep('loading')
    setSavedConfirmed(false)
    setVerifyCode('')
    try {
      const { data } = await api.post<SetupData>('/api/auth/totp/setup')
      setSetupData(data)
      setStep('qr')
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
      onOpenChange(false)
    }
  }

  const handleOpen = (o: boolean) => {
    if (o) startSetup()
    else {
      setStep('loading')
      setSetupData(null)
    }
    onOpenChange(o)
  }

  const copyBackupCodes = () => {
    if (!setupData) return
    navigator.clipboard.writeText(setupData.backupCodes.map(formatCode).join('\n'))
    toast({ title: t('totp.backupCodesCopied') })
  }

  const downloadBackupCodes = () => {
    if (!setupData) return
    const text = [
      `${t('totp.backupCodesFileTitle')} — ${t('nav:appName')}`,
      '================================',
      t('totp.backupCodesFileWarning'),
      '',
      ...setupData.backupCodes.map((c, i) => `${i + 1}. ${formatCode(c)}`),
    ].join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'backup-codes-2fa.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleVerify = async () => {
    if (!verifyCode) return
    setVerifying(true)
    try {
      await api.post('/api/auth/totp/confirm', { code: verifyCode })
      setStep('done')
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setVerifying(false)
    }
  }

  const handleDone = () => {
    onSuccess()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('totp.dialogTitle')}</DialogTitle>
        </DialogHeader>

        {step === 'loading' && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {step === 'qr' && setupData && (
          <div className="space-y-5">
            <div>
              <p className="mb-1 text-sm text-gray-600">
                {t('totp.scanInstruction')}
              </p>
              <div className="flex justify-center rounded-md border border-gray-200 bg-white p-3">
                <img src={setupData.qrDataUrl} alt={t('totp.qrAlt')} className="h-48 w-48" />
              </div>
              <p className="mt-1 text-center text-xs text-gray-400">
                {t('totp.manualEntry')}{' '}
                <span className="font-mono font-medium tracking-wide">{setupData.secret}</span>
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">
                {t('totp.saveBackupCodesInstruction')}
              </p>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {setupData.backupCodes.map((c, i) => (
                    <span key={i} className="font-mono text-sm text-amber-900">
                      {i + 1}. {formatCode(c)}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyBackupCodes} className="flex-1">
                    <Copy className="h-3 w-3" /> {t('totp.copy')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadBackupCodes} className="flex-1">
                    <Download className="h-3 w-3" /> {t('totp.download')}
                  </Button>
                </div>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={savedConfirmed}
                onChange={(e) => setSavedConfirmed(e.target.checked)}
              />
              <span className="text-sm text-gray-700">
                {t('totp.savedConfirmLabel')}
              </span>
            </label>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common:cancel')}</Button>
              <Button onClick={() => setStep('verify')} disabled={!savedConfirmed}>
                {t('common:next')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {t('totp.verifyInstruction')}
            </p>
            <div className="space-y-2">
              <Label>{t('totp.verificationCode')}</Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                className="text-center font-mono text-lg tracking-widest"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('qr')}>{t('common:back')}</Button>
              <Button onClick={handleVerify} disabled={verifyCode.length < 6 || verifying}>
                {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common:confirm')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="rounded-full bg-green-100 p-3">
                <Shield className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-center text-sm text-gray-700">
                {t('totp.enabledSuccess')}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleDone} className="w-full">{t('totp.done')}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
