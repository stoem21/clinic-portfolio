import { Router, Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { audit, diffFields } from '../lib/audit';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import { LAB_WORK_TYPES } from './treatments';
import { validLabCompany } from '../lib/labCompanies';
import { clinicToday, validDay } from '../lib/clinicDay';
import { canReverseLabPayment } from '../lib/labReport';

const router = Router();

router.use(authenticate);
// Same tier as general treatment-record editing (not SUPER_ADMIN-only like
// receipts) — routine follow-up work staff do as lab bills come in.
router.use(requireRole(Role.ADMIN, Role.SUPER_ADMIN));

const labWorkInclude = {
  treatmentRecord: {
    select: {
      id: true,
      treatmentDate: true,
      client: { select: { id: true, hn: true, nameTitle: true, firstName: true, lastName: true } },
    },
  },
  placementDentist: { select: { id: true, name: true } },
  deliveredDentist: { select: { id: true, name: true } },
} satisfies Prisma.LabWorkInclude;

type LabWorkWithRelations = Prisma.LabWorkGetPayload<{ include: typeof labWorkInclude }>;

// `cost` is a Prisma Decimal, which JSON-serializes as a string and silently
// breaks Number-only formatting on the frontend (same bug class fixed in
// receipts.ts) — explicitly convert here, and derive the two owed halves.
function serialize(lw: LabWorkWithRelations) {
  const cost = lw.cost === null ? null : Number(lw.cost);
  return {
    id: lw.id,
    type: lw.type,
    typeDescription: lw.typeDescription,
    companyId: lw.companyId,
    treatmentRecordId: lw.treatmentRecordId,
    treatmentDate: lw.treatmentRecord.treatmentDate,
    client: lw.treatmentRecord.client,
    placementDentistId: lw.placementDentistId,
    placementDentist: lw.placementDentist,
    deliveredDentistId: lw.deliveredDentistId,
    deliveredAssignedDate: lw.deliveredAssignedDate,
    deliveredDentist: lw.deliveredDentist,
    cost,
    placementHalf: cost === null ? null : cost / 2,
    deliveredHalf: cost === null || lw.deliveredDentistId === null ? null : cost / 2,
    placementPaid: lw.placementPaid,
    deliveredPaid: lw.deliveredPaid,
    placementPaidAt: lw.placementPaidAt,
    deliveredPaidAt: lw.deliveredPaidAt,
    placementReversible: lw.placementPaid && canReverseLabPayment(lw.placementPaidAt),
    deliveredReversible: lw.deliveredPaid && canReverseLabPayment(lw.deliveredPaidAt),
    createdAt: lw.createdAt,
    updatedAt: lw.updatedAt,
  };
}

/**
 * GET /api/lab-work — paginated, filterable list.
 */
router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));

  // Built as an explicit AND array (not sequential `where.OR = ...`
  // assignments) so the dentist-match OR and the fullyPaid OR below can't
  // clobber each other.
  const and: Prisma.LabWorkWhereInput[] = [{ treatmentRecord: { deletedAt: null } }];

  const dateFilter: Prisma.DateTimeFilter = {};
  if (typeof req.query.from === 'string' && req.query.from) {
    const from = new Date(req.query.from);
    if (!Number.isNaN(from.getTime())) dateFilter.gte = from;
  }
  if (typeof req.query.to === 'string' && req.query.to) {
    const to = new Date(req.query.to);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999); // inclusive of the whole day
      dateFilter.lte = to;
    }
  }
  if (dateFilter.gte || dateFilter.lte) {
    and.push({ treatmentRecord: { treatmentDate: dateFilter } });
  }

  if (typeof req.query.dentistId === 'string' && req.query.dentistId) {
    const dentistId = req.query.dentistId;
    and.push({ OR: [{ placementDentistId: dentistId }, { deliveredDentistId: dentistId }] });
  }

  if (typeof req.query.type === 'string' && LAB_WORK_TYPES.includes(req.query.type)) {
    and.push({ type: req.query.type });
  }

  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  if (status === 'missingCost') {
    and.push({ cost: null });
  } else if (status === 'missingDelivery') {
    and.push({ deliveredDentistId: null });
  } else if (status === 'fullyPaid') {
    and.push({ cost: { not: null } }, { placementPaid: true });
    and.push({ OR: [{ deliveredDentistId: null }, { deliveredPaid: true }] });
  }

  const where: Prisma.LabWorkWhereInput = { AND: and };

  const [data, total] = await Promise.all([
    prisma.labWork.findMany({
      where,
      include: labWorkInclude,
      orderBy: { treatmentRecord: { treatmentDate: 'desc' } },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.labWork.count({ where }),
  ]);

  return res.json({
    data: data.map(serialize),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  });
});

/**
 * PATCH /api/lab-work/:id — fill in the cost and/or the delivered dentist.
 */
