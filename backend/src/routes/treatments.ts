import { Router, Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { audit, diffFields, idWithLabel } from '../lib/audit';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import { clinicToday } from '../lib/clinicDay';
import { validLabCompany } from '../lib/labCompanies';

const router = Router();

router.use(authenticate);

// Sum item prices; null only when every item price is null.
export function computeTotalCost(items: { price: Prisma.Decimal | null }[]): number | null {
  const prices = items.filter((i) => i.price !== null).map((i) => Number(i.price));
  return prices.length === 0 ? null : prices.reduce((a, b) => a + b, 0);
}

// Treatment dates are stored as UTC-anchored calendar dates.
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Only SUPER_ADMIN sees cost on a record whose visit date isn't today.
function canSeeCost(role: Role | undefined, treatmentDate: Date): boolean {
  return role === Role.SUPER_ADMIN || ymd(treatmentDate) === clinicToday();
}

const recordInclude = {
  client: {
    select: {
      id: true,
      hn: true,
      nameTitle: true,
      firstName: true,
      lastName: true,
      orthoDentId: true,
      orthoDent: { select: { id: true, name: true } },
    },
  },
  dentist: { select: { id: true, name: true } },
  items: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
  _count: { select: { labWorks: true } },
} satisfies Prisma.TreatmentRecordInclude;

type RecordWithRelations = Prisma.TreatmentRecordGetPayload<{
  include: typeof recordInclude;
}>;

// Convert Decimal prices to numbers and attach the computed totalCost. Cost
// fields are nulled out entirely when the viewer isn't allowed to see them
// (never send real prices over the wire to a viewer who shouldn't see them).
function serialize(record: RecordWithRelations, viewerRole: Role) {
  const visible = canSeeCost(viewerRole, record.treatmentDate);
  return {
    id: record.id,
    clientId: record.clientId,
    dentistId: record.dentistId,
    treatmentDate: record.treatmentDate,
    note: record.note,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    client: record.client,
    dentist: record.dentist,
    items: record.items.map((item) => ({
      id: item.id,
      type: item.type,
      data: item.data,
      price: visible && item.price !== null ? Number(item.price) : null,
    })),
    totalCost: visible ? computeTotalCost(record.items) : null,
    payments: visible
      ? record.payments.map((p) => ({ id: p.id, type: p.type, amount: Number(p.amount) }))
      : [],
    // Count only — no cost/dentist detail here, that's the dedicated lab-work
    // page's job. Just lets the treatment list/detail flag "this visit has
    // lab work" for discoverability.
    labWorkCount: record._count.labWorks,
  };
}

interface ItemInput {
  type: string;
  data: unknown;
  price: number | null;
}

interface PaymentInput {
  type: string;
  amount: number;
}

interface LabWorkInput {
  type: string;
  companyId: string;
  cost?: number;
  typeDescription?: string;
}

const PAYMENT_TYPES = ['transfer', 'cash', 'socialSecurity'];
// Exported: reused by labWork.ts to validate the `type` filter/query params.
export const LAB_WORK_TYPES = ['rtn', 'implant', 'denture', 'other'];

// Validates the create/update body. Returns parsed values or an error message.
export function parseBody(
  body: Record<string, unknown>,
):
  | {
      ok: true;
      data: {
        clientId: string;
        dentistId: string;
        treatmentDate: Date;
        note: string | null;
        items: ItemInput[];
        payments: PaymentInput[];
        labWorks: LabWorkInput[];
        orthoCaseAction: 'start' | 'end' | null;
      };
    }
  | { ok: false; message: string } {
  const clientId = typeof body.clientId === 'string' ? body.clientId : '';
  const dentistId = typeof body.dentistId === 'string' ? body.dentistId : '';
  const treatmentDateRaw =
    typeof body.treatmentDate === 'string' ? body.treatmentDate : '';

  if (!clientId) return { ok: false, message: 'clientId is required' };
  if (!dentistId) return { ok: false, message: 'dentistId is required' };
  if (!treatmentDateRaw) return { ok: false, message: 'treatmentDate is required' };

  const treatmentDate = new Date(treatmentDateRaw);
  if (Number.isNaN(treatmentDate.getTime())) {
    return { ok: false, message: 'treatmentDate is not a valid date' };
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { ok: false, message: 'items must contain at least one entry' };
  }

  const items: ItemInput[] = [];
  for (const raw of body.items as unknown[]) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, message: 'each item must be an object' };
    }
    const obj = raw as Record<string, unknown>;
    const type = typeof obj.type === 'string' ? obj.type : '';
    if (!type) return { ok: false, message: 'each item must have a type' };

    let price: number | null = null;
    if (obj.price !== null && obj.price !== undefined && obj.price !== '') {
      const n = Number(obj.price);
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, message: 'item price must be a non-negative number or null' };
      }
      price = n;
    }

    items.push({ type, data: obj.data ?? {}, price });
  }

  // Payments are optional (zero = not tracked yet), but when any are given
  // their amounts must sum to exactly the items' total cost — a partial/
  // mismatched payment breakdown is rejected outright, same "all or exactly
  // right" shape as the client address fields' all-4-or-none rule.
  const payments: PaymentInput[] = [];
  if (body.payments !== undefined && body.payments !== null) {
    if (!Array.isArray(body.payments)) {
      return { ok: false, message: 'payments must be an array' };
    }
    for (const raw of body.payments as unknown[]) {
      if (!raw || typeof raw !== 'object') {
        return { ok: false, message: 'each payment must be an object' };
      }
      const obj = raw as Record<string, unknown>;
      const type = typeof obj.type === 'string' ? obj.type : '';
      if (!PAYMENT_TYPES.includes(type)) {
        return { ok: false, message: `payment type must be one of: ${PAYMENT_TYPES.join(', ')}` };
      }
      const amount = Number(obj.amount);
      if (Number.isNaN(amount) || amount <= 0) {
        return { ok: false, message: 'payment amount must be a positive number' };
      }
      payments.push({ type, amount });
    }
  }
  if (payments.length > 0) {
    const itemsTotal = computeTotalCost(
      items.map((i) => ({ price: i.price === null ? null : new Prisma.Decimal(i.price) })),
    ) ?? 0;
    const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    // Compare in integer cents to avoid floating-point rounding mismatches.
    if (Math.round(itemsTotal * 100) !== Math.round(paymentsTotal * 100)) {
      return {
        ok: false,
        message: `ยอดชำระเงินรวม (${paymentsTotal}) ต้องเท่ากับยอดรวมค่ารักษา (${itemsTotal})`,
      };
    }
  }

  // Lab-work entries are new jobs to append, never replacements of existing jobs.
  const labWorks: LabWorkInput[] = [];
  if (body.labWorks !== undefined && body.labWorks !== null) {
    if (!Array.isArray(body.labWorks)) {
      return { ok: false, message: 'labWorks must be an array' };
    }
    for (const raw of body.labWorks as unknown[]) {
      if (!raw || typeof raw !== 'object') {
        return { ok: false, message: 'each lab work entry must be an object' };
      }
      const obj = raw as Record<string, unknown>;
      const type = typeof obj.type === 'string' ? obj.type : '';
      if (!LAB_WORK_TYPES.includes(type)) {
        return { ok: false, message: `lab work type must be one of: ${LAB_WORK_TYPES.join(', ')}` };
      }
      if (!validLabCompany(obj.companyId)) {
        return { ok: false, message: 'Please select a lab company' };
      }
      if (obj.cost !== undefined && obj.cost !== null &&
          (typeof obj.cost !== 'number' || !Number.isFinite(obj.cost) || obj.cost < 0 || obj.cost > 99999999.99)) {
        return { ok: false, message: 'Lab cost must be a non-negative number below 100,000,000' };
      }
      const typeDescription = typeof obj.typeDescription === 'string' ? obj.typeDescription.trim() : '';
      if (type === 'other' && (!typeDescription || typeDescription.length > 200)) {
        return { ok: false, message: 'Describe the other lab type (1–200 characters)' };
      }
      labWorks.push({ type, companyId: obj.companyId,
        ...(type === 'other' ? { typeDescription } : {}),
        ...(typeof obj.cost === 'number' ? { cost: obj.cost } : {}),
      });
    }
  }

  const note =
    typeof body.note === 'string' && body.note.trim() !== ''
      ? body.note.trim()
      : null;

  // Optional ortho-case toggle: assign the record's dentist as the client's
  // orthodontist ('start') or clear it ('end').
  let orthoCaseAction: 'start' | 'end' | null = null;
  const rawOrtho = body.orthoCaseAction;
  if (rawOrtho === 'start' || rawOrtho === 'end') {
    orthoCaseAction = rawOrtho;
  } else if (rawOrtho !== null && rawOrtho !== undefined && rawOrtho !== '') {
    return { ok: false, message: 'orthoCaseAction must be "start", "end", or null' };
  }

  return {
    ok: true,
    data: { clientId, dentistId, treatmentDate, note, items, payments, labWorks, orthoCaseAction },
  };
}

