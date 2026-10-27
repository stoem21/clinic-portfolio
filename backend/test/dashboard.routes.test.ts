import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { clinicToday } from '../src/lib/clinicDay';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    client: { count: vi.fn() },
    dentist: { findUnique: vi.fn() },
    treatmentRecord: { count: vi.fn(), findMany: vi.fn() },
    treatmentItem: { aggregate: vi.fn(), groupBy: vi.fn() },
    treatmentPayment: { findMany: vi.fn() },
    labWork: { findMany: vi.fn() },
  },
}));
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

import { app } from '../src/index';
import { signAccessToken } from '../src/lib/jwt';

const token = signAccessToken({ id: 'u1', username: 'admin', role: 'ADMIN' });
const auth = { Authorization: `Bearer ${token}` };
const ownerToken = signAccessToken({ id: 'o1', username: 'owner', role: 'SUPER_ADMIN' });
const authOwner = { Authorization: `Bearer ${ownerToken}` };
const userToken = signAccessToken({ id: 'usr1', username: 'user', role: 'USER' });
const authUser = { Authorization: `Bearer ${userToken}` };

const startOfToday = () => {
  return new Date(clinicToday());
};

describe('dashboard — GET / dailyBreakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.client.count.mockResolvedValue(0);
    prismaMock.treatmentRecord.count.mockResolvedValue(0);
    // revenueBetween (today + month) — counted at the clinic level, supply included.
    prismaMock.treatmentItem.aggregate.mockResolvedValue({ _sum: { price: new Prisma.Decimal(700) } });
    prismaMock.treatmentItem.groupBy.mockResolvedValue([]);
    prismaMock.treatmentPayment.findMany.mockResolvedValue([
      { type: 'cash', amount: new Prisma.Decimal(500), treatmentRecord: { treatmentDate: new Date('2026-06-01') } },
      { type: 'transfer', amount: new Prisma.Decimal(200), treatmentRecord: { treatmentDate: new Date('2026-06-01') } },
    ]);
    prismaMock.treatmentRecord.findMany.mockResolvedValue([
      {
        dentistId: 'd1',
        dentist: { name: 'หมอเอ' },
        treatmentDate: new Date('2026-06-01'),
        items: [
          { type: 'filling', price: new Prisma.Decimal(500) },
          { type: 'supply', price: new Prisma.Decimal(200) },
        ],
      },
    ]);
  });

  it('a day entry: per-dentist revenue excludes supply, supplyCost captures it separately, and payment sums land on the right day', async () => {
    const res = await request(app).get('/api/dashboard').set(auth);
    expect(res.status).toBe(200);

    const day = res.body.dailyBreakdown.find((d: any) => d.date === '2026-06-01');
    expect(day).toBeDefined();
    expect(day.dentists).toEqual([{ dentistId: 'd1', name: 'หมอเอ', revenue: 500 }]);
    expect(day.supplyCost).toBe(200);
    expect(day.cash).toBe(500);
    expect(day.transfer).toBe(200);
    expect(day.socialSecurity).toBe(0);

    // Clinic-wide range total still includes supply.
    expect(res.body.rangeTotalRevenue).toBe(700);

    // Today revenue still shows; this-month revenue is owner-only (null here).
    expect(res.body.revenueToday).toBe(700);
    expect(res.body.revenueMonth).toBeNull();

    // This route no longer touches lab work at all.
    expect(prismaMock.labWork.findMany).not.toHaveBeenCalled();
  });

  it('an X-ray item with big/OPG film type contributes to supplyCost too, excluded from per-dentist revenue', async () => {
    prismaMock.treatmentRecord.findMany.mockResolvedValue([
      {
        dentistId: 'd1',
        dentist: { name: 'หมอเอ' },
        treatmentDate: new Date('2026-06-01'),
        items: [
          { type: 'filling', price: new Prisma.Decimal(500), data: {} },
          {
            type: 'xRay',
            price: new Prisma.Decimal(300),
            data: { type: 'big', filmType: ['opg'] },
          },
          {
            // Non-OPG X-ray stays a normal treatment-type line.
            type: 'xRay',
            price: new Prisma.Decimal(150),
            data: { type: 'small', tooth: ['11'] },
          },
        ],
      },
    ]);

    const res = await request(app).get('/api/dashboard').set(auth);
    expect(res.status).toBe(200);

    const day = res.body.dailyBreakdown.find((d: any) => d.date === '2026-06-01');
    // OPG X-ray excluded from per-dentist revenue (500 + 150 non-OPG);
    // non-OPG X-ray still counts toward it. Both OPG's 300 land in supplyCost.
    expect(day.dentists.find((x: any) => x.dentistId === 'd1').revenue).toBe(650);
    expect(day.supplyCost).toBe(300);
  });

  it('sums cash/transfer/socialSecurity per day and sorts dentists within a day by revenue descending', async () => {
    prismaMock.treatmentRecord.findMany.mockResolvedValue([
      {
        dentistId: 'd1',
        dentist: { name: 'หมอเอ' },
        treatmentDate: new Date('2026-06-02'),
        items: [{ type: 'filling', price: new Prisma.Decimal(300), data: {} }],
      },
      {
        dentistId: 'd2',
        dentist: { name: 'หมอบี' },
        treatmentDate: new Date('2026-06-02'),
        items: [{ type: 'filling', price: new Prisma.Decimal(900), data: {} }],
      },
    ]);
    prismaMock.treatmentPayment.findMany.mockResolvedValue([
      { type: 'cash', amount: new Prisma.Decimal(400), treatmentRecord: { treatmentDate: new Date('2026-06-02') } },
      { type: 'transfer', amount: new Prisma.Decimal(600), treatmentRecord: { treatmentDate: new Date('2026-06-02') } },
      { type: 'socialSecurity', amount: new Prisma.Decimal(200), treatmentRecord: { treatmentDate: new Date('2026-06-02') } },
    ]);

    const res = await request(app).get('/api/dashboard').set(auth);
    const day = res.body.dailyBreakdown.find((d: any) => d.date === '2026-06-02');
    expect(day.cash).toBe(400);
    expect(day.transfer).toBe(600);
    expect(day.socialSecurity).toBe(200);
    expect(day.dentists.map((x: any) => x.dentistId)).toEqual(['d2', 'd1']);
  });

  it('rows are sorted by date ascending, and a day with only payments (no treatment items) still appears', async () => {
    prismaMock.treatmentRecord.findMany.mockResolvedValue([
      {
        dentistId: 'd1',
        dentist: { name: 'หมอเอ' },
        treatmentDate: new Date('2026-06-03'),
        items: [{ type: 'filling', price: new Prisma.Decimal(100), data: {} }],
      },
    ]);
    prismaMock.treatmentPayment.findMany.mockResolvedValue([
      { type: 'cash', amount: new Prisma.Decimal(50), treatmentRecord: { treatmentDate: new Date('2026-06-01') } },
    ]);

    const res = await request(app).get('/api/dashboard').set(auth);
    expect(res.body.dailyBreakdown.map((d: any) => d.date)).toEqual(['2026-06-01', '2026-06-03']);
    const day1 = res.body.dailyBreakdown.find((d: any) => d.date === '2026-06-01');
    expect(day1.cash).toBe(50);
    expect(day1.dentists).toEqual([]);
  });

  it('ADMIN is locked to today even when from/to are passed', async () => {
    const res = await request(app)
      .get('/api/dashboard?from=2020-01-01&to=2020-12-31')
      .set(auth);
    expect(res.status).toBe(200);
    const where = prismaMock.treatmentRecord.findMany.mock.calls[0][0].where;
    expect((where.treatmentDate.gte as Date).getTime()).toBe(startOfToday().getTime());
  });

  it('SUPER_ADMIN can select a custom period', async () => {
    const res = await request(app)
      .get('/api/dashboard?from=2020-01-01&to=2020-12-31')
      .set(authOwner);
    expect(res.status).toBe(200);
    const gte = prismaMock.treatmentRecord.findMany.mock.calls[0][0].where.treatmentDate.gte as Date;
    expect(gte.getFullYear()).toBe(2020);
    expect(gte.getMonth()).toBe(0);
    expect(gte.getDate()).toBe(1);
    // This-month revenue is visible to the owner.
    expect(res.body.revenueMonth).toBe(700);
  });
});

