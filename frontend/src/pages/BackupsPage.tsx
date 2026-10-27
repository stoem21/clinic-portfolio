import { useCallback, useEffect, useState } from 'react'
import { Clock, Cloud, Database, Download, ExternalLink, Loader2, Lock, Trash2, Unlock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { getApiErrorMessage } from '@/lib/apiError'
import type { Backup, BackupConfig } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { formatThaiDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/ConfirmDialog'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function cronToTime(expr: string): string {
  const parts = expr.split(' ')
  if (parts.length < 2) return '02:00'
  return `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`
}

function timeToCron(time: string): string {
  const [h, m] = time.split(':')
  return `${Number(m ?? '0')} ${Number(h ?? '2')} * * *`
}

export default function BackupsPage() {
  const { t } = useTranslation('backups')
  const { toast } = useToast()
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [downloadingNow, setDownloadingNow] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [config, setConfig] = useState<BackupConfig | null>(null)
  const [scheduleTime, setScheduleTime] = useState('02:00')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const providerLabel = config?.providerLabel ?? t('defaultProviderLabel')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<Backup[]>('/api/backups')
      setBackups(res.data)
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setLoading(false)
    }
  }, [toast])

  const loadConfig = useCallback(async () => {
    try {
      const res = await api.get<BackupConfig>('/api/backups/config')
      setConfig(res.data)
      setScheduleTime(cronToTime(res.data.scheduleCron))
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    }
  }, [toast])

  useEffect(() => {
    load()
    loadConfig()
  }, [load, loadConfig])

  const saveSchedule = async () => {
    setSavingSchedule(true)
    try {
      const res = await api.put<{ cron: string; humanReadable: string }>(
        '/api/backups/schedule',
        { cron: timeToCron(scheduleTime) },
      )
      setConfig((prev) =>
        prev
          ? { ...prev, scheduleCron: res.data.cron, scheduleHumanReadable: res.data.humanReadable }
          : prev,
      )
      toast({ title: t('scheduleSaved') })
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setSavingSchedule(false)
    }
  }

  const runBackup = async () => {
    setRunning(true)
    try {
      await api.post('/api/backups')
      toast({ title: t('backupSuccess', { provider: providerLabel }) })
      load()
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setRunning(false)
    }
  }

  // Run a backup and download it straight to the user's device — works even
  // when Google Drive isn't configured.
  const downloadBackupNow = async () => {
    setDownloadingNow(true)
    try {
      const res = await api.post('/api/backups/download', null, {
        responseType: 'blob',
      })
      const cd = (res.headers['content-disposition'] as string | undefined) ?? ''
      const name =
        cd.match(/filename="?([^"]+)"?/)?.[1] ??
        `clinic_${new Date().toISOString().slice(0, 10)}.sql.gz`
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: t('downloadedSuccess') })
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setDownloadingNow(false)
    }
  }

  const download = async (fileId: string, name: string) => {
    setDownloading(fileId)
    try {
      const res = await api.get(`/api/backups/${fileId}/download`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    } finally {
      setDownloading(null)
    }
  }

  const remove = async (fileId: string) => {
    setConfirmDelete(null)
    try {
      await api.delete(`/api/backups/${fileId}`)
      toast({ title: t('deletedSuccess') })
      load()
    } catch (err) {
      toast({ variant: 'destructive', title: getApiErrorMessage(err) })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('subtitle', { provider: providerLabel })}
          </p>
          {config && (
            <span
              className={`mt-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                config.encrypted
                  ? 'bg-green-50 text-green-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {config.encrypted ? (
                <>
                  <Lock className="h-3 w-3" /> {t('encrypted')}
                </>
              ) : (
                <>
                  <Unlock className="h-3 w-3" /> {t('notEncrypted')}
                </>
              )}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isSuperAdmin && (
            <Button
              variant="outline"
              onClick={downloadBackupNow}
              disabled={downloadingNow}
            >
              {downloadingNow ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {t('downloadToDevice')}
            </Button>
          )}
          <Button onClick={runBackup} disabled={running || !config?.configured}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            {t('backupToProvider', { provider: providerLabel })}
          </Button>
        </div>
      </div>

      {/* Not-configured notice */}
      {config && !config.configured && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">{t('notConfiguredTitle', { provider: providerLabel })}</p>
          <p className="mt-1">
            {t('notConfiguredBody', { provider: providerLabel })}
            {isSuperAdmin ? t('notConfiguredSuperAdminSuffix') : ''}
          </p>
          {config.provider === 'onedrive' ? (
            <>
              <p className="mt-2">
                {t('oneDriveSetupIntro')}{' '}
                <code className="rounded bg-amber-100 px-1 font-mono">ONEDRIVE_CLIENT_ID</code>{' '}
                {t('inWord')} <code className="rounded bg-amber-100 px-1 font-mono">backend/.env</code> {t('oneDriveSetupOutro')}
              </p>
              <ul className="mt-1 list-disc pl-5 font-mono text-xs">
                <li>npm run onedrive:login</li>
              </ul>
            </>
          ) : (
            <>
              <p className="mt-2">
                {t('googleSetupIntro')}{' '}
                <code className="rounded bg-amber-100 px-1 font-mono">backend/.env</code>{' '}
                {t('googleSetupOutro')}
              </p>
              <ul className="mt-1 list-disc pl-5 font-mono text-xs">
                <li>GOOGLE_SERVICE_ACCOUNT_JSON</li>
                <li>GOOGLE_DRIVE_FOLDER_ID</li>
              </ul>
            </>
          )}
        </div>
      )}

      {/* Drive + Schedule cards */}
      {config?.configured && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Drive folder link */}
          <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <Cloud className="h-5 w-5 text-blue-500" />
              <h2 className="text-base font-semibold text-gray-900">{providerLabel}</h2>
            </div>
            <a
              href={config.folderUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              {t('openFolder', { provider: providerLabel })}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Schedule */}
          <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <Clock className="h-5 w-5 text-gray-500" />
              <h2 className="text-base font-semibold text-gray-900">
                {t('scheduleTitle')}
              </h2>
            </div>
            {isSuperAdmin ? (
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t('scheduleTimeLabel')}</Label>
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-32"
                  />
                </div>
                <Button size="sm" onClick={saveSchedule} disabled={savingSchedule}>
                  {savingSchedule && <Loader2 className="h-3 w-3 animate-spin" />}
                  {t('save')}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-gray-600">{config.scheduleHumanReadable}</p>
            )}
          </div>
        </div>
      )}

      {/* Backup list */}
      <div className="rounded-md border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-gray-400">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        ) : backups.length === 0 ? (
          <EmptyState message={t('noBackupsYet')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common:date')}</TableHead>
                <TableHead>{t('fileName')}</TableHead>
                <TableHead className="text-right">{t('size')}</TableHead>
                <TableHead className="text-right">{t('common:actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((b) => (
                <TableRow key={b.fileId}>
                  <TableCell className="font-medium text-gray-900">
                    {formatThaiDate(b.date)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-gray-600">
                    {b.name}
                    {b.url && (
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 inline-flex items-center text-blue-400 hover:text-blue-600"
                        title={t('openInProvider', { provider: providerLabel })}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{formatSize(b.sizeBytes)}</TableCell>
                  <TableCell className="text-right">
                    {isSuperAdmin && (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloading === b.fileId}
                          onClick={() => download(b.fileId, b.name)}
                        >
                          {downloading === b.fileId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          {t('download')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmDelete(b.fileId)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={t('deleteBackupTitle')}
        description={t('deleteBackupDescription')}
        confirmLabel={t('common:delete')}
        destructive
        onConfirm={() => confirmDelete && remove(confirmDelete)}
      />
    </div>
  )
}
