import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => {
  const mock: Record<string, any> = {
    treatmentRecord: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    treatmentItem: { deleteMany: vi.fn(), findMany: vi.fn() },
    treatmentPayment: { deleteMany: vi.fn() },
    client: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prismaMock: mock };
});
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

import { app } from '../src/index';
import { signAccessToken } from '../src/lib/jwt';
import { LAB_COMPANIES } from '../src/lib/labCompanies';

const token = signAccessToken({ id: 'u1', username: 'admin', role: 'ADMIN' });
const auth = { Authorization: `Bearer ${token}` };

// Fresh record each call — finalizeOrthoCase mutates record.client in place.
const makeRecord = (overrides: Record<string, any> = {}) => ({
  id: 'r1',
  clientId: 'c1',
  dentistId: 'd1',
  treatmentDate: new Date('2026-06-01'),
  note: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  client: {
    id: 'c1',
    hn: '690001',
    nameTitle: 'นาย',
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    orthoDentId: null,
    orthoDent: null,
    ...overrides.client,
  },
  dentist: { id: 'd1', name: 'หมอจัดฟัน' },
  items: [],
  payments: [],
  _count: { labWorks: 0 },
});

const baseBody = {
  clientId: 'c1',
  dentistId: 'd1',
  treatmentDate: '2026-06-01',
  items: [{ type: 'ortho', data: {}, price: 1000 }],
  payments: [{ type: 'cash', amount: 1000 }],
};

describe('treatments — ortho case start/end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(prismaMock));
    prismaMock.treatmentItem.deleteMany.mockResolvedValue({});
    prismaMock.client.update.mockResolvedValue({});
    prismaMock.auditLog.create.mockResolvedValue({});
  });

  it("'start' assigns the record's dentist as the client's ortho dentist + audits", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ orthoDentId: null, orthoDent: null });
    prismaMock.treatmentRecord.create.mockResolvedValue(makeRecord());

    const res = await request(app)
      .post('/api/treatments')
      .set(auth)
      .send({ ...baseBody, orthoCaseAction: 'start' });

    expect(res.status).toBe(201);
    expect(prismaMock.client.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { orthoDentId: 'd1' },
    });
    const orthoAudit = prismaMock.auditLog.create.mock.calls
      .map((c: any[]) => c[0].data)
      .find((d: any) => d.action === 'ortho-start');
    expect(orthoAudit).toBeTruthy();
    expect(orthoAudit.entity).toBe('client');
    // No prior ortho dentist (before: null); after gets the id(name) format.
    expect(orthoAudit.changes).toEqual([
      { field: 'orthoDentId', before: null, after: 'd1(หมอจัดฟัน)' },
    ]);
  });

  it("'end' clears the client's ortho dentist", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      orthoDentId: 'd9',
      orthoDent: { name: 'เก่า' },
    });
    prismaMock.treatmentRecord.create.mockResolvedValue(
      makeRecord({ client: { orthoDentId: 'd9', orthoDent: { id: 'd9', name: 'เก่า' } } }),
    );

    const res = await request(app)
      .post('/api/treatments')
      .set(auth)
      .send({ ...baseBody, orthoCaseAction: 'end' });

    expect(res.status).toBe(201);
    expect(prismaMock.client.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { orthoDentId: null },
    });
    const orthoAudit = prismaMock.auditLog.create.mock.calls
      .map((c: any[]) => c[0].data)
      .find((d: any) => d.action === 'ortho-end');
    // Prior ortho dentist gets the id(name) format; after is null (case ended).
    expect(orthoAudit.changes).toEqual([
      { field: 'orthoDentId', before: 'd9(เก่า)', after: null },
    ]);
  });

  it('leaves the client untouched when no ortho action is sent', async () => {
    prismaMock.treatmentRecord.create.mockResolvedValue(makeRecord());

    const res = await request(app).post('/api/treatments').set(auth).send(baseBody);

    expect(res.status).toBe(201);
    expect(prismaMock.client.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid orthoCaseAction with 400', async () => {
    const res = await request(app)
      .post('/api/treatments')
      .set(auth)
      .send({ ...baseBody, orthoCaseAction: 'banana' });

    expect(res.status).toBe(400);
    expect(prismaMock.treatmentRecord.create).not.toHaveBeenCalled();
  });
});

