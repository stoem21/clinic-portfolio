import { LAB_COMPANIES } from '../src/lib/labCompanies';
import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { clinicToday } from '../src/lib/clinicDay';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    labWork: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    dentist: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

import { app } from '../src/index';
import { signAccessToken } from '../src/lib/jwt';

const adminToken = signAccessToken({ id: 'a1', username: 'admin', role: 'ADMIN' });
const auth = { Authorization: `Bearer ${adminToken}` };
const userToken = signAccessToken({ id: 'u1', username: 'user', role: 'USER' });
const userAuth = { Authorization: `Bearer ${userToken}` };
const superAdminToken = signAccessToken({ id: 's1', username: 'superadmin', role: 'SUPER_ADMIN' });
const superAuth = { Authorization: `Bearer ${superAdminToken}` };

const makeLabWork = (overrides: Record<string, any> = {}) => ({
  id: 'lw1',
  treatmentRecordId: 'r1',
  treatmentRecord: { treatmentDate: new Date('2026-06-01') },
  deliveredAssignedDate: new Date('2026-06-01'),
  type: 'implant',
  placementDentistId: 'd1',
  deliveredDentistId: null,
  cost: null,
  placementPaid: false,
  placementPaidAt: null,
  deliveredPaid: false,
  deliveredPaidAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeSerialized = (overrides: Record<string, any> = {}) => ({
  ...makeLabWork(overrides),
  treatmentRecord: {
    id: 'r1',
    treatmentDate: new Date('2026-06-01'),
    client: { id: 'c1', hn: '690001', nameTitle: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี' },
  },
  placementDentist: { id: 'd1', name: 'หมอเอ' },
  deliveredDentist: overrides.deliveredDentistId ? { id: overrides.deliveredDentistId, name: 'หมอบี' } : null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('lab-work — access control', () => {
  it('blocks USER on every endpoint', async () => {
    const getRes = await request(app).get('/api/lab-work').set(userAuth);
    expect(getRes.status).toBe(403);

    const patchRes = await request(app).patch('/api/lab-work/lw1').set(userAuth).send({ cost: 100 });
    expect(patchRes.status).toBe(403);

    const placementRes = await request(app).patch('/api/lab-work/lw1/placement-paid').set(userAuth);
    expect(placementRes.status).toBe(403);

    const deliveredRes = await request(app).patch('/api/lab-work/lw1/delivered-paid').set(userAuth);
    expect(deliveredRes.status).toBe(403);
  });

  it('allows ADMIN', async () => {
    prismaMock.labWork.findMany.mockResolvedValue([]);
    prismaMock.labWork.count.mockResolvedValue(0);
    const res = await request(app).get('/api/lab-work').set(auth);
    expect(res.status).toBe(200);
  });
});

describe('lab-work — GET list filters', () => {
  it('returns each portion payment date separately', async () => {
    prismaMock.labWork.findMany.mockResolvedValue([makeSerialized({ placementPaid: true, placementPaidAt: new Date('2026-08-30T03:00:00Z'), deliveredPaid: false, deliveredPaidAt: null })]);
    prismaMock.labWork.count.mockResolvedValue(1);
    const res = await request(app).get('/api/lab-work').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ placementPaid: true, placementPaidAt: '2026-08-30T03:00:00.000Z', deliveredPaid: false, deliveredPaidAt: null });
  });
  beforeEach(() => {
    prismaMock.labWork.findMany.mockResolvedValue([]);
    prismaMock.labWork.count.mockResolvedValue(0);
  });

  it('status=missingCost filters on cost: null', async () => {
    await request(app).get('/api/lab-work?status=missingCost').set(auth);
    const where = prismaMock.labWork.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ cost: null });
  });

  it('status=missingDelivery filters on deliveredDentistId: null', async () => {
    await request(app).get('/api/lab-work?status=missingDelivery').set(auth);
    const where = prismaMock.labWork.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ deliveredDentistId: null });
  });

  it('status=fullyPaid requires placementPaid and (no delivered dentist OR deliveredPaid)', async () => {
    await request(app).get('/api/lab-work?status=fullyPaid').set(auth);
    const where = prismaMock.labWork.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ cost: { not: null } });
    expect(where.AND).toContainEqual({ placementPaid: true });
    expect(where.AND).toContainEqual({
      OR: [{ deliveredDentistId: null }, { deliveredPaid: true }],
    });
  });

  it('dentistId matches placement OR delivered', async () => {
    await request(app).get('/api/lab-work?dentistId=d1').set(auth);
    const where = prismaMock.labWork.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      OR: [{ placementDentistId: 'd1' }, { deliveredDentistId: 'd1' }],
    });
  });

  it('combining dentistId + status=fullyPaid keeps both OR clauses intact (no clobbering)', async () => {
    await request(app).get('/api/lab-work?dentistId=d1&status=fullyPaid').set(auth);
    const where = prismaMock.labWork.findMany.mock.calls[0][0].where;
    const orClauses = where.AND.filter((c: any) => c.OR);
    expect(orClauses).toHaveLength(2);
    expect(orClauses).toContainEqual({
      OR: [{ placementDentistId: 'd1' }, { deliveredDentistId: 'd1' }],
    });
    expect(orClauses).toContainEqual({
      OR: [{ deliveredDentistId: null }, { deliveredPaid: true }],
    });
  });

  it('an unrecognized type is silently dropped (no type filter applied)', async () => {
    await request(app).get('/api/lab-work?type=banana').set(auth);
    const where = prismaMock.labWork.findMany.mock.calls[0][0].where;
    expect(where.AND.some((c: any) => 'type' in c)).toBe(false);
  });
});