function toPaymentCreate(
  payments: PaymentInput[],
): Prisma.TreatmentPaymentCreateManyTreatmentRecordInput[] {
  return payments.map((p) => ({ type: p.type, amount: new Prisma.Decimal(p.amount) }));
}

function toLabWorkCreate(
  labWorks: LabWorkInput[],
  placementDentistId: string,
): Prisma.LabWorkCreateManyTreatmentRecordInput[] {
  return labWorks.map((lw) => ({ type: lw.type, companyId: lw.companyId, placementDentistId,
    ...(lw.typeDescription ? { typeDescription: lw.typeDescription } : {}),
    ...(lw.cost !== undefined ? { cost: new Prisma.Decimal(lw.cost) } : {}),
  }));
}

// New records and normal edits require a known, non-negative total. A zero-cost
// visit needs no payment; positive totals require payment. NOT applied on the past-day restricted
// PUT branch below — that branch never touches payments and always submits masked
// (null) prices for a viewer who can't see real cost, so this check would reject
// it incorrectly if called there. parseBody itself stays lenient on purpose so it
// can keep serving that branch too.
function requireCostAndPayments(items: ItemInput[], payments: PaymentInput[]): string | null {
  const itemsTotal = computeTotalCost(
    items.map((i) => ({ price: i.price === null ? null : new Prisma.Decimal(i.price) })),
  );
  if (itemsTotal === null || itemsTotal < 0) {
    return 'กรุณาระบุค่ารักษาเป็นตัวเลขตั้งแต่ 0 บาทขึ้นไป';
  }
  if (itemsTotal > 0 && payments.length === 0) {
    return 'ต้องระบุการชำระเงินอย่างน้อย 1 รายการ';
  }
  return null;
}

