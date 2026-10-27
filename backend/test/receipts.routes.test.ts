import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    receipt: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    receiptCounter: { upsert: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  },
}));
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

import { app } from '../src/index';
import { signAccessToken } from '../src/lib/jwt';

const superAdminToken = signAccessToken({ id: 'sa-1', username: 'superadmin', role: 'SUPER_ADMIN' });
const auth = { Authorization: `Bearer ${superAdminToken}` };
const adminToken = signAccessToken({ id: 'admin-1', username: 'admin', role: 'ADMIN' });
const adminAuth = { Authorization: `Bearer ${adminToken}` };
const userToken = signAccessToken({ id: 'u1', username: 'user', role: 'USER' });
const userAuth = { Authorization: `Bearer ${userToken}` };

const baseBody = {
  kind: 'individual',
  customerName: 'นายทดสอบ ระบบ',
  issueDate: '2026-06-01',
  lineItems: [
    { label: 'อุดฟัน: ...', amount: 500 },
    { label: 'ขูดหินปูน', amount: 300 },
  ],
  treatmentRecordIds: ['r1'],
};

const bulkBody = {
  kind: 'bulk',
  customerName: 'สำนักงานประกันสังคม',
  customerAddress: '35/3 หมู่ 1 ถ.รังสิต-ปทุมธานี',
  issueDate: '2026-06-01',
  lineItems: [{ label: 'ค่าบริการทางทันตกรรม', amount: 800 }],
  treatmentRecordIds: ['r1'],
};

describe('receipts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(prismaMock));
    prismaMock.auditLog.create.mockResolvedValue({});
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/receipts').send(baseBody);
    expect(res.status).toBe(401);
  });

  it('allows USER to create an individual receipt', async () => {
    prismaMock.receiptCounter.upsert.mockResolvedValue({ year: 2569, count: 1 });
    prismaMock.receipt.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'rcp-1', ...data }),
    );
    const res = await request(app).post('/api/receipts').set(userAuth).send(baseBody);
    expect(res.status).toBe(201);
  });

  it('allows ADMIN to create an individual receipt', async () => {
    prismaMock.receiptCounter.upsert.mockResolvedValue({ year: 2569, count: 1 });
    prismaMock.receipt.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'rcp-1', ...data }),
    );
    const res = await request(app).post('/api/receipts').set(adminAuth).send(baseBody);
    expect(res.status).toBe(201);
  });

  it('blocks USER from creating a bulk receipt', async () => {
    const res = await request(app).post('/api/receipts').set(userAuth).send(bulkBody);
    expect(res.status).toBe(403);
    expect(prismaMock.receipt.create).not.toHaveBeenCalled();
  });

  it('allows ADMIN to create a bulk receipt', async () => {
    prismaMock.receiptCounter.upsert.mockResolvedValue({ year: 2569, count: 1 });
    prismaMock.receipt.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'rcp-1', ...data }),
    );
    const res = await request(app).post('/api/receipts').set(adminAuth).send(bulkBody);
    expect(res.status).toBe(201);
  });

  it('rejects a bulk receipt with no customerAddress', async () => {
    const res = await request(app)
      .post('/api/receipts')
      .set(adminAuth)
      .send({ ...bulkBody, customerAddress: undefined });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BULK_RECEIPT_ADDRESS_REQUIRED');
    expect(prismaMock.receipt.create).not.toHaveBeenCalled();
  });

  it('blocks USER and ADMIN from listing receipts (SUPER_ADMIN-only)', async () => {
    const userRes = await request(app).get('/api/receipts').set(userAuth);
    const adminRes = await request(app).get('/api/receipts').set(adminAuth);
    expect(userRes.status).toBe(403);
    expect(adminRes.status).toBe(403);
  });

  it('computes totalAmount and amountText from lineItems, then persists', async () => {
    prismaMock.receiptCounter.upsert.mockResolvedValue({ year: 2569, count: 1 });
    prismaMock.receipt.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'rcp-1', ...data }),
    );

    const res = await request(app).post('/api/receipts').set(auth).send(baseBody);

    expect(res.status).toBe(201);
    // totalAmount is explicitly converted to a number in serialize() — a raw
    // Prisma Decimal would otherwise JSON-serialize as a string and silently
    // break Number-only formatting (e.g. .toLocaleString()) on the frontend.
    expect(res.body.totalAmount).toBe(800);
    expect(res.body.amountText).toBe('แปดร้อยบาทถ้วน');
    expect(res.body.number).toBe(1);
    expect(res.body.buddhistYear).toBe(2569);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('assigns sequential numbers across two calls in the same year', async () => {
    prismaMock.receiptCounter.upsert
      .mockResolvedValueOnce({ year: 2569, count: 1 })
      .mockResolvedValueOnce({ year: 2569, count: 2 });
    prismaMock.receipt.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'rcp-x', ...data }),
    );

    const first = await request(app).post('/api/receipts').set(auth).send(baseBody);
    const second = await request(app).post('/api/receipts').set(auth).send(baseBody);

    expect(first.body.number).toBe(1);
    expect(second.body.number).toBe(2);
  });

  it('rejects a body with no line items', async () => {
    const res = await request(app)
      .post('/api/receipts')
      .set(auth)
      .send({ ...baseBody, lineItems: [] });
    expect(res.status).toBe(400);
    expect(prismaMock.receipt.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid kind', async () => {
    const res = await request(app)
      .post('/api/receipts')
      .set(auth)
      .send({ ...baseBody, kind: 'banana' });
    expect(res.status).toBe(400);
  });

  it('lists receipts newest-first', async () => {
    prismaMock.receipt.findMany.mockResolvedValue([{ id: 'rcp-1' }]);
    prismaMock.receipt.count.mockResolvedValue(1);
    const res = await request(app).get('/api/receipts').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(prismaMock.receipt.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('404s fetching a receipt that does not exist', async () => {
    prismaMock.receipt.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/receipts/nope').set(auth);
    expect(res.status).toBe(404);
  });

  it('check-existing finds receipts covering any of the given treatment record ids, open to any role', async () => {
    prismaMock.receipt.findMany.mockResolvedValue([
      { id: 'rcp-1', number: 5, buddhistYear: 2569, kind: 'individual', customerName: 'นายทดสอบ', issueDate: new Date('2026-01-01'), treatmentRecordIds: ['r1', 'r2'] },
    ]);
    const res = await request(app)
      .post('/api/receipts/check-existing')
      .set(userAuth)
      .send({ treatmentRecordIds: ['r2', 'r3'] });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(prismaMock.receipt.findMany.mock.calls[0][0].where).toEqual({
      treatmentRecordIds: { hasSome: ['r2', 'r3'] },
    });
  });

  it('check-existing returns an empty list without querying when no ids are given', async () => {
    const res = await request(app)
      .post('/api/receipts/check-existing')
      .set(userAuth)
      .send({ treatmentRecordIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(prismaMock.receipt.findMany).not.toHaveBeenCalled();
  });
});
