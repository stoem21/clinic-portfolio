import express from 'express';
import request from 'supertest';
import { Readable } from 'stream';
import { beforeEach, expect, it, vi } from 'vitest';
const { db, provider } = vi.hoisted(() => ({
  db: { auditLog: { create: vi.fn() } },
  provider: { list: vi.fn(), download: vi.fn() },
}));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/backupProvider', () => ({ getProvider: () => provider }));
import backups from '../src/routes/backups';
import { signAccessToken } from '../src/lib/jwt';
const app = express();
app.use('/api/backups', backups);
const token = signAccessToken({ id: 'owner', username: 'owner', role: 'SUPER_ADMIN' });
beforeEach(() => {
  vi.clearAllMocks();
  db.auditLog.create.mockResolvedValue({});
  provider.list.mockResolvedValue([{ fileId: 'file1', name: 'clinic.sql.gz' }]);
  provider.download.mockImplementation(async () => Readable.from([Buffer.from('PRIVATE_BACKUP')]));
});
it('persists the actor and file ID before releasing a backup', async () => {
  const res = await request(app).get('/api/backups/file1/download').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
    actorId: 'owner', entity: 'backup', entityId: 'file1', action: 'download-requested',
    context: { result: 'requested', source: 'stored-backup' },
  });
  expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain('PRIVATE_BACKUP');
});
it('does not release the backup or attachment headers when audit persistence fails', async () => {
  db.auditLog.create.mockRejectedValue(new Error('Database unavailable'));
  const res = await request(app).get('/api/backups/file1/download').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(503);
  expect(res.headers['content-disposition']).toBeUndefined();
  expect(res.text).not.toContain('PRIVATE_BACKUP');
});
it('rejects staff before retrieving the backup', async () => {
  const staff = signAccessToken({ id: 'staff', username: 'staff', role: 'USER' });
  expect((await request(app).get('/api/backups/file1/download').set('Authorization', `Bearer ${staff}`)).status).toBe(403);
  expect(provider.download).not.toHaveBeenCalled();
});
