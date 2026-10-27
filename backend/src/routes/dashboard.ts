import { Router, Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middlewares/authenticate';
import { resolveCostCategory } from '../lib/costCategory';
import { resolveDashboardRange } from '../lib/dashboardRange';
import { clinicToday, validDay } from '../lib/clinicDay';
import { labPortionInPeriod } from '../lib/labReport';

const router = Router();

router.use(authenticate);
router.use((req, res, next) => {
  if (req.user?.role === Role.SUPER_ADMIN) {
    for (const key of ['from', 'to']) {
      const value = req.query[key];
      if (value !== undefined && value !== '' && !validDay(value)) return res.status(400).json({ message: 'Invalid date range' });
    }
    const { rangeFrom, rangeTo } = resolveDashboardRange(req);
    if (rangeTo.toISOString().slice(0, 10) > clinicToday()) return res.status(400).json({ message: 'End date cannot be in the future' });
    if (rangeFrom > rangeTo) return res.status(400).json({ message: 'Start date must not be later than end date' });
  }
  next();
});

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

// Sum of item prices for non-deleted records whose treatmentDate is in range.
async function revenueBetween(gte: Date, lte: Date): Promise<number> {
  const agg = await prisma.treatmentItem.aggregate({
    _sum: { price: true },
    where: { treatmentRecord: { deletedAt: null, treatmentDate: { gte, lte } } },
  });
  return agg._sum.price ? Number(agg._sum.price) : 0;
}

/** yyyy-mm-dd for the given Date's UTC calendar day. `treatmentDate` is
 * always stored UTC-midnight-anchored (parsed from a bare date-only input —
 * see frontend/src/lib/format.ts's comment on the same convention), so
 * reading it back via toISOString() reconstructs the original calendar day
 * regardless of what timezone this server process happens to run in. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface DayEntry {
  date: string;
  cash: number;
  transfer: number;
  socialSecurity: number;
  supplyCost: number;
  dentists: Map<string, { dentistId: string; name: string; revenue: number }>;
}

/**
 * GET /api/dashboard?from=&to= — headline stats + a day-by-day breakdown of
 * the selected range (payment sums, supply cost, per-dentist revenue).
 * `from`/`to` default to the current month.
 */
router.get('/', async (req: Request, res: Response) => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = startOfMonth(now);

  const { isOwner, rangeFrom, rangeTo } = resolveDashboardRange(req);

  const [
    totalClients,
    newPatientsMonth,
    todayTreatments,
    revenueToday,
    revenueMonth,
    byTypeGroups,
    rangeRecords,
    paymentRows,
  ] = await Promise.all([
    prisma.client.count({ where: { deletedAt: null } }),
    prisma.client.count({
      where: { deletedAt: null, createdAt: { gte: monthStart } },
    }),
    prisma.treatmentRecord.count({
      where: { deletedAt: null, treatmentDate: { gte: todayStart, lte: todayEnd } },
    }),
    revenueBetween(todayStart, todayEnd),
    revenueBetween(monthStart, todayEnd),
    prisma.treatmentItem.groupBy({
      by: ['type'],
      _count: { _all: true },
      where: {
        treatmentRecord: {
          deletedAt: null,
          treatmentDate: { gte: monthStart, lte: todayEnd },
        },
      },
    }),
    prisma.treatmentRecord.findMany({
      where: {
        deletedAt: null,
        treatmentDate: { gte: rangeFrom, lte: rangeTo },
      },
      select: {
        dentistId: true,
        dentist: { select: { name: true } },
        treatmentDate: true,
        items: { select: { type: true, price: true, data: true } },
      },
    }),
    prisma.treatmentPayment.findMany({
      where: {
        treatmentRecord: {
          deletedAt: null,
          treatmentDate: { gte: rangeFrom, lte: rangeTo },
        },
      },
      select: { type: true, amount: true, treatmentRecord: { select: { treatmentDate: true } } },
    }),
  ]);

  let rangeTotalRevenue = 0;

  // One entry per calendar day that has any activity in the range — payment
  // sums, supply-category cost (see costCategory.ts: material/lab-adjacent
  // items that aren't a dentist's own production), and per-dentist revenue.
  const dailyMap = new Map<string, DayEntry>();
  function ensureDay(key: string): DayEntry {
    let entry = dailyMap.get(key);
    if (!entry) {
      entry = { date: key, cash: 0, transfer: 0, socialSecurity: 0, supplyCost: 0, dentists: new Map() };
      dailyMap.set(key, entry);
    }
    return entry;
  }

  for (const r of rangeRecords) {
    const day = ensureDay(dayKey(r.treatmentDate));
    const dentistEntry =
      day.dentists.get(r.dentistId) ?? { dentistId: r.dentistId, name: r.dentist.name, revenue: 0 };
    for (const it of r.items) {
      const price = it.price === null ? 0 : Number(it.price as Prisma.Decimal);
      rangeTotalRevenue += price;
      if (resolveCostCategory(it)) {
        // Charged to the patient and counted in clinic-wide revenue, but
        // intentionally excluded from a dentist's production figure.
        day.supplyCost += price;
      } else {
        dentistEntry.revenue += price;
      }
    }
    day.dentists.set(r.dentistId, dentistEntry);
  }

  for (const p of paymentRows) {
    const day = ensureDay(dayKey(p.treatmentRecord.treatmentDate));
    const amount = Number(p.amount as Prisma.Decimal);
    if (p.type === 'cash') day.cash += amount;
    else if (p.type === 'transfer') day.transfer += amount;
    else if (p.type === 'socialSecurity') day.socialSecurity += amount;
  }

  const dailyBreakdown = Array.from(dailyMap.values())
    .map((d) => ({
      date: d.date,
      cash: d.cash,
      transfer: d.transfer,
      socialSecurity: d.socialSecurity,
      supplyCost: d.supplyCost,
      dentists: Array.from(d.dentists.values()).sort((a, b) => b.revenue - a.revenue),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const treatmentsByType = byTypeGroups
    .map((g) => ({ type: g.type, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  return res.json({
    totalClients,
    newPatientsMonth,
    todayTreatments,
    revenueToday,
    // This-month revenue is owner-only; hidden from USER/ADMIN.
    revenueMonth: isOwner ? revenueMonth : null,
    treatmentsByType,
    dailyBreakdown,
    rangeTotalRevenue,
    range: { from: rangeFrom.toISOString(), to: rangeTo.toISOString() },
  });
});

/**
 * GET /api/dashboard/dentist/:dentistId?from=&to=&scopeLabCost= — full
 * drill-down for one dentist over the selected period: every treatment
 * record (patient, items, cost), relevant lab portions and their deductions,
 * and the income/labCost/net sums. Same period semantics as GET / (resolved via the
 * same shared helper so the two routes never drift apart).
 */
router.get('/dentist/:dentistId', async (req: Request, res: Response) => {
  const dentistId = String(req.params.dentistId);
  const { rangeFrom, rangeTo } = resolveDashboardRange(req);

  const dentist = await prisma.dentist.findUnique({
    where: { id: dentistId },
    select: { id: true, name: true },
  });
  if (!dentist) {
    return res.status(404).json({ message: 'Dentist not found' });
  }

  const [records, labWorkRows] = await Promise.all([
    prisma.treatmentRecord.findMany({
      where: { dentistId, deletedAt: null, treatmentDate: { gte: rangeFrom, lte: rangeTo } },
      select: {
        id: true,
        treatmentDate: true,
        client: { select: { hn: true, nameTitle: true, firstName: true, lastName: true } },
        items: { select: { type: true, price: true, data: true } },
      },
      orderBy: { treatmentDate: 'desc' },
    }),
    prisma.labWork.findMany({
      where: {
        OR: [{ placementDentistId: dentistId }, { deliveredDentistId: dentistId }],
        treatmentRecord: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
        type: true,
        typeDescription: true,
        placementDentistId: true,
        deliveredDentistId: true,
        cost: true,
        placementPaid: true,
        deliveredPaid: true,
        placementPaidAt: true,
        deliveredPaidAt: true,
        deliveredAssignedDate: true,
        treatmentRecord: {
          select: {
            treatmentDate: true,
            client: { select: { hn: true, nameTitle: true, firstName: true, lastName: true } },
          },
        },
      },
    }),
  ]);

  const treatmentRecords = records.map((r) => {
    // Same exclusion as GET /'s dailyBreakdown: supply/X-ray-OPG items are
    // charged to the patient but aren't this dentist's own production, so
    // they're shown in `items` (still billed, still visible) but left out
    // of this record's `cost` and therefore out of `incomeTotal` below.
    const cost = r.items.reduce((sum, it) => {
      if (resolveCostCategory(it)) return sum;
      const price = it.price === null ? 0 : Number(it.price as Prisma.Decimal);
      return sum + price;
    }, 0);
    return {
      id: r.id,
      treatmentDate: r.treatmentDate,
      client: r.client,
      items: r.items,
      cost,
    };
  });
  const incomeTotal = treatmentRecords.reduce((sum, r) => sum + r.cost, 0);

  // Both portions are independent. Older assignments can still be relevant;
  // the shared policy determines visibility separately from deduction.
  const labCostItems: { id: string; type: string; typeDescription: string | null; patientName: string; amount: number | null; portion: string; status: 'unpaid' | 'paid'; paidAt: Date | null; deduction: number; issue: string | null }[] = [];
  const asOf = rangeTo.toISOString().slice(0, 10);
  const fromDay = rangeFrom.toISOString().slice(0, 10);
  const today = clinicToday();
  for (const lw of labWorkRows) {
    const half = lw.cost === null ? null : Number(lw.cost) / 2;
    const c = lw.treatmentRecord.client;
    const patientName = `${c.nameTitle}${c.firstName} ${c.lastName}`;
    for (const portion of [
      { side: 'placement', dentist: lw.placementDentistId, assigned: lw.treatmentRecord.treatmentDate, paid: lw.placementPaid, paidAt: lw.placementPaidAt },
      { side: 'delivered', dentist: lw.deliveredDentistId, assigned: lw.deliveredAssignedDate, paid: lw.deliveredPaid, paidAt: lw.deliveredPaidAt },
    ]) {
      if (portion.dentist !== dentistId) continue;
      const result = labPortionInPeriod({ assignedDate: portion.assigned ?? null, paid: portion.paid, paidAt: portion.paidAt ?? null, amount: half }, fromDay, asOf, today);
      if (result.visible) labCostItems.push({ id: `${lw.id}:${portion.side}`, type: lw.type, typeDescription: lw.typeDescription, patientName, amount: half, portion: portion.side,
        status: portion.paid ? 'paid' : 'unpaid', paidAt: portion.paidAt ?? null, deduction: result.deduction, issue: result.issue });
    }
  }
  labCostItems.sort((a, b) => Number(!!a.issue) - Number(!!b.issue) || (b.amount ?? 0) - (a.amount ?? 0));
  const labCostTotal = labCostItems.reduce((sum, it) => sum + it.deduction, 0);

  const isUser = req.user?.role === Role.USER;
  const labCost = isUser ? { total: 0, items: [] as typeof labCostItems } : { total: labCostTotal, items: labCostItems };
  const net = isUser ? incomeTotal : incomeTotal - labCostTotal;

  return res.json({
    dentistId: dentist.id,
    name: dentist.name,
    treatmentRecords,
    labCost,
    labCostAsOf: asOf,
    labCostMode: asOf === today ? 'unpaid-today' : 'paid-in-period',
    labCostUnknownDates: isUser ? 0 : labCostItems.filter(i => i.issue).length,
    incomeTotal,
    net,
    range: { from: rangeFrom.toISOString(), to: rangeTo.toISOString() },
  });
});

export default router;
