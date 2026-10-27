import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import { AuthPayload } from '../types/auth';

const router = Router();

// Every route here requires an authenticated ADMIN or SUPER_ADMIN.
router.use(authenticate);
router.use(requireRole(Role.ADMIN, Role.SUPER_ADMIN));

// Shape returned to clients (never expose passwordHash or totpSecret).
const userSelect = {
  id: true,
  username: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  totpEnabled: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

// An ADMIN may only see/act on plain USER rows. SUPER_ADMIN sees everyone.
function canManage(caller: AuthPayload, targetRole: Role): boolean {
  if (caller.role === Role.SUPER_ADMIN) return true;
  if (caller.role === Role.ADMIN) return targetRole === Role.USER;
  return false;
}

/**
 * GET /api/users — list filtered by caller permissions.
 */
router.get('/', async (req: Request, res: Response) => {
  const caller = req.user!;
  const where =
    caller.role === Role.ADMIN ? { role: Role.USER } : undefined;

  const users = await prisma.user.findMany({
    where,
    select: userSelect,
    orderBy: { createdAt: 'asc' },
  });

  return res.json(users);
});

/**
 * POST /api/users — create a user with the default password.
 * Body: { username, role: 'ADMIN' | 'USER' }
 */
router.post('/', async (req: Request, res: Response) => {
  const caller = req.user!;
  const { username: rawUsername, role } = req.body ?? {};

  if (!rawUsername || typeof rawUsername !== 'string' || !rawUsername.trim()) {
    return res.status(400).json({ message: 'username is required' });
  }
  const username = rawUsername.trim();

  // SUPER_ADMIN may never be assigned through the API.
  if (role !== Role.ADMIN && role !== Role.USER) {
    return res.status(400).json({ message: 'role must be ADMIN or USER' });
  }

  // An ADMIN may only create USER accounts.
  if (caller.role === Role.ADMIN && role !== Role.USER) {
    return res.status(403).json({ message: 'Admins can only create USER accounts' });
  }

  const defaultPassword = process.env.DEFAULT_PASSWORD;
  if (!defaultPassword) {
    return res.status(500).json({ message: 'DEFAULT_PASSWORD is not configured' });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return res.status(409).json({ message: 'Username already exists' });
  }

  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  const user = await prisma.user.create({
    data: { username, role, passwordHash, mustChangePassword: true },
    select: userSelect,
  });

  audit(req, 'create', 'user', user.id, `${user.username} (${user.role})`);
  return res.status(201).json(user);
});

// Loads a target user and enforces visibility + (optional) self-action rules.
// Returns the user on success, or null after sending an error response.
async function loadManageableTarget(
  req: Request,
  res: Response,
  opts: { blockSelf?: boolean } = {},
) {
  const caller = req.user!;
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) } });

  if (!target || !canManage(caller, target.role)) {
    // 404 (not 403) so an Admin can't probe for hidden ADMIN/SUPER_ADMIN rows.
    res.status(404).json({ message: 'User not found' });
    return null;
  }

  if (opts.blockSelf && target.id === caller.id) {
    res.status(403).json({ message: 'You cannot perform this action on your own account' });
    return null;
  }

  return target;
}

/**
 * PATCH /api/users/:id/activate
 */
router.patch('/:id/activate', async (req: Request, res: Response) => {
  const target = await loadManageableTarget(req, res);
  if (!target) return;

  const user = await prisma.user.update({
    where: { id: target.id },
    data: { isActive: true },
    select: userSelect,
  });
  audit(req, 'activate', 'user', user.id, `${user.username} (${user.role})`);
  return res.json(user);
});

/**
 * PATCH /api/users/:id/deactivate — SUPER_ADMIN only; cannot deactivate self.
 */
router.patch('/:id/deactivate', requireRole(Role.SUPER_ADMIN), async (req: Request, res: Response) => {
  const target = await loadManageableTarget(req, res, { blockSelf: true });
  if (!target) return;

  const user = await prisma.user.update({
    where: { id: target.id },
    data: { isActive: false },
    select: userSelect,
  });
  audit(req, 'deactivate', 'user', user.id, `${user.username} (${user.role})`);
  return res.json(user);
});

/**
 * PATCH /api/users/:id/reset-password — back to default, force change.
 */
router.patch('/:id/reset-password', async (req: Request, res: Response) => {
  const target = await loadManageableTarget(req, res);
  if (!target) return;

  const defaultPassword = process.env.DEFAULT_PASSWORD;
  if (!defaultPassword) {
    return res.status(500).json({ message: 'DEFAULT_PASSWORD is not configured' });
  }

  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  const user = await prisma.user.update({
    where: { id: target.id },
    // Bump tokenVersion to revoke the target's existing refresh tokens.
    data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } },
    select: userSelect,
  });
  audit(req, 'reset-password', 'user', user.id, `${user.username} (${user.role})`);
  return res.json(user);
});

/**
 * DELETE /api/users/:id — SUPER_ADMIN only; hard delete, cannot delete self.
 */
router.delete('/:id', requireRole(Role.SUPER_ADMIN), async (req: Request, res: Response) => {
  const target = await loadManageableTarget(req, res, { blockSelf: true });
  if (!target) return;

  await prisma.user.delete({ where: { id: target.id } });
  audit(req, 'delete', 'user', target.id, `${target.username} (${target.role})`);
  return res.status(204).send();
});

export default router;
