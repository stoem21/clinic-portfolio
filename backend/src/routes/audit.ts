import { Router, Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import { writeAudit } from '../lib/audit';

const router = Router();

// Audit log is SUPER_ADMIN-only.
router.use(authenticate);

// This endpoint only accepts browser export/print intentions, never arbitrary
// audit actions or actors. Counts are client-reported, not proof of a saved file.
router.post('/export', async (req: Request, res: Response) => {
  const { entity, format, count, columns, entityId } = req.body ?? {};
  const allowed: Record<string, string> = {
    client: 'csv', treatment: 'csv', 'ortho-missed': 'csv',
    receipt: 'pdf', 'ops-appointment': 'print',
  };
  if (typeof entity !== 'string' || !Object.prototype.hasOwnProperty.call(allowed, entity) || allowed[entity] !== format
      || !Number.isSafeInteger(count) || count < 0 || count > 1000000
      || !Array.isArray(columns) || columns.length > 100
      || columns.some((c: unknown) => typeof c !== 'string' || !/^[a-zA-Z0-9_]{1,64}$/.test(c))) {
    return res.status(400).json({ message: 'Invalid export event' });
  }
  let id = '';
  if (entity === 'receipt') {
    if (typeof entityId !== 'string' || entityId.length > 100) {
      return res.status(400).json({ message: 'Receipt ID required' });
    }
    const receipt = await prisma.receipt.findUnique({ where: { id: entityId }, select: { id: true, issuedById: true } });
    if (!receipt || (req.user!.role !== Role.SUPER_ADMIN && receipt.issuedById !== req.user!.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    id = receipt.id;
  }
  await writeAudit(req, { action: format === 'print' ? 'print-requested' : 'export-requested',
    entity, entityId: id, context: { result: 'requested', source: 'browser', format, count, columns } });
  return res.status(204).send();
});
router.use(requireRole(Role.SUPER_ADMIN));

/**
 * GET /api/audit — paginated audit log with optional filters.
 * Query: entity, action, actor (username contains), hn (summary prefix),
 * from, to, page, limit.
 */
router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));

  const where: Prisma.AuditLogWhereInput = {};
  if (typeof req.query.entity === 'string' && req.query.entity) {
    where.entity = req.query.entity;
  }
  if (typeof req.query.action === 'string' && req.query.action) {
    where.action = req.query.action;
  }
  if (typeof req.query.actor === 'string' && req.query.actor.trim()) {
    where.actorUsername = { contains: req.query.actor.trim(), mode: 'insensitive' };
  }
  // HN search: client/treatment entries put the patient HN first in `summary`,
  // so a prefix match on summary finds all audit activity for that patient.
  if (typeof req.query.hn === 'string' && req.query.hn.trim()) {
    where.summary = { startsWith: req.query.hn.trim(), mode: 'insensitive' };
  }

  const dateFilter: Prisma.DateTimeFilter = {};
  if (typeof req.query.from === 'string' && req.query.from) {
    const from = new Date(req.query.from);
    if (!Number.isNaN(from.getTime())) dateFilter.gte = from;
  }
  if (typeof req.query.to === 'string' && req.query.to) {
    const to = new Date(req.query.to);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      dateFilter.lte = to;
    }
  }
  if (dateFilter.gte || dateFilter.lte) {
    where.createdAt = dateFilter;
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return res.json({
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  });
});

export default router;
