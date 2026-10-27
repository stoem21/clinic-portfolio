import type { Readable } from 'stream';
import { provider as gdrive } from './gdrive';
import { provider as onedrive } from './onedrive';

// A stored backup file, normalized across cloud providers.
export interface BackupFile {
  fileId: string;
  name: string;
  date: string;
  sizeBytes: number;
  url?: string;
}

// Common interface every backup destination implements.
export interface BackupProvider {
  id: 'gdrive' | 'onedrive';
  label: string;
  isConfigured(): boolean;
  getFolderUrl(): string;
  upload(name: string, body: Buffer): Promise<{ fileId: string; url?: string }>;
  list(): Promise<BackupFile[]>;
  download(fileId: string): Promise<Readable>;
  deleteFile(fileId: string): Promise<void>;
}

/**
 * The active backup destination, chosen by the BACKUP_PROVIDER env var
 * ("onedrive" selects OneDrive; anything else defaults to Google Drive).
 */
export function getProvider(): BackupProvider {
  return process.env.BACKUP_PROVIDER === 'onedrive' ? onedrive : gdrive;
}
