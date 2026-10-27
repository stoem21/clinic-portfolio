import jwt from 'jsonwebtoken';
import { AuthPayload, RefreshPayload } from '../types/auth';

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set in the environment');
}

export function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): AuthPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
  // Reject pending tokens (issued during the TOTP challenge step).
  if (decoded.purpose) throw new Error('Not an access token');
  return decoded as unknown as AuthPayload;
}

export function signTotpPendingToken(userId: string): string {
  return jwt.sign({ id: userId, purpose: 'totp-pending' }, JWT_SECRET, { expiresIn: '5m' });
}

export function verifyTotpPendingToken(token: string): { id: string } {
  const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
  if (decoded.purpose !== 'totp-pending') throw new Error('Invalid token purpose');
  return { id: decoded.id as string };
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as RefreshPayload;
}
