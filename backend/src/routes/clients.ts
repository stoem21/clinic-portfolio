import { Router, Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { reserveHn, allocateHn, lockHn, currentHnYear, formatHn, hnState } from '../lib/generateHn';
import { audit, diffFields, auditContext } from '../lib/audit';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import { clinicToday, elapsedDays, validDay } from '../lib/clinicDay';
import { LAB_COMPANIES } from '../lib/labCompanies';

const router = Router();

router.use(authenticate);

// Minimal option data, available to clinical staff without granting user management.
router.get('/clinical-options', async (_req, res) => {
  const callers = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, username: true }, orderBy: { username: 'asc' } });
  return res.json({ callers, labCompanies: LAB_COMPANIES });
});

router.get('/ortho-follow-up', async (req, res) => {
  const min = req.query.minDays ?? '180';
  const max = req.query.maxDays ?? '360';
  if (typeof min !== 'string' || typeof max !== 'string' || !/^\d+$/.test(min) || !/^\d+$/.test(max) ||
      !Number.isSafeInteger(Number(min)) || !Number.isSafeInteger(Number(max)) || Number(min) > Number(max)) {
    return res.status(400).json({ message: 'Invalid day range' });
  }
  const clients = await prisma.client.findMany({
    where: { deletedAt: null, orthoDentId: { not: null } },
    select: { id: true, hn: true, nameTitle: true, firstName: true, lastName: true, phoneNumber: true,
      orthoDent: { select: { id: true, name: true } },
      treatments: { where: { deletedAt: null }, orderBy: { treatmentDate: 'desc' }, take: 1, select: { treatmentDate: true } },
      followUpCalls: { orderBy: { callDate: 'desc' }, take: 1, select: { callDate: true } },
    },
    orderBy: { hn: 'asc' },
  });
  const today = clinicToday();
  const data = clients.map(({ treatments, followUpCalls, ...client }) => {
    const lastTreatmentDate = treatments[0]?.treatmentDate ?? null;
    const lastContactDate = followUpCalls[0]?.callDate ?? null;
    return { ...client, lastTreatmentDate, lastContactDate, days: elapsedDays(lastTreatmentDate, lastContactDate, today) };
  }).filter(c => c.days !== null && c.days >= Number(min) && c.days <= Number(max));
  return res.json({ data });
});

router.get('/:id/follow-up-calls', async (req, res) => {
  const clientId = String(req.params.id);
  if (!await prisma.client.findFirst({ where: { id: clientId, deletedAt: null } })) return res.sendStatus(404);
  const data = await prisma.followUpCall.findMany({ where: { clientId }, include: { caller: { select: { id: true, username: true } } }, orderBy: [{ callDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }] });
  return res.json({ data });
});

router.post('/:id/follow-up-calls', async (req, res) => {
  const clientId = String(req.params.id);
  const { callDate, callerId } = req.body ?? {};
  if (!validDay(callDate) || callDate > clinicToday() || typeof callerId !== 'string' || !callerId) return res.status(400).json({ message: 'Valid call date and caller are required (no future calls)' });
  if (!await prisma.client.findFirst({ where: { id: clientId, deletedAt: null, orthoDentId: { not: null } } })) return res.sendStatus(404);
  const caller = await prisma.user.findFirst({ where: { id: callerId, isActive: true }, select: { id: true, username: true } });
  if (!caller) return res.status(400).json({ message: 'Caller must be an active user' });
  const call = await prisma.followUpCall.create({ data: { clientId, callerId, callerName: caller.username, callDate: new Date(callDate) } });
  audit(req, 'create', 'follow-up-call', call.id, `${clientId}: ${callDate} (${caller.username})`);
  return res.status(201).json(call);
});

// Always include a light orthoDent relation in responses.
const clientInclude = {
  orthoDent: { select: { id: true, name: true } },
} satisfies Prisma.ClientInclude;

const ADDRESS_FIELDS = [
  'addressSubDistrict',
  'addressDistrict',
  'addressProvince',
  'addressZipCode',
] as const;

