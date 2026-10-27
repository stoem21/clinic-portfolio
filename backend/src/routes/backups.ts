import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { createGzip } from 'zlib';
import { Role } from '@prisma/client';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import { logger } from '../lib/logger';
import { writeAudit } from '../lib/audit';
import { getProvider, type BackupFile } from '../lib/backupProvider';
import { getScheduleInfo, saveCron, applySchedule } from '../lib/backupScheduler';
import { isEncryptionEnabled, encrypt, decrypt, isEncryptedName, ENC_SUFFIX } from '../lib/backupCrypto';

const router = Router();
router.use(authenticate);
router.use(requireRole(Role.SUPER_ADMIN));

const MAX_BACKUPS = 10;
const PG_DUMP =
  process.env.PG_DUMP || '/opt/homebrew/opt/postgresql@16/bin/pg_dump';

// One dump at a time.
let dumping = false;

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Run pg_dump and gzip the output into a single in-memory buffer. Shared by the
 * Drive upload and the direct-download path. The dump is small (a few MB), so
 * buffering keeps success/failure unambiguous before any bytes are sent.
 */
function dumpToBuffer(databaseUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(PG_DUMP, [
      '--dbname', databaseUrl,
      '--no-owner',
      '--no-privileges',
    ]);
    const gzip = createGzip();
    const chunks: Buffer[] = [];
    let stderr = '';
    let exitCode: number | null = null;
    let gzipDone = false;

    // Only resolve once the gzip stream has flushed AND pg_dump exited cleanly.
    const finish = () => {
      if (gzipDone && exitCode === 0) resolve(Buffer.concat(chunks));
    };

    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject); // e.g. pg_dump not found
    child.on('close', (code) => {
      exitCode = code ?? 1;
      if (exitCode !== 0) {
        reject(new Error(stderr || `pg_dump exited with code ${exitCode}`));
      } else {
        finish();
      }
    });

    gzip.on('error', reject);
    gzip.on('data', (c: Buffer) => chunks.push(c));
    gzip.on('end', () => { gzipDone = true; finish(); });

    child.stdout.pipe(gzip);
  });
}

/**
 * Core backup logic — called by the POST endpoint and the daily scheduler.
 * Dumps the database and uploads to the active cloud provider; no local file.
 */
export async function runBackup(): Promise<BackupFile> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
  const provider = getProvider();
  if (!provider.isConfigured())
    throw new Error(`${provider.label} is not configured`);
  if (dumping) throw new Error('A backup is already in progress');
  dumping = true;

  const stamp = todayStamp();
  const encrypted = isEncryptionEnabled();
  const name = `clinic_${stamp}.sql.gz${encrypted ? ENC_SUFFIX : ''}`;

  try {
    // Same-day overwrite: remove the existing file first.
    const existing = await provider.list();
    const sameDay = existing.find((f) => f.name === name);
    if (sameDay) await provider.deleteFile(sameDay.fileId);

    let buffer = await dumpToBuffer(databaseUrl);
    if (encrypted) buffer = encrypt(buffer); // encrypt before it leaves the server
    const uploadResult = await provider.upload(name, buffer);

    // Prune to MAX_BACKUPS newest (list again to include the new file).
    const all = await provider.list();
    for (const old of all.slice(MAX_BACKUPS)) {
      await provider
        .deleteFile(old.fileId)
        .catch((e) => logger.warn({ e, name: old.name }, 'Prune delete failed'));
    }

    return {
      fileId: uploadResult.fileId,
      name,
      date: stamp,
      sizeBytes: buffer.length,
      url: uploadResult.url,
    };
  } finally {
    dumping = false;
  }
}

/**
 * GET /api/backups/config — active provider + folder URL + scheduler status.
 */
router.get('/config', (_req: Request, res: Response) => {
  const schedule = getScheduleInfo();
  const provider = getProvider();
  return res.json({
    provider: provider.id,
    providerLabel: provider.label,
    configured: provider.isConfigured(),
    folderUrl: provider.getFolderUrl(),
    encrypted: isEncryptionEnabled(),
    scheduleCron: schedule.cron,
    scheduleHumanReadable: schedule.humanReadable,
  });
});

/**
 * GET /api/backups/schedule — current cron schedule.
 */
router.get('/schedule', (_req: Request, res: Response) => {
  return res.json(getScheduleInfo());
});

/**
 * PUT /api/backups/schedule — update the daily backup time. SUPER_ADMIN only.
 */
router.put(
  '/schedule',
  requireRole(Role.SUPER_ADMIN),
  (req: Request, res: Response) => {
    const expr =
      typeof req.body?.cron === 'string' ? req.body.cron.trim() : '';
    if (!expr) return res.status(400).json({ message: 'Missing cron expression' });
    try {
      saveCron(expr);
      applySchedule();
      return res.json(getScheduleInfo());
    } catch (err) {
      return res
        .status(400)
        .json({ message: err instanceof Error ? err.message : 'Invalid cron' });
    }
  },
);

