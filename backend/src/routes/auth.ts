import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middlewares/authenticate';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signTotpPendingToken,
  verifyTotpPendingToken,
} from '../lib/jwt';
import { isTotpFeatureEnabled, verifyTotpCode, matchBackupCode } from '../lib/totp';

import { isDemoAutoLoginEnabled } from '../lib/demoMode';

const router = Router();

// Only the explicitly enabled, initialized fictional-data demo can issue this session.
router.post('/demo-login', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDemoAutoLoginEnabled()) return res.status(404).json({ message: 'Not found' });
  const marker = await prisma.auditLog.findUnique({ where: { id: 'portfolio-demo-initialized-v1' } });
  if (!marker) return res.status(503).json({ message: 'Demo is not initialized' });
  const user = await prisma.user.findUnique({ where: { username: process.env.DEMO_USERNAME || 'demo' } });
  if (!user || !user.isActive || user.role !== 'SUPER_ADMIN' || user.mustChangePassword) {
    return res.status(503).json({ message: 'Demo account is not ready' });
  }
  req.user = { id: user.id, username: user.username, role: user.role };
  return res.json({
    accessToken: signAccessToken(req.user),
    refreshToken: signRefreshToken({ ...req.user, tokenVersion: user.tokenVersion }),
    user: { ...req.user, mustChangePassword: false },
  });
});

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', async (req: Request, res: Response) => {
  const { username: rawUsername, password } = req.body ?? {};
  const username = typeof rawUsername === 'string' ? rawUsername.trim() : rawUsername;

  if (!username || !password) {
    return res.status(400).json({ message: 'username and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // If TOTP is enabled for this user, issue a short-lived pending token and
  // require a second factor before granting full access.
  if (isTotpFeatureEnabled() && user.totpEnabled) {
    return res.json({ totpRequired: true, pendingToken: signTotpPendingToken(user.id) });
  }

  req.user = { id: user.id, username: user.username, role: user.role };
  const payload = req.user;
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({
    ...payload,
    tokenVersion: user.tokenVersion,
  });

  return res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body ?? {};

  if (!refreshToken) {
    return res.status(400).json({ message: 'refreshToken is required' });
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    // Re-issue based on current DB state so a deactivated user can't refresh.
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    // Revoked if the token's version is behind the user's current version
    // (bumped on logout / password change / admin reset).
    if (payload.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ message: 'Refresh token has been revoked' });
    }

    const accessToken = signAccessToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });
    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
});

/**
 * POST /api/auth/logout (requires authenticate)
 * Bumps tokenVersion so the issued refresh token(s) can no longer be used.
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { tokenVersion: { increment: 1 } },
  });
  return res.status(200).json({ message: 'Logged out' });
});

/**
 * POST /api/auth/change-password  (requires authenticate)
 * Body: { currentPassword?, newPassword }
 */
router.post('/change-password', authenticate, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res
      .status(400)
      .json({ message: 'newPassword must be at least 8 characters' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // When the user is not forced to change, verify their current password.
  if (!user.mustChangePassword) {
    if (!currentPassword) {
      return res.status(400).json({ message: 'currentPassword is required' });
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  // Bump tokenVersion to revoke other sessions' refresh tokens, then hand the
  // caller fresh tokens so their own session stays valid.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      tokenVersion: { increment: 1 },
    },
  });

  const payload = {
    id: updated.id,
    username: updated.username,
    role: updated.role,
  };
  return res.status(200).json({
    message: 'Password updated',
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken({
      ...payload,
      tokenVersion: updated.tokenVersion,
    }),
  });
});

/**
 * POST /api/auth/totp/verify-login
 * Second step of login when TOTP is enrolled.
 * Body: { pendingToken, code }  — code can be a 6-digit TOTP or an 8-char backup code.
 */
router.post('/totp/verify-login', async (req: Request, res: Response) => {
  const { pendingToken, code } = req.body ?? {};
  if (!pendingToken || !code) {
    return res.status(400).json({ message: 'pendingToken and code are required' });
  }

  let userId: string;
  try {
    ({ id: userId } = verifyTotpPendingToken(pendingToken));
  } catch {
    return res.status(401).json({ message: 'Session expired — please log in again' });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const codeStr = String(code).trim();

  // Try TOTP code first.
  const validTotp = user.totpSecret ? verifyTotpCode(user.totpSecret, codeStr) : false;

  if (!validTotp) {
    // Fall back to backup codes.
    const idx = user.totpBackupCodes.length > 0
      ? await matchBackupCode(codeStr, user.totpBackupCodes)
      : -1;
    if (idx === -1) {
      return res.status(401).json({ code: 'TOTP_LOGIN_CODE_INVALID', message: 'รหัสยืนยันไม่ถูกต้อง' });
    }
    // Single-use: remove the consumed backup code.
    const remaining = [...user.totpBackupCodes];
    remaining.splice(idx, 1);
    await prisma.user.update({ where: { id: user.id }, data: { totpBackupCodes: remaining } });
  }

  req.user = { id: user.id, username: user.username, role: user.role };
  const payload = req.user;
  return res.json({
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken({ ...payload, tokenVersion: user.tokenVersion }),
    user: { id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword },
  });
});

/**
 * GET /api/auth/me  (requires authenticate)
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  return res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });
});

export default router;
