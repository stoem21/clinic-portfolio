import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { driveAuth, driveFolderId, readDriveLink, saveDriveLink, TOKEN_FILE } from '../src/lib/gdriveAuth';
import { provider } from '../src/lib/gdrive';

vi.mock('fs', () => ({ default: { readFileSync: vi.fn(), writeFileSync: vi.fn(), chmodSync: vi.fn(), renameSync: vi.fn() } }));

beforeEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret');
  vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', 'unused');
  vi.stubEnv('GOOGLE_DRIVE_FOLDER_ID', 'legacy-folder');
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ refreshToken: 'refresh', folderId: 'oauth-folder' }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('Google Drive authorization', () => {
  it('uses the linked personal account and its folder instead of legacy credentials', () => {
    expect(provider.isConfigured()).toBe(true);
    expect(driveFolderId()).toBe('oauth-folder');
    expect(driveAuth().credentials.refresh_token).toBe('refresh');
    expect(provider.getFolderUrl()).toBe('https://drive.google.com/drive/folders/oauth-folder');
  });
  it('fails closed when the personal account link is malformed', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{broken');
    expect(readDriveLink()).toBeNull();
    expect(provider.isConfigured()).toBe(false);
    expect(driveFolderId()).toBe('');
    expect(() => driveAuth()).toThrow('not linked');
  });
  it('requires both a refresh token and a folder', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ refreshToken: 'refresh' }));
    expect(provider.isConfigured()).toBe(false);
  });
  it('requires the client secret', () => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    expect(provider.isConfigured()).toBe(false);
    expect(() => driveAuth()).toThrow('GOOGLE_CLIENT_SECRET');
  });
  it('preserves service account configuration when OAuth is not enabled', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    expect(provider.isConfigured()).toBe(true);
    expect(driveFolderId()).toBe('legacy-folder');
  });
  it('replaces the token file atomically with owner-only permissions', () => {
    const link = { refreshToken: 'refresh', folderId: 'folder' };
    saveDriveLink(link);
    expect(fs.writeFileSync).toHaveBeenCalledWith(`${TOKEN_FILE}.tmp`, JSON.stringify(link), { mode: 0o600 });
    expect(fs.chmodSync).toHaveBeenCalledWith(`${TOKEN_FILE}.tmp`, 0o600);
    expect(fs.renameSync).toHaveBeenCalledWith(`${TOKEN_FILE}.tmp`, TOKEN_FILE);
  });
});