describe('lab-work — PATCH /:id (cost + deliveredDentistId)', () => {
  it.each([
    { placementPaid: true, body: { cost: 900 } },
    { deliveredPaid: true, body: { cost: 900 } },
    { deliveredPaid: true, body: { deliveredDentistId: 'd3' } },
    { deliveredPaid: true, body: { deliveredAssignedDate: '2026-08-03' } },
  ])('blocks changes to a paid portion: %j', async ({ body, ...flags }) => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork({ cost: new Prisma.Decimal(500), deliveredDentistId: 'd2', ...flags }));
    expect((await request(app).patch('/api/lab-work/lw1').set(auth).send(body)).status).toBe(409);
    expect(prismaMock.labWork.update).not.toHaveBeenCalled();
  });
  it('stores an explicit backdated delivery assignment', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork({ deliveredDentistId: 'd2' }));
    prismaMock.labWork.update.mockResolvedValue(makeSerialized({ deliveredDentistId: 'd2', deliveredAssignedDate: new Date('2026-08-03') }));
    const res = await request(app).patch('/api/lab-work/lw1').set(auth).send({ deliveredAssignedDate: '2026-08-03' });
    expect(res.status).toBe(200);
    expect(prismaMock.labWork.update.mock.calls[0][0].data.deliveredAssignedDate).toEqual(new Date('2026-08-03'));
  });
  it.each(['placement', 'delivered'])('requires explicit confirmation for %s reversal', async side => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork({ placementPaid: true, deliveredPaid: true, placementPaidAt: new Date(), deliveredPaidAt: new Date() }));
    expect((await request(app).patch(`/api/lab-work/lw1/${side}-paid`).set(auth)).status).toBe(409);
    expect(prismaMock.labWork.update).not.toHaveBeenCalled();
  });
  it('sets a company on a legacy job without changing paid flags', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork({ companyId: null }));
    prismaMock.labWork.update.mockResolvedValue(makeSerialized({ companyId: LAB_COMPANIES[1].id }));
    const res = await request(app).patch('/api/lab-work/lw1').set(auth).send({ companyId: LAB_COMPANIES[1].id });
    expect(res.status).toBe(200);
    expect(res.body.companyId).toBe(LAB_COMPANIES[1].id);
    expect(prismaMock.labWork.update.mock.calls[0][0].data).toEqual({ companyId: LAB_COMPANIES[1].id });
  });
  it.each([null, '', 'unknown'])('rejects invalid company %s', async companyId => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork());
    expect((await request(app).patch('/api/lab-work/lw1').set(auth).send({ companyId })).status).toBe(400);
    expect(prismaMock.labWork.update).not.toHaveBeenCalled();
  });
  it('rejects a negative cost with 400', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork());
    const res = await request(app).patch('/api/lab-work/lw1').set(auth).send({ cost: -100 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LAB_COST_MUST_NOT_BE_NEGATIVE');
    expect(prismaMock.labWork.update).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric cost with 400', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork());
    const res = await request(app).patch('/api/lab-work/lw1').set(auth).send({ cost: 'abc' });
    expect(res.status).toBe(400);
  });

  it('accepts a cost of exactly 0', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork());
    prismaMock.labWork.update.mockResolvedValue(makeSerialized({ cost: new Prisma.Decimal(0) }));
    const res = await request(app).patch('/api/lab-work/lw1').set(auth).send({ cost: 0 });
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.labWork.update.mock.calls[0][0];
    expect(updateArgs.data.cost.toString()).toBe('0');
  });

  it('accepts a valid positive cost and resets both paid flags', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(
      makeLabWork({ cost: new Prisma.Decimal(500), placementPaid: false, placementPaidAt: null }),
    );
    prismaMock.labWork.update.mockResolvedValue(makeSerialized({ cost: new Prisma.Decimal(900) }));

    const res = await request(app).patch('/api/lab-work/lw1').set(auth).send({ cost: 900 });

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.labWork.update.mock.calls[0][0];
    expect(updateArgs.data.cost.toString()).toBe('900');
    expect(updateArgs.data.placementPaid).toBe(false);
    expect(updateArgs.data.placementPaidAt).toBeNull();
    expect(updateArgs.data.deliveredPaid).toBe(false);
    expect(updateArgs.data.deliveredPaidAt).toBeNull();
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown deliveredDentistId with 400', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork());
    prismaMock.dentist.findUnique.mockResolvedValue(null);
    const res = await request(app).patch('/api/lab-work/lw1').set(auth).send({ deliveredDentistId: 'nope' });
    expect(res.status).toBe(400);
    expect(prismaMock.labWork.update).not.toHaveBeenCalled();
  });

  it('rejects a soft-deleted deliveredDentistId with 400', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork());
    prismaMock.dentist.findUnique.mockResolvedValue({ id: 'd2', deletedAt: new Date() });
    const res = await request(app).patch('/api/lab-work/lw1').set(auth).send({ deliveredDentistId: 'd2' });
    expect(res.status).toBe(400);
  });

  it('accepts a valid deliveredDentistId and resets deliveredPaid', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(
      makeLabWork({ deliveredDentistId: 'd2', deliveredPaid: false, deliveredPaidAt: null }),
    );
    prismaMock.dentist.findUnique.mockResolvedValue({ id: 'd3', deletedAt: null });
    prismaMock.labWork.update.mockResolvedValue(makeSerialized({ deliveredDentistId: 'd3' }));

    const res = await request(app).patch('/api/lab-work/lw1').set(auth).send({ deliveredDentistId: 'd3' });

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.labWork.update.mock.calls[0][0];
    expect(updateArgs.data.deliveredDentistId).toBe('d3');
    expect(updateArgs.data.deliveredPaid).toBe(false);
    expect(updateArgs.data.deliveredPaidAt).toBeNull();
  });

  it('audit diff shows deliveredDentistId as "id(name)" on both sides', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(
      makeLabWork({ deliveredDentistId: 'd2', deliveredDentist: { name: 'หมอเก่า' } }),
    );
    prismaMock.dentist.findUnique.mockResolvedValue({ id: 'd3', deletedAt: null });
    prismaMock.labWork.update.mockResolvedValue(
      makeSerialized({ deliveredDentistId: 'd3', deliveredDentist: { id: 'd3', name: 'หมอใหม่' } }),
    );

    const res = await request(app).patch('/api/lab-work/lw1').set(auth).send({ deliveredDentistId: 'd3' });

    expect(res.status).toBe(200);
    const changes = prismaMock.auditLog.create.mock.calls[0][0].data.changes;
    expect(changes).toContainEqual({
      field: 'deliveredDentistId',
      before: 'd2(หมอเก่า)',
      after: 'd3(หมอใหม่)',
    });
  });

  it('clearing deliveredDentistId to null resets deliveredPaid too', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(
      makeLabWork({ deliveredDentistId: 'd2', deliveredPaid: false }),
    );
    prismaMock.labWork.update.mockResolvedValue(makeSerialized({ deliveredDentistId: null }));

    const res = await request(app).patch('/api/lab-work/lw1').set(auth).send({ deliveredDentistId: null });

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.labWork.update.mock.calls[0][0];
    expect(updateArgs.data.deliveredDentistId).toBeNull();
    expect(updateArgs.data.deliveredPaid).toBe(false);
  });

  it('404s on an unknown id', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(null);
    const res = await request(app).patch('/api/lab-work/nope').set(auth).send({ cost: 100 });
    expect(res.status).toBe(404);
  });

  it('400s when no updatable fields are provided', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork());
    const res = await request(app).patch('/api/lab-work/lw1').set(auth).send({});
    expect(res.status).toBe(400);
  });
});

