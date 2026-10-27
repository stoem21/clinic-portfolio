import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { db } = vi.hoisted(() => ({ db: {
  $transaction: vi.fn(), $queryRaw: vi.fn(),
  hnCounter: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  client: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }, auditLog: { create: vi.fn() },
} }));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
import router from '../src/routes/hnCounter';
import clients from '../src/routes/clients';
import { currentHnYear, highestHnCount, formatHn, reserveHn } from '../src/lib/generateHn';
import { signAccessToken } from '../src/lib/jwt';
const app = express();
app.use(express.json());
app.use('/api/hn-counter', router);
app.use('/api/clients', clients);
const year = currentHnYear();
const token = (role: 'SUPER_ADMIN' | 'ADMIN' | 'USER') => signAccessToken({ id: 'u1', username: 'staff', role });
const put = (body = {}) => request(app).put('/api/hn-counter').set('Authorization', `Bearer ${token('SUPER_ADMIN')}`)
  .send({ year, count: 125, expectedCount: 150, expectedVersion: 2, reason: 'Correct cancelled reservations', ...body });
beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(fn => fn(db));
  db.$queryRaw.mockResolvedValue([{ locked: 1 }]);
  db.hnCounter.findUnique.mockResolvedValue({ year, count: 150, version: 2 });
  db.client.findMany.mockResolvedValue([{ hn: formatHn(year, 125) }, { hn: formatHn(year, 20) }]);
  db.hnCounter.upsert.mockImplementation(async ({ update }) => ({ year, count: update.count, version: 3 }));
  db.auditLog.create.mockResolvedValue({});
});

describe('HN counter administration', () => {
  it.each(['ADMIN', 'USER'] as const)('blocks %s from reading and changing the counter', async role => {
    expect((await request(app).get('/api/hn-counter').set('Authorization', `Bearer ${token(role)}`)).status).toBe(403);
    expect((await request(app).put('/api/hn-counter').set('Authorization', `Bearer ${token(role)}`).send({})).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('requires authentication', async () => {
    expect((await request(app).get('/api/hn-counter')).status).toBe(401);
  });
  it('returns the floor including deleted patients without exposing patient names', async () => {
    const res = await request(app).get('/api/hn-counter').set('Authorization', `Bearer ${token('SUPER_ADMIN')}`);
    expect(res.body).toMatchObject({ count: 150, minimum: 125, highestHn: formatHn(year, 125) });
    expect(db.client.findMany).toHaveBeenCalledWith({ where: { hn: { startsWith: String(year).slice(-2) } }, select: { hn: true } });
  });
  it('allows rollback to the highest HN, invalidates drafts and records the change in the same transaction', async () => {
    const res = await put();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ count: 125, version: 3, nextHn: formatHn(year, 126) });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.hnCounter.upsert.mock.calls[0][0].update).toEqual({ count: 125, version: { increment: 1 } });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ actorId: 'u1', entity: 'hn-counter', changes: [{ field: 'count', before: 150, after: 125 }] });
  });
  it('rejects going below the highest used HN', async () => {
    expect((await put({ count: 124 })).status).toBe(400);
    expect(db.hnCounter.upsert).not.toHaveBeenCalled();
  });
  it.each([{ expectedCount: 149 }, { expectedVersion: 1 }])('rejects a stale panel: %o', async body => {
    expect((await put(body)).status).toBe(409);
    expect(db.hnCounter.upsert).not.toHaveBeenCalled();
  });
  it.each([{ count: -1 }, { count: 1.5 }, { count: '125' }, { count: 2147483647 }, { year: year - 1 }, { reason: ' ' }])('rejects invalid input: %o', async body => {
    expect((await put(body)).status).toBe(400);
    expect(db.hnCounter.upsert).not.toHaveBeenCalled();
  });
  it('does not invalidate drafts on a no-op', async () => {
    expect((await put({ count: 150 })).status).toBe(200);
    expect(db.hnCounter.upsert).not.toHaveBeenCalled();
  });
  it('uses numeric sequence ordering, not creation order or string sorting', () => {
    expect(highestHnCount(year, [{ hn: formatHn(year, 10000) }, { hn: formatHn(year, 9999) }, { hn: '000000' }, { hn: formatHn(year - 1, 999999) }])).toBe(10000);
  });
  it('allocates above existing HNs even if an imported counter is behind', async () => {
    db.hnCounter.findUnique.mockResolvedValue({ year, count: 1, version: 2 });
    expect(await reserveHn()).toMatchObject({ hn: formatHn(year, 126) });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
});