function toItemCreate(items: ItemInput[]): Prisma.TreatmentItemCreateManyTreatmentRecordInput[] {
  return items.map((i) => ({
    type: i.type,
    data: (i.data ?? {}) as Prisma.InputJsonValue,
    price: i.price === null ? null : new Prisma.Decimal(i.price),
  }));
}

// Apply the ortho-case toggle to the client, inside the record's transaction so
// it commits/rolls back atomically with the record. 'start' assigns the record's
// dentist as the client's orthodontist; 'end' clears it.
async function applyOrthoCase(
  tx: Prisma.TransactionClient,
  action: 'start' | 'end' | null,
  clientId: string,
  dentistId: string,
): Promise<void> {
  if (action === 'start') {
    await tx.client.update({ where: { id: clientId }, data: { orthoDentId: dentistId } });
  } else if (action === 'end') {
    await tx.client.update({ where: { id: clientId }, data: { orthoDentId: null } });
  }
}

// After the transaction: reflect the ortho change in the response record (its
// client was read before the update) and write a client audit entry.
function finalizeOrthoCase(
  req: Request,
  record: RecordWithRelations,
  action: 'start' | 'end' | null,
  before: string | null,
  beforeName: string | null,
): void {
  if (!action) return;
  const after = action === 'start' ? record.dentistId : null;
  record.client.orthoDentId = after;
  record.client.orthoDent =
    action === 'start' ? { id: record.dentist.id, name: record.dentist.name } : null;
  audit(
    req,
    action === 'start' ? 'ortho-start' : 'ortho-end',
    'client',
    record.clientId,
    record.client.hn,
    [
      {
        field: 'orthoDentId',
        before: idWithLabel(before, beforeName),
        after: idWithLabel(after, action === 'start' ? record.dentist.name : null),
      },
    ],
  );
}