describe('treatments — audit diff shows id(name) for dentist/client changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(prismaMock));
    prismaMock.treatmentItem.deleteMany.mockResolvedValue({});
    prismaMock.treatmentPayment.deleteMany.mockResolvedValue({});
    prismaMock.client.update.mockResolvedValue({});
    prismaMock.auditLog.create.mockResolvedValue({});
  });

  afterEach(() => vi.useRealTimers());

  it.each([
    ['2026-10-27T12:00:00Z', '2026-10-27'],
    ['2026-10-27T18:00:00Z', '2026-10-28'],
  ])(
    'PUT (normal branch): dentistId/clientId changes are stored as "id(name)" at %s', async (instant, visitDay) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(instant));
    const sameDayAuth = { Authorization: `Bearer ${signAccessToken({ id: 'u1', username: 'admin', role: 'ADMIN' })}` };
    // Visit dates are calendar values anchored at UTC midnight, not clock instants.
    const today = new Date(visitDay);
    const existing = {
      id: 'r1',
      clientId: 'c-old',
      dentistId: 'd-old',
      treatmentDate: today,
      note: null,
      client: { hn: '690099' },
      dentist: { name: 'หมอเก่า' },
    };
    prismaMock.treatmentRecord.findFirst.mockResolvedValue(existing);
    prismaMock.treatmentRecord.update.mockResolvedValue(makeRecord());

    const res = await request(app)
      .put('/api/treatments/r1')
      .set(sameDayAuth) // ADMIN, but same-day record hits the normal (non-restricted) branch
      .send({ ...baseBody, treatmentDate: today.toISOString().slice(0, 10) });

    expect(res.status).toBe(200);
    const updateAudit = prismaMock.auditLog.create.mock.calls
      .map((c: any[]) => c[0].data)
      .find((d: any) => d.entity === 'treatment' && d.action === 'update');
    expect(updateAudit).toBeTruthy();
    expect(updateAudit.changes).toEqual(
      expect.arrayContaining([
        { field: 'clientId', before: 'c-old(690099)', after: 'c1(690001)' },
        { field: 'dentistId', before: 'd-old(หมอเก่า)', after: 'd1(หมอจัดฟัน)' },
      ]),
    );
  });
});

