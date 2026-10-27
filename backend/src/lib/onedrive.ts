import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import type { BackupFile, BackupProvider } from './backupProvider';

const NAME_RE = /^clinic_(\d{4}-\d{2}-\d{2})\.sql\.gz(?:\.enc)?$/;
const GRAPH = 'https://graph.microsoft.com/v1.0';
// Personal Microsoft accounts use the /consumers authority.
const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPE = 'Files.ReadWrite offline_access';
// Backups land in this top-level OneDrive folder (auto-created on first upload).
const FOLDER = 'Clinic Backups';
// Refresh token written by scripts/onedriveLogin.ts; updated here on rotation.
// __dirname is backend/{src,dist}/lib, so go up two levels to backend/.
const TOKEN_FILE = path.resolve(__dirname, '../../onedrive-token.json');

function clientId(): string {
  const id = process.env.ONEDRIVE_CLIENT_ID;
  if (!id)
    throw new Error('ONEDRIVE_CLIENT_ID is not set — add it to backend/.env');
  return id;
}

function readRefreshToken(): string | null {
  try {
    const json = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    return typeof json.refreshToken === 'string' && json.refreshToken
      ? json.refreshToken
      : null;
  } catch {
    return null;
  }
}

function writeRefreshToken(token: string): void {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ refreshToken: token }, null, 2));
}

let cached: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

  const refreshToken = readRefreshToken();
  if (!refreshToken)
    throw new Error('OneDrive is not linked — run `npm run onedrive:login`');

  const res = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPE,
    }),
  });
  if (!res.ok) {
    throw new Error(`OneDrive token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  // Microsoft rotates refresh tokens — persist the new one so we stay linked.
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    writeRefreshToken(data.refresh_token);
  }
  cached = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function graph(urlPath: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const url = urlPath.startsWith('http') ? urlPath : `${GRAPH}${urlPath}`;
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
}

function isConfigured(): boolean {
  return Boolean(process.env.ONEDRIVE_CLIENT_ID && readRefreshToken());
}

function getFolderUrl(): string {
  return 'https://onedrive.live.com/';
}

async function ensureBackupFolder(): Promise<void> {
  const folderPath = `/me/drive/root:/${encodeURIComponent(FOLDER)}?$select=id,folder`;
  const existing = await graph(folderPath);
  if (existing.ok) {
    const item = await existing.json() as { folder?: unknown };
    if (!item.folder) throw new Error('OneDrive Clinic Backups exists but is not a folder');
    return;
  }
  if (existing.status !== 404) throw new Error(`OneDrive folder lookup failed: ${existing.status}`);
  const created = await graph('/me/drive/root/children', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  });
  if (created.ok) return;
  // Another backup process may have created it after our lookup.
  if (created.status === 409) {
    const retry = await graph(folderPath);
    if (retry.ok && (await retry.json() as { folder?: unknown }).folder) return;
  }
  throw new Error(`OneDrive folder creation failed: ${created.status}`);
}

async function upload(
  name: string,
  body: Buffer,
): Promise<{ fileId: string; url?: string }> {
  await ensureBackupFolder();
  // Resumable upload session handles any size; the dump is small enough to send
  // in a single fragment. conflictBehavior=replace covers same-day re-runs.
  const sessRes = await graph(
    `/me/drive/root:/${encodeURIComponent(FOLDER)}/${encodeURIComponent(name)}:/createUploadSession`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item: { '@microsoft.graph.conflictBehavior': 'replace' },
      }),
    },
  );
  if (!sessRes.ok)
    throw new Error(`OneDrive createUploadSession failed: ${sessRes.status} ${await sessRes.text()}`);
  const { uploadUrl } = (await sessRes.json()) as { uploadUrl: string };

  const total = body.length;
  // The upload URL is pre-authenticated — do NOT send the Authorization header.
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(total),
      'Content-Range': `bytes 0-${total - 1}/${total}`,
    },
    body,
  });
  if (putRes.status !== 200 && putRes.status !== 201)
    throw new Error(`OneDrive upload failed: ${putRes.status} ${await putRes.text()}`);
  const item = (await putRes.json()) as { id: string; webUrl?: string };
  return { fileId: item.id, url: item.webUrl };
}

async function list(): Promise<BackupFile[]> {
  const res = await graph(
    `/me/drive/root:/${encodeURIComponent(FOLDER)}:/children?$select=id,name,size,webUrl&$top=100`,
  );
  if (res.status === 404) return []; // folder not created yet
  if (!res.ok) throw new Error(`OneDrive list failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    value: { id: string; name: string; size?: number; webUrl?: string }[];
  };
  return data.value
    .map((f): BackupFile | null => {
      const m = NAME_RE.exec(f.name);
      if (!m) return null;
      return {
        fileId: f.id,
        name: f.name,
        date: m[1],
        sizeBytes: f.size ?? 0,
        url: f.webUrl,
      };
    })
    .filter((f): f is BackupFile => f !== null)
    .sort((a, b) => b.name.localeCompare(a.name));
}

async function download(fileId: string): Promise<Readable> {
  // Graph 302-redirects /content to a pre-signed URL; fetch follows it.
  const res = await graph(`/me/drive/items/${fileId}/content`);
  if (!res.ok || !res.body)
    throw new Error(`OneDrive download failed: ${res.status}`);
  return Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
}

async function deleteFile(fileId: string): Promise<void> {
  const res = await graph(`/me/drive/items/${fileId}`, { method: 'DELETE' });
  if (res.status !== 204 && !res.ok)
    throw new Error(`OneDrive delete failed: ${res.status} ${await res.text()}`);
}

export const provider: BackupProvider = {
  id: 'onedrive',
  label: 'OneDrive',
  isConfigured,
  getFolderUrl,
  upload,
  list,
  download,
  deleteFile,
};