/**
 * GET /api/treatments — filterable, paginated list.
 */
router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  // `limit=all` (or 0) returns every matching record — used by CSV export.
  const limitRaw = typeof req.query.limit === 'string' ? req.query.limit : '';
  const noLimit = limitRaw === 'all' || limitRaw === '0';
  const limit = noLimit ? 0 : Math.max(1, Math.min(100, Number(limitRaw) || 10));

  const deleted = req.query.deleted === 'true'; // trash view — SUPER_ADMIN only
  if (deleted && req.user?.role !== Role.SUPER_ADMIN) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const where: Prisma.TreatmentRecordWhereInput = {
    deletedAt: deleted ? { not: null } : null,
  };
  if (typeof req.query.clientId === 'string' && req.query.clientId) {
    where.clientId = req.query.clientId;
  }
  if (typeof req.query.dentistId === 'string' && req.query.dentistId) {
    where.dentistId = req.query.dentistId;
  }
  // Free-text search across the related client's HN / first / last name.
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const q = req.query.q.trim();
    where.client = {
      OR: [
        { hn: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ],
    };
  }

  const dateFilter: Prisma.DateTimeFilter = {};
  if (typeof req.query.from === 'string' && req.query.from) {
    const from = new Date(req.query.from);
    if (!Number.isNaN(from.getTime())) dateFilter.gte = from;
  }
  if (typeof req.query.to === 'string' && req.query.to) {
    const to = new Date(req.query.to);
    if (!Number.isNaN(to.getTime())) {
      // Make `to` inclusive of the whole day.
      to.setHours(23, 59, 59, 999);
      dateFilter.lte = to;
    }
  }
  if (dateFilter.gte || dateFilter.lte) {
    where.treatmentDate = dateFilter;
  }
  // Comma-separated list, e.g. "cash,transfer" — used by the bulk-receipt
  // filter to include only records with at least one matching payment.
  if (typeof req.query.paymentType === 'string' && req.query.paymentType.trim()) {
    const types = req.query.paymentType
      .split(',')
      .map((s) => s.trim())
      .filter((t) => PAYMENT_TYPES.includes(t));
    if (types.length > 0) {
      where.payments = { some: { type: { in: types } } };
    }
  }

  const [records, total] = await Promise.all([
    prisma.treatmentRecord.findMany({
      where,
      include: recordInclude,
      orderBy: [{ treatmentDate: 'desc' }, { id: 'desc' }],
      skip: noLimit ? undefined : (page - 1) * limit,
      take: noLimit ? undefined : limit,
    }),
    prisma.treatmentRecord.count({ where }),
  ]);

  const viewerRole = req.user!.role;
  return res.json({
    data: records.map((r) => serialize(r, viewerRole)),
    total,
    page: noLimit ? 1 : page,
    limit: noLimit ? total : limit,
    totalPages: noLimit ? 1 : Math.ceil(total / limit) || 1,
  });
});

/**
 * GET /api/treatments/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  const record = await prisma.treatmentRecord.findFirst({
    where: { id: String(req.params.id), deletedAt: null },
    include: recordInclude,
  });
  if (!record) {
    return res.status(404).json({ message: 'Treatment record not found' });
  }
  return res.json(serialize(record, req.user!.role));
});

/**
 * POST /api/treatments — create record + items in one transaction.
 */