describe('treatments — non-negative cost and payments for positive totals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(prismaMock));
    prismaMock.treatmentItem.deleteMany.mockResolvedValue({});
    prismaMock.treatmentPayment.deleteMany.mockResolvedValue({});
    prismaMock.client.update.mockResolvedValue({});
    prismaMock.auditLog.create.mockResolvedValue({});
  });

  it('rejects a create with every item price null (no cost)', async () => {
    const res = await request(app)
      .post('/api/treatments')
      .set(auth)
      .send({ ...baseBody, items: [{ type: 'ortho', data: {}, price: null }], payments: [] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ตั้งแต่ 0/);
    expect(prismaMock.treatmentRecord.create).not.toHaveBeenCalled();
  });

  it('rejects a create with a positive cost but zero payments', async () => {
    const res = await request(app)
      .post('/api/treatments')
      .set(auth)
      .send({ ...baseBody, payments: [] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/การชำระเงินอย่างน้อย 1 รายการ/);
    expect(prismaMock.treatmentRecord.create).not.toHaveBeenCalled();
  });

  it('accepts a create with cost > 0 and a matching single cash payment', async () => {
    prismaMock.treatmentRecord.create.mockResolvedValue(makeRecord());
    const res = await request(app).post('/api/treatments').set(auth).send(baseBody);
    expect(res.status).toBe(201);
  });

  it('accepts an explicit zero price without payments', async () => {
    prismaMock.treatmentRecord.create.mockResolvedValue(makeRecord());
    const res = await request(app).post('/api/treatments').set(auth).send({
      ...baseBody, items: [{ type: 'others', data: { otherText: 'No charge' }, price: 0 }], payments: [],
    });
    expect(res.status).toBe(201);
    const data = prismaMock.treatmentRecord.create.mock.calls[0][0].data;
    expect(Number(data.items.create[0].price)).toBe(0);
  });

  it('rejects a negative item even when another item makes the total positive', async () => {
    const res = await request(app).post('/api/treatments').set(auth).send({
      ...baseBody, items: [{ type: 'others', data: {}, price: -10 }, { type: 'others', data: {}, price: 110 }],
      payments: [{type: 'cash', amount: 100}],
    });
    expect(res.status).toBe(400);
    expect(prismaMock.treatmentRecord.create).not.toHaveBeenCalled();
  });

  it('the past-day restricted PUT branch succeeds with no payments sent (exemption holds)', async () => {
    // Existing record dated in the past, relative to "today" in this test run.
    const existing = {
      id: 'r1',
      clientId: 'c1',
      dentistId: 'd1',
      treatmentDate: new Date('2020-01-01'),
      note: null,
    };
    prismaMock.treatmentRecord.findFirst.mockResolvedValue(existing);
    prismaMock.treatmentItem.findMany.mockResolvedValue([{ price: null }]);
    prismaMock.treatmentRecord.update.mockResolvedValue(makeRecord());

    // ADMIN token (not SUPER_ADMIN) on a past-dated record hits the restricted
    // branch, which never reads `payments` — so sending none must still succeed.
    const res = await request(app)
      .put('/api/treatments/r1')
      .set(auth)
      .send({
        clientId: 'c1',
        dentistId: 'd1',
        treatmentDate: '2020-01-01',
        items: [{ type: 'ortho', data: {}, price: null }],
        payments: [],
      });

    expect(res.status).toBe(200);
  });
});