describe('lab-work — placement-paid toggle', () => {
  it.each(['placement', 'delivered'])('blocks %s reversal after the payment day even with confirmation', async side => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork({ placementPaid: true, deliveredPaid: true, placementPaidAt: new Date('2020-01-01'), deliveredPaidAt: new Date('2020-01-01') }));
    const res = await request(app).patch(`/api/lab-work/lw1/${side}-paid`).set(superAuth).send({ confirmReversal: true });
    expect(res.status).toBe(403);
    expect(prismaMock.labWork.update).not.toHaveBeenCalled();
  });
  it('rejects payment before a future placement assignment', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork({ cost: new Prisma.Decimal(500), treatmentRecord: { treatmentDate: new Date('2999-01-01') } }));
    expect((await request(app).patch('/api/lab-work/lw1/placement-paid').set(auth)).status).toBe(400);
    expect(prismaMock.labWork.update).not.toHaveBeenCalled();
  });
  it('rejects turning on when cost is null', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(makeLabWork({ cost: null, placementPaid: false }));
    const res = await request(app).patch('/api/lab-work/lw1/placement-paid').set(auth);
    expect(res.status).toBe(400);
    expect(prismaMock.labWork.update).not.toHaveBeenCalled();
  });

  it('turns on when cost is set, and sets placementPaidAt', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(
      makeLabWork({ cost: new Prisma.Decimal(500), placementPaid: false }),
    );
    prismaMock.labWork.update.mockResolvedValue(
      makeSerialized({ cost: new Prisma.Decimal(500), placementPaid: true }),
    );

    const res = await request(app).patch('/api/lab-work/lw1/placement-paid').set(auth);

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.labWork.update.mock.calls[0][0];
    expect(updateArgs.data.placementPaid).toBe(true);
    expect(updateArgs.data.placementPaidAt).toBeInstanceOf(Date);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'mark-placement-paid' }) }),
    );
  });

  it('is reversible with explicit confirmation and clears placementPaidAt', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(
      makeLabWork({ cost: new Prisma.Decimal(500), placementPaid: true, placementPaidAt: new Date() }),
    );
    prismaMock.labWork.update.mockResolvedValue(
      makeSerialized({ cost: new Prisma.Decimal(500), placementPaid: false }),
    );

    const res = await request(app).patch('/api/lab-work/lw1/placement-paid').set(auth).send({ confirmReversal: true });

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.labWork.update.mock.calls[0][0];
    expect(updateArgs.data.placementPaid).toBe(false);
    expect(updateArgs.data.placementPaidAt).toBeNull();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'unmark-placement-paid' }) }),
    );
  });
});