router.post('/', async (req: Request, res: Response) => {
  const parsed = parseBody(req.body ?? {});
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.message });
  }
  const { clientId, dentistId, treatmentDate, note, items, payments, labWorks, orthoCaseAction } = parsed.data;
  if (req.user?.role === Role.USER && labWorks.some((lw) => lw.cost !== undefined)) {
    return res.status(403).json({ message: 'Only admins can enter lab costs' });
  }

  const costError = requireCostAndPayments(items, payments);
  if (costError) {
    return res.status(400).json({ message: costError });
  }

  // Only SUPER_ADMIN can create a record dated other than today; ignore any
  // other supplied date from ADMIN/USER.
  const isRestricted = req.user?.role !== Role.SUPER_ADMIN;
  const effectiveDate = isRestricted ? new Date(clinicToday()) : treatmentDate;

  // Snapshot the prior ortho dentist for the audit diff before we change it.
  let priorOrthoDentId: string | null = null;
  let priorOrthoDentName: string | null = null;
  if (orthoCaseAction) {
    const c = await prisma.client.findUnique({
      where: { id: clientId },
      select: { orthoDentId: true, orthoDent: { select: { name: true } } },
    });
    priorOrthoDentId = c?.orthoDentId ?? null;
    priorOrthoDentName = c?.orthoDent?.name ?? null;
  }

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.treatmentRecord.create({
      data: {
        clientId,
        dentistId,
        treatmentDate: effectiveDate,
        note,
        items: { create: toItemCreate(items) },
        payments: { create: toPaymentCreate(payments) },
        labWorks: { create: toLabWorkCreate(labWorks, dentistId) },
      },
      include: recordInclude,
    });
    await applyOrthoCase(tx, orthoCaseAction, clientId, dentistId);
    return created;
  });

  audit(req, 'create', 'treatment', record.id, `${record.client.hn} ${record.treatmentDate.toISOString().slice(0, 10)}`);
  finalizeOrthoCase(req, record, orthoCaseAction, priorOrthoDentId, priorOrthoDentName);
  return res.status(201).json(serialize(record, req.user!.role));
});

/**
 * PUT /api/treatments/:id — replace items, then update record fields.
 */