describe('treatments — lab work additions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(prismaMock));
    prismaMock.treatmentItem.deleteMany.mockResolvedValue({});
    prismaMock.treatmentPayment.deleteMany.mockResolvedValue({});
    prismaMock.client.update.mockResolvedValue({});
    prismaMock.auditLog.create.mockResolvedValue({});
  });

  it('POST creates nested labWork rows with placementDentistId = the submitted dentistId', async () => {
    prismaMock.treatmentRecord.create.mockResolvedValue(makeRecord());
    const res = await request(app)
      .post('/api/treatments')
      .set(auth)
      .send({ ...baseBody, labWorks: [{ type: 'implant', companyId: LAB_COMPANIES[0].id }, { type: 'rtn', companyId: LAB_COMPANIES[1].id }] });

    expect(res.status).toBe(201);
    const createArgs = prismaMock.treatmentRecord.create.mock.calls[0][0];
    expect(createArgs.data.labWorks).toEqual({
      create: [
        { type: 'implant', companyId: LAB_COMPANIES[0].id, placementDentistId: 'd1' },
        { type: 'rtn', companyId: LAB_COMPANIES[1].id, placementDentistId: 'd1' },
      ],
    });
  });

  it('POST rejects an invalid labWorks[].type with 400', async () => {
    const res = await request(app)
      .post('/api/treatments')
      .set(auth)
      .send({ ...baseBody, labWorks: [{ type: 'banana' }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/lab work type must be one of/);
    expect(prismaMock.treatmentRecord.create).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'unknown'])('POST requires a recognized lab company (%s)', async companyId => {
    const res = await request(app).post('/api/treatments').set(auth).send({ ...baseBody, labWorks: [{ type: 'implant', companyId }] });
    expect(res.status).toBe(400);
    expect(prismaMock.treatmentRecord.create).not.toHaveBeenCalled();
  });

  it.each([-1, 'abc', 100000000])('rejects invalid lab cost %s without updating', async (cost) => {
    prismaMock.treatmentRecord.findFirst.mockResolvedValue({ treatmentDate: new Date() });
    const res = await request(app).put('/api/treatments/r1').set(auth)
      .send({ ...baseBody, labWorks: [{ type: 'implant', companyId: LAB_COMPANIES[0].id, cost }] });
    expect(res.status).toBe(400);
    expect(prismaMock.treatmentRecord.update).not.toHaveBeenCalled();
  });

  it.each(['post', 'put'] as const)('rejects USER cost entry on %s', async (method) => {
    prismaMock.treatmentRecord.findFirst.mockResolvedValue({ treatmentDate: new Date() });
    const userToken = signAccessToken({ id: 'u2', username: 'staff', role: 'USER' });
    const res = await request(app)[method](method === 'post' ? '/api/treatments' : '/api/treatments/r1')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...baseBody, labWorks: [{ type: 'implant', companyId: LAB_COMPANIES[0].id, cost: 100 }] });
    expect(res.status).toBe(403);
    expect(prismaMock.treatmentRecord.update).not.toHaveBeenCalled();
    expect(prismaMock.treatmentRecord.create).not.toHaveBeenCalled();
  });

  it.each(['', '   ', 'x'.repeat(201)])('requires a valid description for other lab types', async (typeDescription) => {
    const res = await request(app).post('/api/treatments').set(auth)
      .send({ ...baseBody, labWorks: [{ type: 'other', companyId: LAB_COMPANIES[0].id, typeDescription }] });
    expect(res.status).toBe(400);
    expect(prismaMock.treatmentRecord.create).not.toHaveBeenCalled();
  });

  it.each(['post', 'put'] as const)('saves a trimmed other lab description on %s', async (method) => {
    prismaMock.treatmentRecord.findFirst.mockResolvedValue({ treatmentDate: new Date(), clientId: 'c1', dentistId: 'd1' });
    prismaMock.treatmentRecord.create.mockResolvedValue(makeRecord());
    prismaMock.treatmentRecord.update.mockResolvedValue(makeRecord());
    const res = await request(app)[method](method === 'post' ? '/api/treatments' : '/api/treatments/r1').set(auth)
      .send({ ...baseBody, labWorks: [{ type: 'other', companyId: LAB_COMPANIES[0].id, typeDescription: '  Surgical guide  ' }] });
    expect(res.status).toBe(method === 'post' ? 201 : 200);
    const mock = method === 'post' ? prismaMock.treatmentRecord.create : prismaMock.treatmentRecord.update;
    expect(mock.mock.calls[0][0].data.labWorks.create[0].typeDescription).toBe('Surgical guide');
  });

  it('defaults staff-created treatments to the Bangkok day even before UTC midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-26T18:00:00Z'));
    try {
      prismaMock.treatmentRecord.create.mockResolvedValue(makeRecord());
      const res = await request(app).post('/api/treatments').set(auth).send(baseBody);
      expect(res.status).toBe(201);
      expect(prismaMock.treatmentRecord.create.mock.calls[0][0].data.treatmentDate.toISOString()).toBe('2026-09-27T00:00:00.000Z');
    } finally { vi.useRealTimers(); }
  });

  it('PUT appends lab jobs to past treatments without replacing existing jobs', async () => {
    const existing = {
      id: 'r1',
      clientId: 'c1',
      dentistId: 'd1',
      treatmentDate: new Date('2020-01-01'),
      note: null,
    };
    prismaMock.treatmentRecord.findFirst.mockResolvedValue(existing);
    prismaMock.treatmentItem.findMany.mockResolvedValue([{ price: null }]);
    prismaMock.treatmentRecord.update.mockResolvedValue(makeRecord());

    const res = await request(app)
      .put('/api/treatments/r1')
      .set(auth)
      .send({
        clientId: 'c1',
        dentistId: 'd1',
        treatmentDate: '2020-01-01',
        items: [{ type: 'ortho', data: {}, price: null }],
        payments: [],
        labWorks: [{ type: 'implant', companyId: LAB_COMPANIES[0].id }],
      });

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.treatmentRecord.update.mock.calls[0][0];
    expect(updateArgs.data.labWorks).toEqual({ create: [{ type: 'implant', companyId: LAB_COMPANIES[0].id, placementDentistId: 'd1' }] });
  });

  it('PUT appends lab jobs and their cost on same-day edits', async () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const existing = {
      id: 'r1',
      clientId: 'c1',
      dentistId: 'd1',
      treatmentDate: new Date(todayIso),
      note: null,
    };
    prismaMock.treatmentRecord.findFirst.mockResolvedValue(existing);
    prismaMock.treatmentRecord.update.mockResolvedValue(makeRecord());

    const res = await request(app)
      .put('/api/treatments/r1')
      .set(auth)
      .send({
        ...baseBody,
        treatmentDate: todayIso,
        labWorks: [{ type: 'denture', companyId: LAB_COMPANIES[0].id, cost: 1250.50 }],
      });

    expect(res.status).toBe(200);
    const updateArgs = prismaMock.treatmentRecord.update.mock.calls[0][0];
    expect(Object.keys(updateArgs.data.labWorks)).toEqual(['create']);
    expect(updateArgs.data.labWorks.create[0]).toMatchObject({ type: 'denture', companyId: LAB_COMPANIES[0].id, placementDentistId: 'd1' });
    expect(Number(updateArgs.data.labWorks.create[0].cost)).toBe(1250.50);
  });
});