router.patch('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = await prisma.labWork.findUnique({
    where: { id },
    include: { deliveredDentist: { select: { name: true } } },
  });
  if (!existing) {
    return res.status(404).json({ message: 'Lab work entry not found' });
  }

  const body: Record<string, unknown> = req.body ?? {};
  const data: Prisma.LabWorkUncheckedUpdateInput = {};
  const changesCost = Object.prototype.hasOwnProperty.call(body, 'cost') && Number(body.cost) !== (existing.cost === null ? null : Number(existing.cost));
  const changesDentist = Object.prototype.hasOwnProperty.call(body, 'deliveredDentistId') && body.deliveredDentistId !== existing.deliveredDentistId;
  const changesDate = Object.prototype.hasOwnProperty.call(body, 'deliveredAssignedDate') && body.deliveredAssignedDate !== existing.deliveredAssignedDate?.toISOString().slice(0, 10);
  if ((changesCost && (existing.placementPaid || existing.deliveredPaid)) || ((changesDentist || changesDate) && existing.deliveredPaid)) {
    return res.status(409).json({ message: 'Reverse the affected payment before changing cost, dentist, or assignment date.' });
  }

  if (Object.prototype.hasOwnProperty.call(body, 'companyId')) {
    if (!validLabCompany(body.companyId)) return res.status(400).json({ message: 'Please select a lab company' });
    data.companyId = body.companyId;
  }

  if (changesCost) {
    const cost = Number(body.cost);
    if (!Number.isFinite(cost) || cost < 0) {
      return res.status(400).json({ code: 'LAB_COST_MUST_NOT_BE_NEGATIVE', message: 'ค่าแล็บต้องไม่ติดลบ' });
    }
    data.cost = new Prisma.Decimal(cost);
    // The cost changed, so any existing "paid" mark no longer reflects the
    // current amount — reset both halves to unpaid rather than let them drift.
    data.placementPaid = false;
    data.placementPaidAt = null;
    data.deliveredPaid = false;
    data.deliveredPaidAt = null;
  }

  if (changesDentist) {
    const raw = body.deliveredDentistId;
    if (raw === null) {
      data.deliveredDentistId = null;
    } else if (typeof raw === 'string' && raw) {
      const dentist = await prisma.dentist.findUnique({ where: { id: raw } });
      if (!dentist || dentist.deletedAt !== null) {
        return res.status(400).json({ code: 'LAB_DELIVERED_DENTIST_NOT_FOUND', message: 'ไม่พบทันตแพทย์ผู้ใส่งาน' });
      }
      data.deliveredDentistId = raw;
    } else {
      return res.status(400).json({ message: 'deliveredDentistId must be a string or null' });
    }
    // Assigning, reassigning, or clearing the delivered dentist all invalidate
    // any prior paid mark — it must never silently carry over.
    data.deliveredPaid = false;
    data.deliveredPaidAt = null;
    data.deliveredAssignedDate = raw === null ? null : new Date(clinicToday());
  }

  if (Object.prototype.hasOwnProperty.call(body, 'deliveredAssignedDate')) {
    const day = body.deliveredAssignedDate;
    const dentist = changesDentist ? body.deliveredDentistId : existing.deliveredDentistId;
    if (!dentist || !validDay(day) || day > clinicToday()) return res.status(400).json({ message: 'A valid non-future delivery assignment date and dentist are required.' });
    data.deliveredAssignedDate = new Date(day);
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: 'No updatable fields provided' });
  }

  const updated = await prisma.labWork.update({ where: { id, updatedAt: existing.updatedAt }, data, include: labWorkInclude });

  const changes = diffFields(
    {
      cost: existing.cost === null ? null : Number(existing.cost),
      deliveredDentistId: existing.deliveredDentistId,
      companyId: existing.companyId,
      deliveredAssignedDate: existing.deliveredAssignedDate,
    },
    {
      cost: updated.cost === null ? null : Number(updated.cost),
      deliveredDentistId: updated.deliveredDentistId,
      companyId: updated.companyId,
      deliveredAssignedDate: updated.deliveredAssignedDate,
    },
    ['cost', 'deliveredDentistId', 'companyId', 'deliveredAssignedDate'],
    {
      deliveredDentistId: { before: existing.deliveredDentist?.name, after: updated.deliveredDentist?.name },
    },
  );
  audit(req, 'update', 'lab-work', id, `${updated.treatmentRecord.client.hn} ${updated.type}`, changes);

  return res.json(serialize(updated));
});

/**
 * PATCH /api/lab-work/:id/placement-paid — reversible toggle.
 */
