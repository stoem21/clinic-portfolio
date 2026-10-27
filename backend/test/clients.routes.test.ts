import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    client: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    dentist: { findUnique: vi.fn() },
    treatmentRecord: { count: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

import { app } from '../src/index';
import { signAccessToken } from '../src/lib/jwt';

const adminToken = signAccessToken({
  id: 'admin-1',
  username: 'admin',
  role: 'ADMIN',
});
const auth = { Authorization: `Bearer ${adminToken}` };

const superAdminToken = signAccessToken({
  id: 'super-1',
  username: 'superadmin',
  role: 'SUPER_ADMIN',
});
const superAuth = { Authorization: `Bearer ${superAdminToken}` };

const sampleClient = {
  id: 'c1',
  hn: '690001',
  nameTitle: 'นาย',
  firstName: 'สมชาย',
  lastName: 'ใจดี',
  deletedAt: null,
};

describe('clients soft-delete + restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.auditLog.create.mockResolvedValue({});
  });

  it('requires authentication', async () => {
    const res = await request(app).delete('/api/clients/c1');
    expect(res.status).toBe(401);
  });

  it('soft-deletes (sets deletedAt, no hard delete) and writes an audit row', async () => {
    prismaMock.client.findFirst.mockResolvedValue(sampleClient);
    prismaMock.treatmentRecord.count.mockResolvedValue(0);
    prismaMock.client.update.mockResolvedValue({ ...sampleClient, deletedAt: new Date() });

    const res = await request(app).delete('/api/clients/c1').set(auth);

    expect(res.status).toBe(204);
    expect(prismaMock.client.update).toHaveBeenCalledTimes(1);
    const arg = prismaMock.client.update.mock.calls[0][0];
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create.mock.calls[0][0].data.action).toBe('delete');
  });

  it('blocks delete when the client still has treatment records', async () => {
    prismaMock.client.findFirst.mockResolvedValue(sampleClient);
    prismaMock.treatmentRecord.count.mockResolvedValue(2);

    const res = await request(app).delete('/api/clients/c1').set(auth);

    expect(res.status).toBe(409);
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it('restores a soft-deleted client (SUPER_ADMIN only)', async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      ...sampleClient,
      deletedAt: new Date(),
    });
    prismaMock.client.update.mockResolvedValue({ ...sampleClient, deletedAt: null });

    const res = await request(app).patch('/api/clients/c1/restore').set(superAuth);

    expect(res.status).toBe(200);
    const arg = prismaMock.client.update.mock.calls[0][0];
    expect(arg.data.deletedAt).toBeNull();
    expect(prismaMock.auditLog.create.mock.calls[0][0].data.action).toBe('restore');
  });

  it('404s when restoring a client that is not archived', async () => {
    prismaMock.client.findUnique.mockResolvedValue(sampleClient); // deletedAt null
    const res = await request(app).patch('/api/clients/c1/restore').set(superAuth);
    expect(res.status).toBe(404);
  });

  it('blocks ADMIN from restoring (SUPER_ADMIN only)', async () => {
    const res = await request(app).patch('/api/clients/c1/restore').set(auth);
    expect(res.status).toBe(403);
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it('blocks ADMIN from viewing the trash (deleted=true)', async () => {
    const res = await request(app).get('/api/clients').query({ deleted: 'true' }).set(auth);
    expect(res.status).toBe(403);
  });
});

describe('clients — audit diff shows id(name) for orthoDentId changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.auditLog.create.mockResolvedValue({});
  });

  const validBody = {
    nameTitle: 'นาย',
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    phoneNumber: '0800000000',
    gender: 'ชาย',
    birthday: '1990-01-01',
  };

  it('PUT: an orthoDentId change is stored as "id(name)" on both sides', async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      ...sampleClient,
      orthoDentId: 'd-old',
      orthoDent: { name: 'ทพ. เก่า' },
    });
    prismaMock.dentist.findUnique.mockResolvedValue({ id: 'd-new' });
    prismaMock.client.update.mockResolvedValue({
      ...sampleClient,
      orthoDentId: 'd-new',
      orthoDent: { id: 'd-new', name: 'ทพญ. ใหม่' },
    });

    const res = await request(app)
      .put('/api/clients/c1')
      .set(auth)
      .send({ ...validBody, orthoDentId: 'd-new' });

    expect(res.status).toBe(200);
    const changes = prismaMock.auditLog.create.mock.calls[0][0].data.changes;
    expect(changes).toContainEqual({
      field: 'orthoDentId',
      before: 'd-old(ทพ. เก่า)',
      after: 'd-new(ทพญ. ใหม่)',
    });
  });
});

describe('clients — POST duplicate national ID', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validBody = {
    nameTitle: 'นาย',
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    phoneNumber: '0800000000',
    gender: 'ชาย',
    birthday: '1990-01-01',
    nationalId: '1234567890123',
  };

  it('409s with a code and the existing HN in params when nationalId is already in use', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ hn: '690099' });

    const res = await request(app).post('/api/clients').set(auth).send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_NATIONAL_ID');
    expect(res.body.params).toEqual({ hn: '690099' });
  });
});
