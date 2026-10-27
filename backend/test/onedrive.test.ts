import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('fs', () => ({ default: {
  readFileSync: vi.fn(() => JSON.stringify({ refreshToken: 'test-refresh' })),
  writeFileSync: vi.fn(),
} }));
let folderExists: boolean;
let denyFolder: boolean;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('ONEDRIVE_CLIENT_ID', 'test-client');
  folderExists = false; denyFolder = false;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/token')) return Response.json({ access_token: 'access', expires_in: 3600 });
    if (url.includes('/createUploadSession')) return folderExists
      ? Response.json({ uploadUrl: 'https://upload.example.test/backup' })
      : Response.json({ error: { code: 'itemNotFound' } }, { status: 404 });
    if (url === 'https://upload.example.test/backup') return Response.json({ id: 'backup-id' }, { status: 201 });
    if (url.endsWith('/root/children') && init?.method === 'POST') {
      if (denyFolder) return new Response('Access denied', { status: 403 });
      folderExists = true;
      return Response.json({ id: 'folder-id', folder: {} }, { status: 201 });
    }
    if (url.includes('/root:/Clinic%20Backups')) return folderExists
      ? Response.json({ id: 'folder-id', folder: {} })
      : new Response('', { status: 404 });
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('creates the backup folder before the first upload', async () => {
  const { provider } = await import('../src/lib/onedrive');
  await expect(provider.upload('clinic_2026-10-03.sql.gz', Buffer.from('backup'))).resolves.toEqual({ fileId: 'backup-id', url: undefined });
  expect(folderExists).toBe(true);
  const create = fetchMock.mock.calls.find(([url]) => url.endsWith('/root/children'));
  expect(JSON.parse(create![1].body as string)).toMatchObject({ name: 'Clinic Backups', folder: {}, '@microsoft.graph.conflictBehavior': 'fail' });
});
it('reuses an existing folder', async () => {
  folderExists = true;
  const { provider } = await import('../src/lib/onedrive');
  await provider.upload('clinic_2026-10-03.sql.gz', Buffer.from('backup'));
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/root/children'))).toBe(false);
});
it('stops when folder creation is denied', async () => {
  denyFolder = true;
  const { provider } = await import('../src/lib/onedrive');
  await expect(provider.upload('clinic_2026-10-03.sql.gz', Buffer.from('backup'))).rejects.toThrow('403');
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/createUploadSession'))).toBe(false);
});