describe('treatments — GET list paymentType filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.treatmentRecord.findMany.mockResolvedValue([]);
    prismaMock.treatmentRecord.count.mockResolvedValue(0);
  });

  it('paginates a client history with a stable ordering for same-day records', async () => {
    prismaMock.treatmentRecord.count.mockResolvedValue(45);
    const res = await request(app).get('/api/treatments')
      .query({ clientId: 'c1', page: 2, limit: 20 }).set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, limit: 20, total: 45, totalPages: 3 });
    expect(prismaMock.treatmentRecord.findMany.mock.calls[0][0]).toMatchObject({
      where: { clientId: 'c1' }, skip: 20, take: 20,
      orderBy: [{ treatmentDate: 'desc' }, { id: 'desc' }],
    });
  });

  it('filters by a single payment type', async () => {
    const res = await request(app)
      .get('/api/treatments')
      .query({ limit: 'all', paymentType: 'cash' })
      .set(auth);

    expect(res.status).toBe(200);
    const where = prismaMock.treatmentRecord.findMany.mock.calls[0][0].where;
    expect(where.payments).toEqual({ some: { type: { in: ['cash'] } } });
  });

  it('accepts a comma-separated list of payment types', async () => {
    const res = await request(app)
      .get('/api/treatments')
      .query({ limit: 'all', paymentType: 'cash,transfer' })
      .set(auth);

    expect(res.status).toBe(200);
    const where = prismaMock.treatmentRecord.findMany.mock.calls[0][0].where;
    expect(where.payments).toEqual({ some: { type: { in: ['cash', 'transfer'] } } });
  });

  it('drops unknown payment types and applies no filter if none remain', async () => {
    const res = await request(app)
      .get('/api/treatments')
      .query({ limit: 'all', paymentType: 'bogus' })
      .set(auth);

    expect(res.status).toBe(200);
    const where = prismaMock.treatmentRecord.findMany.mock.calls[0][0].where;
    expect(where.payments).toBeUndefined();
  });

  it('applies no payment filter when paymentType is omitted', async () => {
    const res = await request(app).get('/api/treatments').query({ limit: 'all' }).set(auth);

    expect(res.status).toBe(200);
    const where = prismaMock.treatmentRecord.findMany.mock.calls[0][0].where;
    expect(where.payments).toBeUndefined();
  });
});
