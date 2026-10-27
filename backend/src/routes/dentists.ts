import { Router, Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { audit, diffFields } from '../lib/audit';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';

const router = Router();

// All dentist routes require authentication; writes additionally require a manager role.
router.use(authenticate);
const requireManager = requireRole(Role.ADMIN, Role.SUPER_ADMIN);

interface DentistInput {
  name?: unknown;
  phoneNumber?: unknown;
  email?: unknown;
  lineId?: unknown;
  note?: unknown;
  licenseId?: unknown;
  isOrthoDent?: unknown;
}

function asOptionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

// Validates and normalizes the write payload. Returns the data or an error message.
function parseDentistBody(body: DentistInput):
  | { ok: true; data: {
      name: string;
      licenseId: string;
      phoneNumber: string | null;
      email: string | null;
      lineId: string | null;
      note: string | null;
      isOrthoDent: boolean;
    } }
  | { ok: false; message: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const licenseId = typeof body.licenseId === 'string' ? body.licenseId.trim() : '';

  if (!name) return { ok: false, message: 'name is required' };
  if (!licenseId) return { ok: false, message: 'licenseId is required' };

  return {
    ok: true,
    data: {
      name,
      licenseId,
      phoneNumber: asOptionalString(body.phoneNumber),
      email: asOptionalString(body.email),
      lineId: asOptionalString(body.lineId),
      note: asOptionalString(body.note),
      isOrthoDent: Boolean(body.isOrthoDent),
    },
  };
}

/**
 * GET /api/dentists?isOrthoDent=true — list all (active + inactive).
 */
router.get('/', async (req: Request, res: Response) => {
  const deleted = req.query.deleted === 'true'; // trash view — SUPER_ADMIN only
  if (deleted && req.user?.role !== Role.SUPER_ADMIN) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const where: Prisma.DentistWhereInput = {
    deletedAt: deleted ? { not: null } : null,
  };
  if (req.query.isOrthoDent === 'true') where.isOrthoDent = true;
  if (req.query.isActive === 'true') where.isActive = true;

  const dentists = await prisma.dentist.findMany({
    where,
    // Active dentists first, then alphabetically by name.
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  return res.json(dentists);
});

/**
 * GET /api/dentists/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  const dentist = await prisma.dentist.findFirst({
    where: { id: String(req.params.id), deletedAt: null },
  });
  if (!dentist) {
    return res.status(404).json({ message: 'Dentist not found' });
  }
  return res.json(dentist);
});

/**
 * POST /api/dentists — create.
 */
router.post('/', requireManager, async (req: Request, res: Response) => {
  const parsed = parseDentistBody(req.body ?? {});
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.message });
  }

  const existing = await prisma.dentist.findUnique({
    where: { licenseId: parsed.data.licenseId },
  });
  if (existing) {
    return res.status(409).json({ message: 'licenseId already exists' });
  }

  const dentist = await prisma.dentist.create({ data: parsed.data });
  audit(req, 'create', 'dentist', dentist.id, `${dentist.name} (${dentist.licenseId})`);
  return res.status(201).json(dentist);
});

/**
 * PUT /api/dentists/:id — full update.
 */
router.put('/:id', requireManager, async (req: Request, res: Response) => {
  const parsed = parseDentistBody(req.body ?? {});
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.message });
  }

  const dentist = await prisma.dentist.findUnique({ where: { id: String(req.params.id) } });
  if (!dentist) {
    return res.status(404).json({ message: 'Dentist not found' });
  }

  // licenseId must stay unique across other dentists.
  const conflict = await prisma.dentist.findFirst({
    where: { licenseId: parsed.data.licenseId, NOT: { id: dentist.id } },
  });
  if (conflict) {
    return res.status(409).json({ message: 'licenseId already exists' });
  }

  const updated = await prisma.dentist.update({
    where: { id: dentist.id },
    data: parsed.data,
  });
  const changes = diffFields(dentist, updated, [
    'name', 'phoneNumber', 'email', 'lineId', 'note', 'licenseId', 'isOrthoDent',
  ]);
  audit(req, 'update', 'dentist', updated.id, `${updated.name} (${updated.licenseId})`, changes);
  return res.json(updated);
});

/**
 * PATCH /api/dentists/:id/toggle-active
 */
router.patch('/:id/toggle-active', requireManager, async (req: Request, res: Response) => {
  const dentist = await prisma.dentist.findUnique({ where: { id: String(req.params.id) } });
  if (!dentist) {
    return res.status(404).json({ message: 'Dentist not found' });
  }

  const updated = await prisma.dentist.update({
    where: { id: dentist.id },
    data: { isActive: !dentist.isActive },
  });
  audit(req, updated.isActive ? 'activate' : 'deactivate', 'dentist', updated.id, `${updated.name} (${updated.licenseId})`);
  return res.json(updated);
});

/**
 * DELETE /api/dentists/:id — blocked if treatment records exist.
 */
router.delete('/:id', requireManager, async (req: Request, res: Response) => {
  const dentist = await prisma.dentist.findFirst({
    where: { id: String(req.params.id), deletedAt: null },
  });
  if (!dentist) {
    return res.status(404).json({ message: 'Dentist not found' });
  }

  const [treatmentCount, labWorkCount] = await Promise.all([
    prisma.treatmentRecord.count({
      where: { dentistId: dentist.id, deletedAt: null },
    }),
    // A dentist can be referenced by a LabWork purely as the delivered party,
    // never having owned a treatment record of their own (treatmentCount === 0)
    // — check both FKs so that case doesn't hit an unhandled FK violation.
    prisma.labWork.count({
      where: {
        OR: [{ placementDentistId: dentist.id }, { deliveredDentistId: dentist.id }],
      },
    }),
  ]);
  if (treatmentCount > 0 || labWorkCount > 0) {
    return res.status(409).json({
      message: 'Cannot delete a dentist with treatment records. Deactivate instead.',
    });
  }

  await prisma.dentist.update({
    where: { id: dentist.id },
    data: { deletedAt: new Date() },
  });
  audit(req, 'delete', 'dentist', dentist.id, `${dentist.name} (${dentist.licenseId})`);
  return res.status(204).send();
});

/**
 * PATCH /api/dentists/:id/restore — SUPER_ADMIN only, un-archive a dentist.
 */
router.patch('/:id/restore', requireRole(Role.SUPER_ADMIN), async (req: Request, res: Response) => {
  const dentist = await prisma.dentist.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!dentist || dentist.deletedAt === null) {
    return res.status(404).json({ message: 'Archived dentist not found' });
  }
  const restored = await prisma.dentist.update({
    where: { id: dentist.id },
    data: { deletedAt: null },
  });
  audit(req, 'restore', 'dentist', restored.id, `${restored.name} (${restored.licenseId})`);
  return res.json(restored);
});

export default router;