interface ParsedClient {
  nameTitle: string;
  firstName: string;
  lastName: string;
  nationalId: string | null;
  phoneNumber: string;
  gender: string;
  birthday: Date;
  orthoDentId: string | null;
  addressSubDistrict: string | null;
  addressDistrict: string | null;
  addressProvince: string | null;
  addressZipCode: string | null;
  addressDetail: string | null;
  medCon: string | null;
  drugAllergy: string | null;
  drugEat: string | null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optStr(value: unknown): string | null {
  const s = str(value);
  return s === '' ? null : s;
}

// Validates and normalizes a client write payload (shared by POST and PUT).
async function parseClientBody(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: ParsedClient } | { ok: false; message: string }> {
  const nameTitle = str(body.nameTitle);
  const firstName = str(body.firstName);
  const lastName = str(body.lastName);
  const phoneNumber = str(body.phoneNumber);
  const gender = str(body.gender);
  const birthdayRaw = str(body.birthday);

  if (!nameTitle) return { ok: false, message: 'nameTitle is required' };
  if (!firstName) return { ok: false, message: 'firstName is required' };
  if (!lastName) return { ok: false, message: 'lastName is required' };
  if (!phoneNumber) return { ok: false, message: 'phoneNumber is required' };
  if (!gender) return { ok: false, message: 'gender is required' };
  if (!birthdayRaw) return { ok: false, message: 'birthday is required' };

  const birthday = new Date(birthdayRaw);
  if (Number.isNaN(birthday.getTime())) {
    return { ok: false, message: 'birthday is not a valid date' };
  }

  const nationalId = optStr(body.nationalId);
  if (nationalId !== null && !/^\d{13}$/.test(nationalId)) {
    return { ok: false, message: 'nationalId must be exactly 13 digits' };
  }

  // Address is all-or-nothing across the four fields.
  const addressValues = ADDRESS_FIELDS.map((f) => optStr(body[f]));
  const providedCount = addressValues.filter((v) => v !== null).length;
  if (providedCount > 0 && providedCount < ADDRESS_FIELDS.length) {
    return {
      ok: false,
      message: 'All four address fields are required together',
    };
  }

  const orthoDentId = optStr(body.orthoDentId);
  if (orthoDentId !== null) {
    const dentist = await prisma.dentist.findUnique({ where: { id: orthoDentId } });
    if (!dentist) {
      return { ok: false, message: 'orthoDentId does not reference a valid dentist' };
    }
  }

  return {
    ok: true,
    data: {
      nameTitle,
      firstName,
      lastName,
      nationalId,
      phoneNumber,
      gender,
      birthday,
      orthoDentId,
      addressSubDistrict: addressValues[0],
      addressDistrict: addressValues[1],
      addressProvince: addressValues[2],
      addressZipCode: addressValues[3],
      // Free-text house no./road/village — independent of the all-4 rule above.
      addressDetail: optStr(body.addressDetail),
      medCon: optStr(body.medCon),
      drugAllergy: optStr(body.drugAllergy),
      drugEat: optStr(body.drugEat),
    },
  };
}

/**
 * GET /api/clients/count — total client count (no filters).
 */
router.get('/count', async (_req: Request, res: Response) => {
  const count = await prisma.client.count({ where: { deletedAt: null } });
  return res.json({ count });
});

// Minimal fields returned when warning about possible duplicates.
const duplicateSelect = {
  id: true,
  hn: true,
  nameTitle: true,
  firstName: true,
  lastName: true,
  nationalId: true,
  birthday: true,
} satisfies Prisma.ClientSelect;

/**
 * GET /api/clients/check-duplicate — pre-save duplicate detection for the form.
 *   nationalId (13 digits) → exact match (hard block on the client)
 *   firstName + lastName   → same-name match (soft warning; user may save anyway)
 * Ignores soft-deleted clients and an optional excludeId (self, when editing).
 */
router.get('/check-duplicate', async (req: Request, res: Response) => {
  const nationalId = str(req.query.nationalId);
  const firstName = str(req.query.firstName);
  const lastName = str(req.query.lastName);
  const excludeId = str(req.query.excludeId);
  const notSelf = excludeId ? { id: { not: excludeId } } : {};

  const nationalIdMatch = /^\d{13}$/.test(nationalId)
    ? await prisma.client.findFirst({
        where: { nationalId, deletedAt: null, ...notSelf },
        select: duplicateSelect,
      })
    : null;

  const nameMatches =
    firstName && lastName
      ? await prisma.client.findMany({
          where: {
            firstName: { equals: firstName, mode: 'insensitive' },
            lastName: { equals: lastName, mode: 'insensitive' },
            deletedAt: null,
            ...notSelf,
          },
          select: duplicateSelect,
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : [];

  return res.json({ nationalIdMatch, nameMatches });
});

/**
 * GET /api/clients/ortho-missed?months=6 — ortho patients (orthoDentId set,
 * not soft-deleted) whose most recent non-deleted treatment visit is older
 * than the given number of months, or who have never had a visit at all.
 * Used to export a follow-up list for patients who dropped off mid-treatment.
 */
router.get('/ortho-missed', async (req: Request, res: Response) => {
  const months = Math.max(1, Number(req.query.months) || 6);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const clients = await prisma.client.findMany({
    where: { orthoDentId: { not: null }, deletedAt: null },
    select: {
      hn: true,
      nameTitle: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      treatments: {
        where: { deletedAt: null },
        orderBy: { treatmentDate: 'desc' },
        take: 1,
        select: { treatmentDate: true },
      },
    },
  });

  const data = clients
    .map((c) => ({
      hn: c.hn,
      fullName: `${c.nameTitle}${c.firstName} ${c.lastName}`,
      phoneNumber: c.phoneNumber,
      lastVisitDate: c.treatments[0]?.treatmentDate ?? null,
    }))
    .filter((c) => !c.lastVisitDate || c.lastVisitDate < cutoff)
    .sort((a, b) => (a.lastVisitDate?.getTime() ?? 0) - (b.lastVisitDate?.getTime() ?? 0));

  return res.json({ data });
});

// Columns the client list may be sorted by (whitelist → orderBy).
const CLIENT_SORTS: Record<string, (dir: 'asc' | 'desc') => Prisma.ClientOrderByWithRelationInput[]> = {
  hn: (d) => [{ hn: d }],
  name: (d) => [{ firstName: d }, { lastName: d }],
  phoneNumber: (d) => [{ phoneNumber: d }],
  nationalId: (d) => [{ nationalId: d }],
  gender: (d) => [{ gender: d }],
  birthday: (d) => [{ birthday: d }],
  createdAt: (d) => [{ createdAt: d }],
};

/**
 * GET /api/clients — paginated, searchable list.
 * Filters (all optional, combined with AND):
 *   q           — legacy free-text across hn/name/phone (used by other pages)
 *   hn          — match by HN (substring)
 *   hnFrom/hnTo — inclusive HN range (e.g. 690001..690010)
 *   name        — match by first or last name (legacy combined field)
 *   firstName   — match by first name
 *   lastName    — match by last name
 *   phoneNumber — match by phone number
 *   nationalId  — match by national id
 *   hasOrtho    — "true" → only clients with an ortho dentist assigned
 * Sorting:
 *   sortBy  — one of hn|name|phoneNumber|nationalId|gender|birthday (default createdAt)
 *   sortDir — asc|desc (default desc)
 */
router.get('/', async (req: Request, res: Response) => {
  const q = str(req.query.q);
  const hn = str(req.query.hn);
  const hnFrom = str(req.query.hnFrom);
  const hnTo = str(req.query.hnTo);
  const name = str(req.query.name);
  const firstName = str(req.query.firstName);
  const lastName = str(req.query.lastName);
  const phoneNumber = str(req.query.phoneNumber);
  const nationalId = str(req.query.nationalId);
  const hasOrtho = str(req.query.hasOrtho) === 'true';
  const deleted = str(req.query.deleted) === 'true'; // trash view — SUPER_ADMIN only
  if (deleted && req.user?.role !== Role.SUPER_ADMIN) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const sortDir: 'asc' | 'desc' = str(req.query.sortDir) === 'asc' ? 'asc' : 'desc';
  const sortKey = str(req.query.sortBy);
  const orderBy = (CLIENT_SORTS[sortKey] ?? CLIENT_SORTS.createdAt)(sortDir);
  const page = Math.max(1, Number(req.query.page) || 1);
  // `limit=all` (or 0) returns every matching row — used by CSV export.
  const limitRaw = str(req.query.limit);
  const noLimit = limitRaw === 'all' || limitRaw === '0';
  const limit = noLimit ? 0 : Math.max(1, Math.min(100, Number(limitRaw) || 10));

  // Each provided filter narrows the result set (AND).
  const conditions: Prisma.ClientWhereInput[] = [
    { deletedAt: deleted ? { not: null } : null },
  ];
  if (q) {
    conditions.push({
      OR: [
        { hn: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q, mode: 'insensitive' } },
      ],
    });
  }
  if (hn) {
    conditions.push({ hn: { contains: hn, mode: 'insensitive' } });
  }
  // HN range (inclusive). HNs are fixed-width numeric strings, so string
  // comparison orders them numerically.
  if (hnFrom) conditions.push({ hn: { gte: hnFrom } });
  if (hnTo) conditions.push({ hn: { lte: hnTo } });
  if (name) {
    conditions.push({
      OR: [
        { firstName: { contains: name, mode: 'insensitive' } },
        { lastName: { contains: name, mode: 'insensitive' } },
      ],
    });
  }
  if (firstName) {
    conditions.push({ firstName: { contains: firstName, mode: 'insensitive' } });
  }
  if (lastName) {
    conditions.push({ lastName: { contains: lastName, mode: 'insensitive' } });
  }
  if (phoneNumber) {
    conditions.push({ phoneNumber: { contains: phoneNumber } });
  }
  if (nationalId) {
    conditions.push({ nationalId: { contains: nationalId } });
  }
  if (hasOrtho) {
    conditions.push({ orthoDentId: { not: null } });
  }
  const where: Prisma.ClientWhereInput =
    conditions.length > 0 ? { AND: conditions } : {};

  const [data, total] = await Promise.all([
    prisma.client.findMany({
      where,
      include: clientInclude,
      orderBy,
      skip: noLimit ? undefined : (page - 1) * limit,
      take: noLimit ? undefined : limit,
    }),
    prisma.client.count({ where }),
  ]);

  return res.json({
    data,
    total,
    page: noLimit ? 1 : page,
    limit: noLimit ? total : limit,
    totalPages: noLimit ? 1 : Math.ceil(total / limit) || 1,
  });
});

/**
 * GET /api/clients/:id — single client with orthoDent.
 */
router.get('/:id', async (req: Request, res: Response) => {
  const client = await prisma.client.findFirst({
    where: { id: String(req.params.id), deletedAt: null },
    include: clientInclude,
  });
  if (!client) {
    return res.status(404).json({ message: 'Client not found' });
  }
  return res.json(client);
});

/**
 * POST /api/clients/reserve-hn — consume and return the next HN up front, so the
 * staff can write it on the paper form before submitting. The same HN is then
 * sent back on create. Cancelling a create leaves a gap in the sequence.
 */
router.post('/reserve-hn', async (_req: Request, res: Response) => {
  return res.json(await reserveHn());
});

/**
 * POST /api/clients/release-hn — roll the counter back when a reserved HN is
 * cancelled, but ONLY if it's still the newest one and unused. Under concurrency
 * (a newer HN was reserved since, or it's already a client) this is a no-op and
 * the gap simply remains — which keeps HNs collision-free.
 */
router.post('/release-hn', async (req: Request, res: Response) => {
  const hn = typeof req.body?.hn === 'string' ? req.body.hn.trim() : '';
  const m = hn.match(/^(\d{2})(\d+)$/);
  if (!m) return res.json({ released: false });

  const buddhistYear = currentHnYear();
  // Only this year's counter can be rolled back (a reservation that crossed the
  // year boundary is left as a gap).
  if (m[1] !== String(buddhistYear).slice(-2)) {
    return res.json({ released: false });
  }
  const count = Number(m[2]);

  const released = await prisma.$transaction(async (tx) => {
    await lockHn(tx, buddhistYear);
    const counter = await tx.hnCounter.findUnique({ where: { year: buddhistYear } });
    if (!counter || req.body?.version !== counter.version) return false;
    const existing = await tx.client.findUnique({ where: { hn } });
    if (existing) return false; // already used by a client
    // Atomic: decrements only if the counter is still exactly this number.
    const r = await tx.hnCounter.updateMany({
      where: { year: buddhistYear, count },
      data: { count: { decrement: 1 } },
    });
    return r.count > 0;
  });

  return res.json({ released });
});

/**
 * POST /api/clients — create. Uses a pre-reserved `hn` from the body if present
 * (so it matches what the user was shown), otherwise generates a fresh one.
 */
router.post('/', async (req: Request, res: Response) => {
  const parsed = await parseClientBody(req.body ?? {});
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.message });
  }

