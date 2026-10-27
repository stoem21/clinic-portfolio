import { google } from 'googleapis';
import { Readable } from 'stream';
import { driveAuth, driveFolderId, readDriveLink } from './gdriveAuth';
import type { BackupFile, BackupProvider } from './backupProvider';

const NAME_RE = /^clinic_(\d{4}-\d{2}-\d{2})\.sql\.gz(?:\.enc)?$/;

function drive() {
  return google.drive({ version: 'v3', auth: driveAuth() });
}

function isConfigured(): boolean {
  return process.env.GOOGLE_CLIENT_ID
    ? Boolean(process.env.GOOGLE_CLIENT_SECRET && readDriveLink())
    : Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && driveFolderId());
}

function getFolderUrl(): string {
  return driveFolderId()
    ? `https://drive.google.com/drive/folders/${driveFolderId()}`
    : '';
}

function folderId(): string {
  const id = driveFolderId();
  if (!id)
    throw new Error(
      'Google Drive folder is not configured — run npm run gdrive:login for a personal account',
    );
  return id;
}

async function upload(
  name: string,
  body: Buffer,
): Promise<{ fileId: string; url?: string }> {
  const res = await drive().files.create({
    requestBody: { name, parents: [folderId()] },
    media: { mimeType: 'application/gzip', body: Readable.from(body) },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error('Drive upload returned no file ID');
  return { fileId: res.data.id, url: res.data.webViewLink ?? undefined };
}

async function list(): Promise<BackupFile[]> {
  const res = await drive().files.list({
    q: `'${folderId()}' in parents and trashed = false`,
    fields: 'files(id,name,size,webViewLink)',
    orderBy: 'name desc',
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const mapped: (BackupFile | null)[] = (res.data.files ?? []).map((f) => {
    const m = NAME_RE.exec(f.name ?? '');
    if (!m || !f.id) return null;
    return {
      fileId: f.id,
      name: f.name!,
      date: m[1],
      sizeBytes: f.size ? Number(f.size) : 0,
      url: f.webViewLink ?? undefined,
    };
  });
  return mapped.filter((f): f is BackupFile => f !== null);
}

async function download(fileId: string): Promise<Readable> {
  const res = await drive().files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );
  return res.data as unknown as Readable;
}

async function deleteFile(fileId: string): Promise<void> {
  await drive().files.delete({ fileId, supportsAllDrives: true });
}

export const provider: BackupProvider = {
  id: 'gdrive',
  label: 'Google Drive',
  isConfigured,
  getFolderUrl,
  upload,
  list,
  download,
  deleteFile,
};
