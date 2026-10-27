import request from 'supertest';
import bcrypt from 'bcryptjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the prisma singleton before the app (and its routes) import it.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

import { app } from '../src/index';
import { signTotpPendingToken } from '../src/lib/jwt';

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.auditLog.create.mockResolvedValue({});
  });

  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('rejects login with missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('rejects invalid credentials', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns tokens on valid login', async () => {
    const passwordHash = await bcrypt.hash('s3cret-pass', 10);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      username: 'admin',
      role: 'SUPER_ADMIN',
      isActive: true,
      passwordHash,
      mustChangePassword: false,
      tokenVersion: 0,
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 's3cret-pass' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.username).toBe('admin');
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      action: 'login-success', actorId: 'u1', actorUsername: 'admin',
    }) }));
    expect(JSON.stringify(prismaMock.auditLog.create.mock.calls)).not.toContain('s3cret-pass');
    expect(JSON.stringify(prismaMock.auditLog.create.mock.calls)).not.toContain(res.body.accessToken);
  });

  it('trims leading/trailing whitespace from the username before lookup', async () => {
    const passwordHash = await bcrypt.hash('s3cret-pass', 10);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      username: 'admin',
      role: 'SUPER_ADMIN',
      isActive: true,
      passwordHash,
      mustChangePassword: false,
      tokenVersion: 0,
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: '  admin  ', password: 's3cret-pass' });
    expect(res.status).toBe(200);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { username: 'admin' } });
  });

  it('rejects a username that is only whitespace', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: '   ', password: 'whatever' });
    expect(res.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a refresh token whose version is stale', async () => {
    // Log in at version 0, then the user's version moves to 1.
    const passwordHash = await bcrypt.hash('s3cret-pass', 10);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      username: 'admin',
      role: 'SUPER_ADMIN',
      isActive: true,
      passwordHash,
      mustChangePassword: false,
      tokenVersion: 0,
    });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 's3cret-pass' });
    const refreshToken = login.body.refreshToken as string;

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      username: 'admin',
      role: 'SUPER_ADMIN',
      isActive: true,
      tokenVersion: 1, // revoked since the token was issued
    });
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid TOTP login code with a code field', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      isActive: true,
      totpSecret: null,
      totpBackupCodes: [],
    });
    const pendingToken = signTotpPendingToken('u1');
    const res = await request(app)
      .post('/api/auth/totp/verify-login')
      .send({ pendingToken, code: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOTP_LOGIN_CODE_INVALID');
  });
});