  // A 13-digit national ID must be unique across active clients.
  if (parsed.data.nationalId) {
    const dupe = await prisma.client.findFirst({
      where: { nationalId: parsed.data.nationalId, deletedAt: null },
      select: { hn: true },
    });
    if (dupe) {
      return res.status(409).json({
        code: 'DUPLICATE_NATIONAL_ID',
        message: `เลขบัตรประชาชนนี้มีอยู่แล้วในระบบ (HN ${dupe.hn})`,
        params: { hn: dupe.hn },
      });
    }
  }

  const reserved =
    typeof req.body?.hn === 'string' ? req.body.hn.trim() : '';

  try {
    const client = await prisma.$transaction(async tx => {
      const year = currentHnYear();
      await lockHn(tx, year);
      let hn = reserved;
      if (reserved) {
        const counter = await tx.hnCounter.findUnique({ where: { year } });
        if (!counter || req.body?.hnVersion !== counter.version
            || !/^\d{6,}$/.test(reserved) || !reserved.startsWith(String(year).slice(-2))
            || Number(reserved.slice(2)) < 1 || Number(reserved.slice(2)) > counter.count) {
          return null;
        }
      } else {
        hn = (await allocateHn(tx, year)).hn;
      }
      return tx.client.create({ data: { hn, ...parsed.data }, include: clientInclude });
    });
    if (!client) return res.status(409).json({ code: 'HN_RESERVATION_EXPIRED', message: 'HN ถูกปรับแล้ว กรุณาปิดและเปิดแบบฟอร์มใหม่เพื่อรับ HN ใหม่' });
    audit(req, 'create', 'client', client.id, `${client.hn} ${client.nameTitle}${client.firstName} ${client.lastName}`);
    return res.status(201).json(client);
  } catch (err) {
    // Unique-constraint clash on a stale/duplicate reserved HN.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res
        .status(409)
        .json({ message: 'HN already exists; please reopen the form to get a new one.' });
    }
    throw err;
  }
});