describe('forms reserved before a counter adjustment', () => {
  const patient = { nameTitle: 'Mr', firstName: 'Test', lastName: 'Example', phoneNumber: '0000000000', gender: 'other', birthday: '1900-01-01' };
  it.each([undefined, 1])('rejects an old/missing reservation version %s even if the HN is reallocated', async hnVersion => {
    const res = await request(app).post('/api/clients').set('Authorization', `Bearer ${token('ADMIN')}`)
      .send({ ...patient, hn: formatHn(year, 140), hnVersion });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HN_RESERVATION_EXPIRED');
    expect(db.client.create).not.toHaveBeenCalled();
  });
  it('accepts a current reservation while holding the allocation lock', async () => {
    db.client.create.mockResolvedValue({ id: 'c1', hn: formatHn(year, 140), ...patient });
    const res = await request(app).post('/api/clients').set('Authorization', `Bearer ${token('ADMIN')}`)
      .send({ ...patient, hn: formatHn(year, 140), hnVersion: 2 });
    expect(res.status).toBe(201);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('does not let cancellation from an old form decrement an adjusted counter', async () => {
    const res = await request(app).post('/api/clients/release-hn').set('Authorization', `Bearer ${token('ADMIN')}`)
      .send({ hn: formatHn(year, 150), version: 1 });
    expect(res.body).toEqual({ released: false });
    expect(db.hnCounter.updateMany).not.toHaveBeenCalled();
  });
});


describe('correct an assigned patient HN', () => {
  const oldHn = formatHn(year, 12);
  const newHn = formatHn(year, 11);
  const correct = (role: 'SUPER_ADMIN' | 'ADMIN' | 'USER' = 'ADMIN', body = {}) =>
    request(app).patch('/api/clients/c1/hn').set('Authorization', `Bearer ${token(role)}`)
      .send({ hn: newHn, expectedHn: oldHn, reason: 'Wrong counter skipped a number', ...body });
  beforeEach(() => {
    db.client.findUnique.mockImplementation(async ({ where }) => where.id ? { id: 'c1', hn: oldHn, deletedAt: null } : null);
    db.client.findMany.mockResolvedValue([{ hn: oldHn }]);
    db.hnCounter.findUnique.mockResolvedValue({ year, count: 12, version: 2 });
    db.client.update.mockResolvedValue({ id: 'c1', hn: newHn });
  });
  it.each(['ADMIN', 'SUPER_ADMIN'] as const)('allows %s to correct 12 to unused 11, preserves patient ID and audits', async role => {
    const res = await correct(role);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'c1', hn: newHn });
    expect(db.client.update.mock.calls[0][0]).toMatchObject({ where: { id: 'c1' }, data: { hn: newHn } });
    expect(db.hnCounter.upsert.mock.calls[0][0].update).toEqual({ count: 12, version: { increment: 1 } });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ entity: 'client', entityId: 'c1', changes: [{ field: 'hn', before: oldHn, after: newHn }] });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('rejects ordinary staff', async () => {
    expect((await correct('USER')).status).toBe(403);
    expect(db.client.update).not.toHaveBeenCalled();
  });
  it('rejects a target owned by an archived patient', async () => {
    db.client.findUnique.mockImplementation(async ({ where }) => where.id
      ? { id: 'c1', hn: oldHn, deletedAt: null } : { id: 'c2', hn: newHn, deletedAt: new Date() });
    expect((await correct()).status).toBe(409);
    expect(db.client.update).not.toHaveBeenCalled();
  });
  it('rejects a stale original HN', async () => {
    expect((await correct('ADMIN', { expectedHn: formatHn(year, 13) })).status).toBe(409);
    expect(db.client.update).not.toHaveBeenCalled();
  });
  it.each([{ hn: formatHn(year, 13) }, { hn: formatHn(year - 1, 11) }, { hn: formatHn(year, 0) }, { hn: oldHn }, { reason: ' ' }, { hn: 'invalid' }])('rejects invalid correction %o', async body => {
    expect((await correct('ADMIN', body)).status).toBe(400);
    expect(db.client.update).not.toHaveBeenCalled();
  });
  it('rejects an archived source patient', async () => {
    db.client.findUnique.mockResolvedValue({ id: 'c1', hn: oldHn, deletedAt: new Date() });
    expect((await correct()).status).toBe(404);
    expect(db.client.update).not.toHaveBeenCalled();
  });
});
