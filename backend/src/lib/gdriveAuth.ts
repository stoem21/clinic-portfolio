import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

export const GOOGLE_REDIRECT_URI = 'http://localhost:53682/oauth2callback';
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const TOKEN_FILE = path.resolve(__dirname, '../../gdrive-token.json');

export interface DriveLink { refreshToken: string; folderId: string }

export function readDriveLink(): DriveLink | null {
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    return typeof data.refreshToken === 'string' && data.refreshToken &&
      typeof data.folderId === 'string' && data.folderId ? data : null;
  } catch { return null; }
}

export function saveDriveLink(link: DriveLink): void {
  const temporary = `${TOKEN_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(link), { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, TOKEN_FILE);
}

export function oauthClient() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env');
  return new google.auth.OAuth2(id, secret, GOOGLE_REDIRECT_URI);
}

export function driveFolderId(): string {
  // OAuth takes precedence once configured; never silently use a different account.
  if (process.env.GOOGLE_CLIENT_ID) return readDriveLink()?.folderId ?? '';
  return process.env.GOOGLE_DRIVE_FOLDER_ID ?? '';
}

export function driveAuth() {
  if (process.env.GOOGLE_CLIENT_ID) {
    const client = oauthClient();
    const link = readDriveLink();
    if (!link) throw new Error('Google Drive is not linked — run npm run gdrive:login');
    client.setCredentials({ refresh_token: link.refreshToken });
    return client;
  }
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!key) throw new Error('Google Drive is not configured');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(key), scopes: ['https://www.googleapis.com/auth/drive'],
  });
}