// Correct an assigned HN into a lower unused gap; patient IDs remain unchanged.
router.patch('/:id/hn', requireRole(Role.ADMIN, Role.SUPER_ADMIN), async (req, res) => {
  const { hn, expectedHn, reason } = req.body ?? {};
  if (typeof hn !== 'string' || typeof expectedHn !== 'string'
      || !/^\d{6,12}$/.test(hn) || !/^\d{6,12}$/.test(expectedHn)
      || hn.slice(0, 2) !== expectedHn.slice(0, 2)
      || Number(hn.slice(2)) < 1 || Number(hn.slice(2)) >= Number(expectedHn.slice(2))
      || Number(hn.slice(2)) > 2147483646
      || typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
    return res.status(400).json({ message: 'ระบุ HN ที่ต่ำกว่าในปีเดียวกันและเหตุผลให้ถูกต้อง' });
  }
  const currentYear = currentHnYear();
  const year = currentYear - ((currentYear % 100 - Number(hn.slice(0, 2)) + 100) % 100);
  if (formatHn(year, Number(hn.slice(2))) !== hn) {
    return res.status(400).json({ message: 'รูปแบบ HN ไม่ถูกต้อง' });
  }
  try {
    const result = await prisma.$transaction(async tx => {
      await lockHn(tx, year);
      const existing = await tx.client.findUnique({ where: { id: String(req.params.id) } });
      if (!existing || existing.deletedAt) return { status: 404, body: { message: 'Patient not found' } };
      if (existing.hn !== expectedHn) return { status: 409, body: { message: 'HN เปลี่ยนแล้ว กรุณาโหลดข้อมูลผู้ป่วยใหม่' } };
      // Archived patients still own their HNs.
      if (await tx.client.findUnique({ where: { hn } })) {
        return { status: 409, body: { message: 'HN นี้มีผู้ป่วยใช้อยู่แล้ว รวมถึงผู้ป่วยที่ลบแล้ว' } };
      }
      const state = await hnState(tx, year);
      const client = await tx.client.update({ where: { id: existing.id }, data: { hn }, include: clientInclude });
      // Invalidate outstanding reservations which might contain the target gap.
      // Keep allocation above the old counter/highest HN, so the old HN isn't immediately reused.
      await tx.hnCounter.upsert({ where: { year },
        update: { count: Math.max(state.count, state.minimum), version: { increment: 1 } },
        create: { year, count: Math.max(state.count, state.minimum), version: 1 },
      });
      await tx.auditLog.create({ data: {
        actorId: req.user!.id, actorUsername: req.user!.username,
        action: 'update', entity: 'client', entityId: existing.id,
        summary: reason.trim(), changes: [{ field: 'hn', before: existing.hn, after: hn }],
        context: { ...auditContext(req), result: 'success', correction: 'hn', year },
      } });
      return { status: 200, body: client };
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ message: 'HN นี้มีผู้ป่วยใช้อยู่แล้ว' });
    }
    throw err;
  }
});