router.put('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = await prisma.treatmentRecord.findFirst({
    where: { id, deletedAt: null },
    include: {
      client: { select: { hn: true } },
      dentist: { select: { name: true } },
    },
  });
  if (!existing) {
    return res.status(404).json({ message: 'Treatment record not found' });
  }

  const parsed = parseBody(req.body ?? {});
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.message });
  }
  // Append new jobs without changing existing costs, delivery, or paid flags.
  const { clientId, dentistId, treatmentDate, note, items, payments, labWorks, orthoCaseAction } = parsed.data;
  if (req.user?.role === Role.USER && labWorks.some((lw) => lw.cost !== undefined)) {
    return res.status(403).json({ message: 'Only admins can enter lab costs' });
  }

  // ADMIN/USER may not change cost/items/date on a past-dated record — only
  // note/dentist/client. SUPER_ADMIN always has full edit access.
  const isRestricted = req.user?.role !== Role.SUPER_ADMIN;
  const visitIsToday = ymd(existing.treatmentDate) === clinicToday();
  if (isRestricted && !visitIsToday) {
    // May edit item type/detail (+ note/dentist/client) but NOT the cost, the
    // item set (add/remove), or the date. The client can't see real prices for
    // a masked record, so price is never trusted from the request — the
    // original price is always carried over by position, and only the count
    // (add/remove) is validated.
    const existingItems = await prisma.treatmentItem.findMany({
      where: { treatmentRecordId: id },
      select: { price: true },
      orderBy: { createdAt: 'asc' },
    });
    if (items.length !== existingItems.length) {
      return res.status(403).json({
        code: 'TREATMENT_ITEMS_LOCKED_PAST_DATE',
        message: 'ไม่สามารถเพิ่ม/ลบรายการของวันก่อนหน้าได้',
      });
    }
    const preservedItems = items.map((it, i) => ({
      ...it,
      price: existingItems[i].price === null ? null : Number(existingItems[i].price),
    }));
    const limited = await prisma.$transaction(async (tx) => {
      await tx.treatmentItem.deleteMany({ where: { treatmentRecordId: id } });
      return tx.treatmentRecord.update({
        where: { id },
        data: { clientId, dentistId, note, items: { create: toItemCreate(preservedItems) },
          ...(labWorks.length ? { labWorks: { create: toLabWorkCreate(labWorks, dentistId) } } : {}),
        }, // date + ortho + payments frozen
        include: recordInclude,
      });
    });
    const limitedChanges = diffFields(existing, limited, ['clientId', 'dentistId', 'note'], {
      clientId: { before: existing.client?.hn, after: limited.client.hn },
      dentistId: { before: existing.dentist?.name, after: limited.dentist.name },
    });
    audit(req, 'update', 'treatment', limited.id, `${limited.client.hn} ${existing.treatmentDate.toISOString().slice(0, 10)}`, limitedChanges);
    return res.json(serialize(limited, req.user!.role));
  }

  const costError = requireCostAndPayments(items, payments);
  if (costError) {
    return res.status(400).json({ message: costError });
  }

  // Snapshot the prior ortho dentist for the audit diff before we change it.
  let priorOrthoDentId: string | null = null;
  let priorOrthoDentName: string | null = null;
  if (orthoCaseAction) {
    const c = await prisma.client.findUnique({
      where: { id: clientId },
      select: { orthoDentId: true, orthoDent: { select: { name: true } } },
    });
    priorOrthoDentId = c?.orthoDentId ?? null;
    priorOrthoDentName = c?.orthoDent?.name ?? null;
  }

  // ADMIN/USER can't move a record's date even on a same-day edit.
  const effectiveDate = isRestricted ? existing.treatmentDate : treatmentDate;

  const record = await prisma.$transaction(async (tx) => {
    await tx.treatmentItem.deleteMany({ where: { treatmentRecordId: id } });
    await tx.treatmentPayment.deleteMany({ where: { treatmentRecordId: id } });
    const updated = await tx.treatmentRecord.update({
      where: { id },
      data: {
        clientId,
        dentistId,
        treatmentDate: effectiveDate,
        note,
        items: { create: toItemCreate(items) },
        payments: { create: toPaymentCreate(payments) },
        ...(labWorks.length ? { labWorks: { create: toLabWorkCreate(labWorks, dentistId) } } : {}),
      },
      include: recordInclude,
    });
    await applyOrthoCase(tx, orthoCaseAction, clientId, dentistId);
    return updated;
  });

  const changes = diffFields(existing, record, ['clientId', 'dentistId', 'treatmentDate', 'note'], {
    clientId: { before: existing.client?.hn, after: record.client.hn },
    dentistId: { before: existing.dentist?.name, after: record.dentist.name },
  });
  audit(req, 'update', 'treatment', record.id, `${record.client.hn} ${record.treatmentDate.toISOString().slice(0, 10)}`, changes);
  finalizeOrthoCase(req, record, orthoCaseAction, priorOrthoDentId, priorOrthoDentName);
  return res.json(serialize(record, req.user!.role));
});

/**
 * DELETE /api/treatments/:id — manager only; soft delete (archive).
 */
router.delete(
  '/:id',
  requireRole(Role.ADMIN, Role.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const existing = await prisma.treatmentRecord.findFirst({
      where: { id, deletedAt: null },
      include: { client: true },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Treatment record not found' });
    }
    await prisma.treatmentRecord.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    audit(req, 'delete', 'treatment', id, `${existing.client.hn} ${existing.treatmentDate.toISOString().slice(0, 10)}`);
    return res.status(204).send();
  },
);

/**
 * PATCH /api/treatments/:id/restore — SUPER_ADMIN only, un-archive a record.
 */
router.patch(
  '/:id/restore',
  requireRole(Role.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const existing = await prisma.treatmentRecord.findUnique({ where: { id } });
    if (!existing || existing.deletedAt === null) {
      return res.status(404).json({ message: 'Archived record not found' });
    }
    const record = await prisma.treatmentRecord.update({
      where: { id },
      data: { deletedAt: null },
      include: recordInclude,
    });
    audit(req, 'restore', 'treatment', record.id, `${record.client.hn} ${record.treatmentDate.toISOString().slice(0, 10)}`);
    return res.json(serialize(record, req.user!.role));
  },
);

export default router;
