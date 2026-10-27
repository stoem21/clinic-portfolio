import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import {
  isTotpFeatureEnabled,
  generateSecret,
  totpUri,
  generateQrDataUrl,
  generateBackupCodes,
  verifyTotpCode,
  matchBackupCode,
} from '../lib/totp';

const router = Router();
router.use(authenticate);

const FEATURE_DISABLED = {
  code: 'TOTP_FEATURE_DISABLED',
  message: '2FA ถูกปิดใช้งานโดยผู้ดูแลระบบ (TOTP_ENABLED=false)',
};

/**
 * GET /api/auth/totp/status
 * Returns whether the feature is enabled and whether the caller is enrolled.
 */
router.get('/status', async (req: Request, res: Response) => {
  const featureEnabled = isTotpFeatureEnabled();
  if (!featureEnabled) return res.json({ featureEnabled, enrolled: false, backupCodesRemaining: 0 });

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ message: 'User not found' });

  return res.json({
    featureEnabled,
    enrolled: user.totpEnabled,
    backupCodesRemaining: user.totpEnabled ? user.totpBackupCodes.length : 0,
  });
});

/**
 * POST /api/auth/totp/setup
 * Generates a new TOTP secret + backup codes, stores them on the user
 * (totpEnabled stays false until /confirm). Returns the QR data URL and
 * the plaintext backup codes — these are shown once and never returned again.
 */
router.post('/setup', async (req: Request, res: Response) => {
  if (!isTotpFeatureEnabled()) return res.status(503).json(FEATURE_DISABLED);

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const secret = generateSecret();
  const { plain, hashed } = generateBackupCodes();
  const uri = totpUri(user.username, secret);
  const qrDataUrl = await generateQrDataUrl(uri);

  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: secret, totpEnabled: false, totpBackupCodes: hashed },
  });

  return res.json({ qrDataUrl, backupCodes: plain, secret });
});

/**
 * POST /api/auth/totp/confirm
 * Verifies the first code the user enters after scanning, enabling TOTP.
 * Body: { code }
 */
router.post('/confirm', async (req: Request, res: Response) => {
  if (!isTotpFeatureEnabled()) return res.status(503).json(FEATURE_DISABLED);

  const { code } = req.body ?? {};
  if (!code) return res.status(400).json({ message: 'code is required' });

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (!user.totpSecret) return res.status(400).json({ message: 'Setup not started — call /setup first' });

  if (!verifyTotpCode(user.totpSecret, String(code))) {
    return res.status(400).json({ code: 'TOTP_SETUP_CODE_INVALID', message: 'รหัสไม่ถูกต้อง — ลองอีกครั้ง' });
  }

  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  return res.json({ code: 'TOTP_ENABLED_SUCCESS', message: 'เปิดใช้งาน 2FA สำเร็จ' });
});

/**
 * DELETE /api/auth/totp/disable
 * Disables TOTP for the caller (requires currentPassword) or for another
 * user when SUPER_ADMIN passes { userId }.
 */
router.delete('/disable', async (req: Request, res: Response) => {
  if (!isTotpFeatureEnabled()) return res.status(503).json(FEATURE_DISABLED);

  const caller = req.user!;
  const targetId: string | undefined = req.body?.userId;
  const isSuperAdmin = caller.role === Role.SUPER_ADMIN;

  // SUPER_ADMIN resetting another user — no password required.
  if (targetId && targetId !== caller.id) {
    if (!isSuperAdmin) return res.status(403).json({ code: 'TOTP_RESET_FORBIDDEN', message: 'ไม่มีสิทธิ์' });
    await prisma.user.update({
      where: { id: targetId },
      data: { totpEnabled: false, totpSecret: null, totpBackupCodes: [] },
    });
    return res.json({ code: 'TOTP_RESET_SUCCESS', message: 'รีเซ็ต 2FA สำเร็จ' });
  }

  // Disabling own TOTP — require password confirmation.
  const { currentPassword } = req.body ?? {};
  if (!currentPassword) return res.status(400).json({ message: 'currentPassword is required' });

  const user = await prisma.user.findUnique({ where: { id: caller.id } });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ code: 'PASSWORD_INVALID', message: 'รหัสผ่านไม่ถูกต้อง' });

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null, totpBackupCodes: [] },
  });
  return res.json({ code: 'TOTP_DISABLED_SUCCESS', message: 'ปิดใช้งาน 2FA สำเร็จ' });
});

export default router;