/**
 * PUT /api/clients/:id — full update (HN is never changed).
 */
router.put('/:id', async (req: Request, res: Response) => {
  const existing = await prisma.client.findUnique({
    where: { id: String(req.params.id) },
    include: { orthoDent: { select: { name: true } } },
  });
  if (!existing) {
    return res.status(404).json({ message: 'Client not found' });
  }

  const parsed = await parseClientBody(req.body ?? {});
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.message });
  }

  // If the national ID is being changed, the new value must stay unique.
  if (parsed.data.nationalId && parsed.data.nationalId !== existing.nationalId) {
    const dupe = await prisma.client.findFirst({
      where: {
        nationalId: parsed.data.nationalId,
        deletedAt: null,
        id: { not: existing.id },
      },
      select: { hn: true },
    });
    if (dupe) {
      return res.status(409).json({
        code: 'DUPLICATE_NATIONAL_ID',
        message: `เลขบัตรประชาชนนี้มีอยู่แล้วในระบบ (HN ${dupe.hn})`,
        params: { hn: dupe.hn },
      });
    }
  }

  const client = await prisma.client.update({
    where: { id: existing.id },
    data: parsed.data,
    include: clientInclude,
  });
  const changes = diffFields(existing, client, [
    'nameTitle', 'firstName', 'lastName', 'nationalId', 'phoneNumber', 'gender',
    'birthday', 'orthoDentId', 'addressSubDistrict', 'addressDistrict',
    'addressProvince', 'addressZipCode', 'addressDetail', 'medCon', 'drugAllergy', 'drugEat',
  ], {
    orthoDentId: { before: existing.orthoDent?.name, after: client.orthoDent?.name },
  });
  audit(req, 'update', 'client', client.id, `${client.hn} ${client.nameTitle}${client.firstName} ${client.lastName}`, changes);
  return res.json(client);
});

