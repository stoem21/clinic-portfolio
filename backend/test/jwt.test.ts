import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/lib/jwt';

describe('jwt', () => {
  const payload = { id: 'u1', username: 'admin', role: 'SUPER_ADMIN' as const };

  it('signs and verifies an access token round-trip', () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.id).toBe('u1');
    expect(decoded.username).toBe('admin');
    expect(decoded.role).toBe('SUPER_ADMIN');
  });

  it('carries tokenVersion in refresh tokens', () => {
    const token = signRefreshToken({ ...payload, tokenVersion: 3 });
    const decoded = verifyRefreshToken(token);
    expect(decoded.tokenVersion).toBe(3);
  });

  it('rejects an access token signed with the wrong secret (refresh secret)', () => {
    const refresh = signRefreshToken({ ...payload, tokenVersion: 0 });
    expect(() => verifyAccessToken(refresh)).toThrow();
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken(payload);
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });
});