const makeLabWorkRow = (overrides: Record<string, any> = {}) => ({
  id: 'lw1',
  type: 'implant',
  placementDentistId: 'd1',
  placementDentist: { name: 'หมอเอ' },
  deliveredDentistId: null,
  deliveredDentist: null,
  cost: null,
  placementPaid: false,
  deliveredPaid: false,
  placementPaidAt: null,
  deliveredPaidAt: null,
  deliveredAssignedDate: new Date('2026-06-01'),
  treatmentRecord: {
    treatmentDate: new Date('2026-06-01'),
    client: { hn: '690001', nameTitle: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี' },
  },
  ...overrides,
});

describe('dashboard — GET /dentist/:dentistId', () => {
  it('blocks future end dates', async () => {
    expect((await request(app).get('/api/dashboard/dentist/d1?from=2026-01-01&to=2999-01-01').set(authOwner)).status).toBe(400);
  });
  it('today deducts both payments within the period and unpaid rows', async () => {
    prismaMock.labWork.findMany.mockResolvedValue([
      makeLabWorkRow({ id: 'paid', cost: new Prisma.Decimal(1000), placementPaid: true, placementPaidAt: new Date() }),
      makeLabWorkRow({ id: 'unpaid', cost: new Prisma.Decimal(1000) }),
    ]);
    const res = await request(app).get(`/api/dashboard/dentist/d1?from=2026-06-01&to=${clinicToday()}`).set(authOwner);
    expect(res.status).toBe(200);
    expect(res.body.labCost.items).toHaveLength(2);
    expect(res.body.labCost.total).toBe(1000);
    expect(res.body.labCost.items.find((i: { id: string }) => i.id === 'paid:placement').deduction).toBe(500);
    expect(res.body.labCostMode).toBe('unpaid-today');
  });
  it('includes old placement debt paid after cutoff but excludes later delivery assignment', async () => {
    prismaMock.labWork.findMany.mockResolvedValue([makeLabWorkRow({
      cost: new Prisma.Decimal(1000), placementPaid: true, placementPaidAt: new Date('2026-08-30T10:00:00+07:00'),
      deliveredDentistId: 'd1', deliveredAssignedDate: new Date('2026-08-20'), deliveredPaid: false,
    })]);
    const res = await request(app).get('/api/dashboard/dentist/d1?from=2026-08-03&to=2026-08-15').set(authOwner);
    expect(res.status).toBe(200);
    expect(res.body.labCost.total).toBe(0);
    expect(res.body.labCost.items.map((i: { id: string }) => i.id)).toEqual(['lw1:placement']);
    expect(res.body.labCost.items[0]).toMatchObject({ portion: 'placement', status: 'paid', paidAt: '2026-08-30T03:00:00.000Z', deduction: 0 });
  });
  it('flags missing legacy assignment dates without inventing history', async () => {
    prismaMock.labWork.findMany.mockResolvedValue([makeLabWorkRow({
      cost: new Prisma.Decimal(1000), placementDentistId: 'd2', deliveredDentistId: 'd1', deliveredAssignedDate: null,
    })]);
    const res = await request(app).get('/api/dashboard/dentist/d1?from=2026-08-03&to=2026-08-15').set(authOwner);
    expect(res.body.labCost.total).toBe(0);
    expect(res.body.labCostUnknownDates).toBe(1);
    expect(res.body.labCost.items[0]).toMatchObject({ amount: 500, deduction: 0, issue: 'incomplete-dates' });
  });
  it.each(['from=2026-09-20&to=2026-09-01', 'from=2026-02-30', 'to=invalid'])('rejects invalid ranges: %s', async query => {
    expect((await request(app).get(`/api/dashboard/dentist/d1?${query}`).set(authOwner)).status).toBe(400);
  });
  it('includes both selected clinical dates and preserves the lab filter', async () => {
    const res = await request(app).get('/api/dashboard/dentist/d1?from=2026-06-01&to=2026-06-30&scopeLabCost=true').set(authOwner);
    expect(res.status).toBe(200);
    const where = prismaMock.treatmentRecord.findMany.mock.calls[0][0].where;
    expect(where.treatmentDate).toEqual({ gte: new Date('2026-06-01T00:00:00.000Z'), lte: new Date('2026-06-30T23:59:59.999Z') });
    expect(prismaMock.labWork.findMany.mock.calls[0][0].where.treatmentRecord.treatmentDate).toBeUndefined();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.dentist.findUnique.mockResolvedValue({ id: 'd1', name: 'หมอเอ' });
    prismaMock.treatmentRecord.findMany.mockResolvedValue([]);
    prismaMock.labWork.findMany.mockResolvedValue([]);
  });

  it('404s for an unknown dentist', async () => {
    prismaMock.dentist.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/dashboard/dentist/nope').set(authOwner);
    expect(res.status).toBe(404);
  });

  it('returns treatment records (with per-record cost) and the itemized lab-cost list for just this dentist', async () => {
    prismaMock.treatmentRecord.findMany.mockResolvedValue([
      {
        id: 'r1',
        treatmentDate: new Date('2026-06-01'),
        client: { hn: '690001', nameTitle: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี' },
        items: [{ type: 'filling', price: new Prisma.Decimal(500), data: {} }],
      },
    ]);
    prismaMock.labWork.findMany.mockResolvedValue([
      makeLabWorkRow({ id: 'lw1', cost: new Prisma.Decimal(800), placementPaid: false }),
    ]);

    const res = await request(app).get('/api/dashboard/dentist/d1').set(authOwner);
    expect(res.status).toBe(200);
    expect(res.body.dentistId).toBe('d1');
    expect(res.body.name).toBe('หมอเอ');
    expect(res.body.treatmentRecords).toEqual([
      {
        id: 'r1',
        treatmentDate: '2026-06-01T00:00:00.000Z',
        client: { hn: '690001', nameTitle: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี' },
        items: [{ type: 'filling', price: '500', data: {} }],
        cost: 500,
      },
    ]);
    expect(res.body.incomeTotal).toBe(500);
    expect(res.body.labCost).toEqual({
      total: 400,
      items: [{ id: 'lw1:placement', type: 'implant', patientName: 'นายสมชาย ใจดี', amount: 400, portion: 'placement', status: 'unpaid', paidAt: null, deduction: 400, issue: null }],
    });
    expect(res.body.net).toBe(100); // 500 - 400

    // Scoped to this dentist only, both directions.
    const labWorkWhere = prismaMock.labWork.findMany.mock.calls[0][0].where;
    expect(labWorkWhere.OR).toEqual([{ placementDentistId: 'd1' }, { deliveredDentistId: 'd1' }]);
  });

  it('excludes supply-category items from a record\'s cost and from incomeTotal, matching GET /', async () => {
    prismaMock.treatmentRecord.findMany.mockResolvedValue([
      {
        id: 'r1',
        treatmentDate: new Date('2026-06-01'),
        client: { hn: '690001', nameTitle: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี' },
        items: [
          { type: 'filling', price: new Prisma.Decimal(500), data: {} },
          { type: 'supply', price: new Prisma.Decimal(200), data: {} },
        ],
      },
    ]);

    const res = await request(app).get('/api/dashboard/dentist/d1').set(authOwner);
    expect(res.status).toBe(200);
    // The supply item still appears in `items` (still billed, still visible)...
    expect(res.body.treatmentRecords[0].items).toEqual([
      { type: 'filling', price: '500', data: {} },
      { type: 'supply', price: '200', data: {} },
    ]);
    // ...but its price is excluded from this record's cost and from incomeTotal.
    expect(res.body.treatmentRecords[0].cost).toBe(500);
    expect(res.body.incomeTotal).toBe(500);
  });

  it('includes a lab-cost item for this dentist even as the delivered-only dentist', async () => {
    prismaMock.labWork.findMany.mockResolvedValue([
      makeLabWorkRow({
        id: 'lw2',
        deliveredDentistId: 'd1',
        deliveredDentist: { name: 'หมอเอ' },
        placementDentistId: 'd2',
        cost: new Prisma.Decimal(1000),
        placementPaid: true,
        deliveredPaid: false,
      }),
    ]);

    const res = await request(app).get('/api/dashboard/dentist/d1').set(authOwner);
    expect(res.status).toBe(200);
    expect(res.body.labCost.items).toEqual([
      { id: 'lw2:delivered', type: 'implant', patientName: 'นายสมชาย ใจดี', amount: 500, portion: 'delivered', status: 'unpaid', paidAt: null, deduction: 500, issue: null },
    ]);
  });

  it('scopeLabCost behaves the same as the main dashboard route', async () => {
    await request(app)
      .get('/api/dashboard/dentist/d1?from=2020-01-01&to=2020-01-31&scopeLabCost=true')
      .set(authOwner);

    const where = prismaMock.labWork.findMany.mock.calls[0][0].where;
    expect(where.treatmentRecord.deletedAt).toBeNull();
    expect(where.treatmentRecord.treatmentDate).toBeUndefined(); // carry-forward, not period-only
  });

  it('USER role gets masked labCost (net falls back to incomeTotal)', async () => {
    prismaMock.treatmentRecord.findMany.mockResolvedValue([
      {
        id: 'r1',
        treatmentDate: new Date('2026-06-01'),
        client: { hn: '690001', nameTitle: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี' },
        items: [{ type: 'filling', price: new Prisma.Decimal(500), data: {} }],
      },
    ]);
    prismaMock.labWork.findMany.mockResolvedValue([
      makeLabWorkRow({ cost: new Prisma.Decimal(800), placementPaid: false }),
    ]);

    const res = await request(app).get('/api/dashboard/dentist/d1').set(authUser);
    expect(res.status).toBe(200);
    expect(res.body.labCost).toEqual({ total: 0, items: [] });
    expect(res.body.net).toBe(500);
  });
});