router.patch('/:id/placement-paid', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = await prisma.labWork.findUnique({ where: { id }, include: { treatmentRecord: { select: { treatmentDate: true } } } });
  if (!existing) {
    return res.status(404).json({ message: 'Lab work entry not found' });
  }
  const next = !existing.placementPaid;
  if (next && existing.treatmentRecord.treatmentDate.toISOString().slice(0, 10) > clinicToday()) return res.status(400).json({ message: 'Payment cannot precede assignment' });
  if (!next && !canReverseLabPayment(existing.placementPaidAt)) return res.status(403).json({ message: 'ยกเลิกการจ่ายได้เฉพาะวันที่กดจ่าย (เวลาไทย)' });
  if (!next && req.body?.confirmReversal !== true) return res.status(409).json({ message: 'Explicit payment reversal confirmation is required.' });
  if (next && existing.cost === null) {
    return res.status(400).json({ code: 'LAB_COST_REQUIRED_FOR_PLACEMENT_PAID', message: 'ต้องระบุค่าแล็บก่อนจึงจะทำเครื่องหมายชำระแล้วได้' });
  }
  const updated = await prisma.labWork.update({
    where: { id, updatedAt: existing.updatedAt },
    data: { placementPaid: next, placementPaidAt: next ? new Date() : null },
    include: labWorkInclude,
  });
  audit(
    req,
    next ? 'mark-placement-paid' : 'unmark-placement-paid',
    'lab-work',
    id,
    `${updated.treatmentRecord.client.hn} ${updated.type}`,
    diffFields(existing, updated, ['placementPaid', 'placementPaidAt']),
  );
  return res.json(serialize(updated));
});

/**
 * PATCH /api/lab-work/:id/delivered-paid — reversible toggle.
 */
router.patch('/:id/delivered-paid', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = await prisma.labWork.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ message: 'Lab work entry not found' });
  }
  const next = !existing.deliveredPaid;
  if (next && (!existing.deliveredAssignedDate || existing.deliveredAssignedDate.toISOString().slice(0, 10) > clinicToday())) return res.status(400).json({ message: 'A valid delivery assignment date is required before payment' });
  if (!next && !canReverseLabPayment(existing.deliveredPaidAt)) return res.status(403).json({ message: 'ยกเลิกการจ่ายได้เฉพาะวันที่กดจ่าย (เวลาไทย)' });
  if (!next && req.body?.confirmReversal !== true) return res.status(409).json({ message: 'Explicit payment reversal confirmation is required.' });
  if (next && (existing.cost === null || existing.deliveredDentistId === null)) {
    return res.status(400).json({
      code: 'LAB_COST_AND_DENTIST_REQUIRED_FOR_DELIVERED_PAID',
      message: 'ต้องระบุค่าแล็บและทันตแพทย์ผู้ใส่งานก่อนจึงจะทำเครื่องหมายชำระแล้วได้',
    });
  }
  const updated = await prisma.labWork.update({
    where: { id, updatedAt: existing.updatedAt },
    data: { deliveredPaid: next, deliveredPaidAt: next ? new Date() : null },
    include: labWorkInclude,
  });
  audit(
    req,
    next ? 'mark-delivered-paid' : 'unmark-delivered-paid',
    'lab-work',
    id,
    `${updated.treatmentRecord.client.hn} ${updated.type}`,
    diffFields(existing, updated, ['deliveredPaid', 'deliveredPaidAt']),
  );
  return res.json(serialize(updated));
});

/**
 * POST /api/lab-work/pay-all — mark every eligible unpaid lab-cost half as
 * paid, system-wide (ignores whatever filters the calling page has active).
 * SUPER_ADMIN only — stricter than this router's default ADMIN+SUPER_ADMIN.
 * A half is only eligible once its cost is known, and (for the delivered
 * half) once a delivered dentist is assigned — anything missing either is
 * left untouched rather than silently marked paid.
 */
router.post('/pay-all', requireRole(Role.SUPER_ADMIN), async (req: Request, res: Response) => {
  const now = new Date();
  const [placement, delivered] = await Promise.all([
    prisma.labWork.updateMany({
      where: { treatmentRecord: { deletedAt: null, treatmentDate: { lte: new Date(`${clinicToday()}T23:59:59.999Z`) } }, cost: { not: null }, placementPaid: false },
      data: { placementPaid: true, placementPaidAt: now },
    }),
    prisma.labWork.updateMany({
      where: {
        treatmentRecord: { deletedAt: null },
        cost: { not: null },
        deliveredDentistId: { not: null },
        deliveredAssignedDate: { lte: new Date(clinicToday()) },
        deliveredPaid: false,
      },
      data: { deliveredPaid: true, deliveredPaidAt: now },
    }),
  ]);

  audit(
    req,
    'pay-all',
    'lab-work',
    'all',
    `ทำเครื่องหมายจ่ายแล้ว ${placement.count + delivered.count} รายการ (พิมพ์ ${placement.count}, ใส่ ${delivered.count})`,
  );

  return res.json({ placementCount: placement.count, deliveredCount: delivered.count });
});

export default router;