/**
 * DELETE /api/clients/:id — manager only, soft delete (archive), blocked if
 * (non-deleted) treatment records exist.
 */
router.delete(
  '/:id',
  requireRole(Role.ADMIN, Role.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const client = await prisma.client.findFirst({
      where: { id: String(req.params.id), deletedAt: null },
    });
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const treatmentCount = await prisma.treatmentRecord.count({
      where: { clientId: client.id, deletedAt: null },
    });
    if (treatmentCount > 0) {
      return res.status(409).json({
        message: 'Cannot delete a client with treatment records.',
      });
    }

    await prisma.client.update({
      where: { id: client.id },
      data: { deletedAt: new Date() },
    });
    audit(req, 'delete', 'client', client.id, `${client.hn} ${client.nameTitle}${client.firstName} ${client.lastName}`);
    return res.status(204).send();
  },
);

/**
 * PATCH /api/clients/:id/restore — SUPER_ADMIN only, un-archive a soft-deleted client.
 */
router.patch(
  '/:id/restore',
  requireRole(Role.SUPER_ADMIN),
  async (req: Request, res: Response) => {
    const client = await prisma.client.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!client || client.deletedAt === null) {
      return res.status(404).json({ message: 'Archived client not found' });
    }
    const restored = await prisma.client.update({
      where: { id: client.id },
      data: { deletedAt: null },
      include: clientInclude,
    });
    audit(req, 'restore', 'client', restored.id, `${restored.hn} ${restored.nameTitle}${restored.firstName} ${restored.lastName}`);
    return res.json(restored);
  },
);

export default router;
