import { Router } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { auditContext } from '../lib/audit';
import { currentHnYear, hnState, lockHn, formatHn } from '../lib/generateHn';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';

const router = Router();
router.use(authenticate, requireRole(Role.SUPER_ADMIN));
router.get('/', async (_req, res) => {
  const year = currentHnYear();
  const state = await prisma.$transaction(async tx => {
    await lockHn(tx, year);
    return hnState(tx, year);
  });
  res.json(state);
});
router.put('/', async (req, res) => {
  const { year, count, expectedCount, expectedVersion, reason } = req.body ?? {};
  if (year !== currentHnYear() || !Number.isInteger(count) || count < 0 || count > 2147483646
      || !Number.isInteger(expectedCount) || !Number.isInteger(expectedVersion)
      || typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
    return res.status(400).json({ message: 'กรุณาระบุลำดับ HN ปีปัจจุบันและเหตุผลให้ถูกต้อง' });
  }
  const result = await prisma.$transaction(async tx => {
    await lockHn(tx, year);
    const state = await hnState(tx, year);
    if (expectedCount !== state.count || expectedVersion !== state.version) return { status: 409, message: 'ข้อมูล HN เปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนปรับ' };
    if (count < state.minimum) return { status: 400, message: `ลำดับต้องไม่น้อยกว่า ${state.minimum} (HN ${state.highestHn})` };
    if (count === state.count) return { status: 200, state };
    const counter = await tx.hnCounter.upsert({ where: { year },
      update: { count, version: { increment: 1 } }, create: { year, count, version: 1 } });
    await tx.auditLog.create({ data: {
      actorId: req.user!.id, actorUsername: req.user!.username,
      action: 'update', entity: 'hn-counter', entityId: String(year), summary: reason.trim(),
      changes: [{ field: 'count', before: state.count, after: count }],
      context: { ...auditContext(req), result: 'success', year, minimum: state.minimum,
        previousVersion: state.version, version: counter.version, nextHn: formatHn(year, count + 1) },
    } });
    return { status: 200, state: { ...state, count, version: counter.version, nextHn: formatHn(year, count + 1) } };
  });
  return res.status(result.status).json(result.state ?? { message: result.message });
});
export default router;