describe('lab-work — delivered-paid toggle', () => {
  it('rejects turning on when cost is null', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(
      makeLabWork({ cost: null, deliveredDentistId: 'd2', deliveredPaid: false }),
    );
    const res = await request(app).patch('/api/lab-work/lw1/delivered-paid').set(auth);
    expect(res.status).toBe(400);
  });

  it('rejects turning on when deliveredDentistId is null', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(
      makeLabWork({ cost: new Prisma.Decimal(500), deliveredDentistId: null, deliveredPaid: false }),
    );
    const res = await request(app).patch('/api/lab-work/lw1/delivered-paid').set(auth);
    expect(res.status).toBe(400);
  });

  it('turns on once both cost and deliveredDentistId are set', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(
      makeLabWork({ cost: new Prisma.Decimal(500), deliveredDentistId: 'd2', deliveredPaid: false }),
    );
    prismaMock.labWork.update.mockResolvedValue(
      makeSerialized({ cost: new Prisma.Decimal(500), deliveredDentistId: 'd2', deliveredPaid: true }),
    );

    const res = await request(app).patch('/api/lab-work/lw1/delivered-paid').set(auth);

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.labWork.update.mock.calls[0][0];
    expect(updateArgs.data.deliveredPaid).toBe(true);
    expect(updateArgs.data.deliveredPaidAt).toBeInstanceOf(Date);
  });

  it('is reversible with explicit confirmation', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(
      makeLabWork({ cost: new Prisma.Decimal(500), deliveredDentistId: 'd2', deliveredPaid: true, deliveredPaidAt: new Date() }),
    );
    prismaMock.labWork.update.mockResolvedValue(
      makeSerialized({ cost: new Prisma.Decimal(500), deliveredDentistId: 'd2', deliveredPaid: false }),
    );

    const res = await request(app).patch('/api/lab-work/lw1/delivered-paid').set(auth).send({ confirmReversal: true });

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.labWork.update.mock.calls[0][0];
    expect(updateArgs.data.deliveredPaid).toBe(false);
    expect(updateArgs.data.deliveredPaidAt).toBeNull();
  });

  it('404s on an unknown id', async () => {
    prismaMock.labWork.findUnique.mockResolvedValue(null);
    const res = await request(app).patch('/api/lab-work/nope/delivered-paid').set(auth);
    expect(res.status).toBe(404);
  });
});