/**
 * POST /api/backups — trigger an immediate backup to Google Drive.
 */
router.post('/', async (_req: Request, res: Response) => {
  try {
    const result = await runBackup();
    return res.status(201).json(result);
  } catch (err) {
    logger.error({ err }, 'backup failed');
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('in progress') ? 409 : 500;
    return res
      .status(status)
      .json({ code: 'BACKUP_FAILED', message: 'สำรองข้อมูลไม่สำเร็จ', detail: msg });
  }
});

/**
 * POST /api/backups/download — run pg_dump and send the gzipped dump straight to
 * the caller for download. Works without Google Drive configured (the fallback
 * "download only" mode). SUPER_ADMIN only, like the stored-file download.
 */
router.post(
  '/download',
  requireRole(Role.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return res.status(500).json({ message: 'DATABASE_URL is not configured' });
    }
    if (dumping) {
      return res.status(409).json({ message: 'A backup is already in progress' });
    }
    dumping = true;
    try {
      const buffer = await dumpToBuffer(databaseUrl);
      const name = `clinic_${todayStamp()}.sql.gz`;
      await writeAudit(req, { action: 'download-requested', entity: 'backup', entityId: name,
        context: { result: 'requested', sizeBytes: buffer.length, source: 'database' } });
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.setHeader('Content-Length', String(buffer.length));
      return res.end(buffer);
    } catch (err) {
      logger.error({ err }, 'backup download failed');
      return res.status(500).json({
        code: 'BACKUP_DOWNLOAD_FAILED',
        message: 'สำรองข้อมูลไม่สำเร็จ',
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      dumping = false;
    }
  },
);

/**
 * GET /api/backups — list backups stored in the active provider, newest first.
 */
router.get('/', async (_req: Request, res: Response) => {
  const provider = getProvider();
  if (!provider.isConfigured()) return res.json([]);
  try {
    return res.json(await provider.list());
  } catch (err) {
    logger.error({ err }, 'list backups failed');
    return res.status(500).json({ code: 'BACKUP_LIST_FAILED', message: 'ไม่สามารถโหลดรายการสำรองข้อมูลได้' });
  }
});

/**
 * GET /api/backups/:fileId/download — stream a backup from Drive. SUPER_ADMIN only.
 */
router.get(
  '/:fileId/download',
  requireRole(Role.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const fileId = String(req.params.fileId);
    const provider = getProvider();
    // Resolve the filename for Content-Disposition.
    const all = await provider.list().catch(() => [] as BackupFile[]);
    const file = all.find((f) => f.fileId === fileId);
    const filename = file?.name ?? `clinic_backup_${fileId}.sql.gz`;
    try {
      const stream = await provider.download(fileId);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      let data: Buffer = Buffer.concat(chunks);
      let outName = filename;
      // Decrypt server-side so the SUPER_ADMIN gets a usable .sql.gz.
      if (isEncryptedName(filename)) {
        try {
          data = decrypt(data);
          outName = filename.slice(0, -ENC_SUFFIX.length);
        } catch (e) {
          logger.error({ e, fileId }, 'backup decrypt failed');
          return res.status(500).json({
            code: 'BACKUP_DECRYPT_FAILED',
            message: 'ถอดรหัสไฟล์สำรองไม่สำเร็จ — ตรวจสอบ BACKUP_ENCRYPTION_KEY',
          });
        }
      }
      try {
        await writeAudit(req, { action: 'download-requested', entity: 'backup', entityId: fileId,
          context: { result: 'requested', sizeBytes: data.length, source: 'stored-backup' } });
      } catch (err) {
        logger.error({ err }, 'backup download audit failed');
        return res.status(503).json({ message: 'ไม่สามารถบันทึกประวัติการดาวน์โหลดได้ กรุณาลองอีกครั้ง' });
      }
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
      res.setHeader('Content-Length', String(data.length));
      return res.end(data);
    } catch (err) {
      logger.error({ err, fileId }, 'download failed');
      return res.status(404).json({ code: 'BACKUP_FILE_NOT_FOUND', message: 'ไม่พบไฟล์สำรองข้อมูล' });
    }
  },
);

/**
 * DELETE /api/backups/:fileId — delete from Drive. SUPER_ADMIN only.
 */
router.delete(
  '/:fileId',
  requireRole(Role.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const fileId = String(req.params.fileId);
    const provider = getProvider();
    try {
      await provider.deleteFile(fileId);
      return res.status(204).send();
    } catch (err) {
      logger.error({ err, fileId }, 'delete backup failed');
      return res.status(404).json({ code: 'BACKUP_FILE_NOT_FOUND', message: 'ไม่พบไฟล์สำรองข้อมูล' });
    }
  },
);

export default router;