describe('lab-work — POST /pay-all', () => {
  beforeEach(() => {
    prismaMock.labWork.updateMany.mockResolvedValue({ count: 0 });
  });

  it('403s for ADMIN (SUPER_ADMIN only, stricter than the router default)', async () => {
    const res = await request(app).post('/api/lab-work/pay-all').set(auth);
    expect(res.status).toBe(403);
    expect(prismaMock.labWork.updateMany).not.toHaveBeenCalled();
  });

  it('403s for USER', async () => {
    const res = await request(app).post('/api/lab-work/pay-all').set(userAuth);
    expect(res.status).toBe(403);
  });

  it('marks placementPaid for every cost-known unpaid row regardless of delivery status', async () => {
    prismaMock.labWork.updateMany.mockResolvedValue({ count: 3 });
    await request(app).post('/api/lab-work/pay-all').set(superAuth);

    const placementCall = prismaMock.labWork.updateMany.mock.calls[0][0];
    expect(placementCall.where).toEqual({
      treatmentRecord: { deletedAt: null, treatmentDate: { lte: new Date(`${clinicToday()}T23:59:59.999Z`) } },
      cost: { not: null },
      placementPaid: false,
    });
    expect(placementCall.data.placementPaid).toBe(true);
    expect(placementCall.data.placementPaidAt).toBeInstanceOf(Date);
  });

  it('marks deliveredPaid only where a delivered dentist is assigned', async () => {
    prismaMock.labWork.updateMany.mockResolvedValue({ count: 2 });
    await request(app).post('/api/lab-work/pay-all').set(superAuth);

    const deliveredCall = prismaMock.labWork.updateMany.mock.calls[1][0];
    expect(deliveredCall.where).toEqual({
      treatmentRecord: { deletedAt: null },
      cost: { not: null },
      deliveredDentistId: { not: null },
      deliveredAssignedDate: { lte: new Date(clinicToday()) },
      deliveredPaid: false,
    });
    expect(deliveredCall.data.deliveredPaid).toBe(true);
    expect(deliveredCall.data.deliveredPaidAt).toBeInstanceOf(Date);
  });

  it('ignores filters — always system-wide (no dentistId/date scoping in the where clauses)', async () => {
    await request(app).post('/api/lab-work/pay-all?dentistId=d1&from=2020-01-01').set(superAuth);
    const [placementCall, deliveredCall] = prismaMock.labWork.updateMany.mock.calls;
    expect(placementCall[0].where).not.toHaveProperty('placementDentistId');
    expect(deliveredCall[0].where).not.toHaveProperty('treatmentDate');
  });

  it('returns the counts and writes one summary audit entry', async () => {
    prismaMock.labWork.updateMany
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 2 });

    const res = await request(app).post('/api/lab-work/pay-all').set(superAuth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ placementCount: 3, deliveredCount: 2 });
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    const call = prismaMock.auditLog.create.mock.calls[0][0].data;
    expect(call.action).toBe('pay-all');
    expect(call.entity).toBe('lab-work');
    expect(call.entityId).toBe('all');
    expect(call.summary).toContain('5');
  });
});
