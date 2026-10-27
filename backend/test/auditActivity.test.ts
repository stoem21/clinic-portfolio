import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
const { db } = vi.hoisted(() => ({ db: {
  auditLog: { create: vi.fn() }, receipt: { findUnique: vi.fn() },
} }));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
import { auditActivity } from '../src/middlewares/auditActivity';
import auditRouter from '../src/routes/audit';
import { signAccessToken } from '../src/lib/jwt';

const actor = { id: 'u1', username: 'staff', role: Role.USER };
const token = signAccessToken(actor);
function app() {
  const app = express();
  app.use(express.json());
  app.use(auditActivity);
  app.use('/api/audit', auditRouter);
  app.get('/api/clients/c1', (req, res) => {
    req.user = actor;
    res.json({ id: 'c1', hn: '000123', firstName: 'PRIVATE_NAME', note: 'PRIVATE_MEDICAL_NOTE' });
  });
  app.get('/api/treatments', (req, res) => {
    req.user = actor;
    res.json({ data: [{ id: 'r1', note: 'PRIVATE_MEDICAL_NOTE' }], total: 51 });
  });
  app.get('/api/private', (req, res) => { req.user = actor; res.status(403).json({}); });
  app.post('/api/auth/login', (req, res) => {
    if (req.body.challenge) return res.json({ totpRequired: true, pendingToken: 'SECRET_PENDING' });
    if (req.body.valid) { req.user = actor; return res.json({ accessToken: 'SECRET_TOKEN' }); }
    return res.status(401).json({ message: 'Invalid credentials' });
  });
  app.post('/api/auth/logout', (req, res) => { req.user = actor; res.json({}); });
  app.post('/api/auth/change-password', (req, res) => { req.user = actor; res.json({ refreshToken: 'SECRET_TOKEN' }); });
  return app;
}
const entries = () => db.auditLog.create.mock.calls.map(([arg]) => arg.data);
beforeEach(() => { vi.clearAllMocks(); db.auditLog.create.mockResolvedValue({}); });

describe('activity auditing', () => {
  it('records actor, HN and ID without clinical content or query values', async () => {
    await request(app()).get('/api/clients/c1?token=SECRET_QUERY').set('User-Agent', 'Test browser');
    expect(entries()[0]).toMatchObject({ actorId: 'u1', action: 'view', entityId: 'c1', summary: '000123', context: { userAgent: 'Test browser', statusCode: 200 } });
    expect(JSON.stringify(entries())).not.toMatch(/PRIVATE_|SECRET_/);
  });
  it('records treatment list scope and returned count', async () => {
    await request(app()).get('/api/treatments?clientId=c1&limit=all');
    expect(entries()[0]).toMatchObject({ entity: 'treatment', entityId: 'c1', action: 'list', context: { count: 1, bulk: true } });
  });
  it('does not mislabel a TOTP challenge as successful login', async () => {
    await request(app()).post('/api/auth/login').send({ username: 'staff', challenge: true });
    expect(entries()[0]).toMatchObject({ action: 'login-challenge', actorId: null });
    expect(JSON.stringify(entries())).not.toContain('SECRET_PENDING');
  });
  it('distinguishes verified actors from attempted usernames and excludes secrets', async () => {
    await request(app()).post('/api/auth/login').send({ username: 'someone', password: 'SECRET_PASSWORD' });
    await request(app()).post('/api/auth/login').send({ username: 'staff', valid: true });
    expect(entries()[0]).toMatchObject({ actorId: null, action: 'login-failed', context: { attemptedUsername: 'someone', result: 'failure' } });
    expect(entries()[1]).toMatchObject({ actorId: 'u1', action: 'login-success' });
    expect(JSON.stringify(entries())).not.toMatch(/SECRET_/);
  });
  it('records logout and password changes without passwords/tokens', async () => {
    await request(app()).post('/api/auth/logout');
    await request(app()).post('/api/auth/change-password').send({ currentPassword: 'SECRET_OLD', newPassword: 'SECRET_NEW' });
    expect(entries().map(e => e.action)).toEqual(['logout', 'change-password']);
    expect(JSON.stringify(entries())).not.toMatch(/SECRET_/);
  });
  it('records access denials without query strings', async () => {
    await request(app()).get('/api/private?secret=SECRET_QUERY');
    expect(entries()[0]).toMatchObject({ action: 'access-denied', context: { result: 'failure', statusCode: 403 } });
    expect(JSON.stringify(entries())).not.toContain('SECRET_QUERY');
  });
});

describe('browser export intentions', () => {
  const body = { entity: 'client', format: 'csv', count: 5, columns: ['hn'] };
  it('requires authentication', async () => {
    expect((await request(app()).post('/api/audit/export').send(body)).status).toBe(401);
  });
  it('accepts bounded intentions and ignores forged actor/action/content', async () => {
    const res = await request(app()).post('/api/audit/export').set('Authorization', `Bearer ${token}`)
      .send({ ...body, actorId: 'admin', action: 'login-success', password: 'SECRET_PASSWORD' });
    expect(res.status).toBe(204);
    expect(entries()[0]).toMatchObject({ action: 'export-requested', actorId: 'u1', context: { source: 'browser', result: 'requested', count: 5 } });
    expect(JSON.stringify(entries())).not.toContain('SECRET_PASSWORD');
  });
  it.each([{ entity: 'user' }, { count: -1 }, { columns: ['Patient Name: Alice'] }])('rejects invalid event payloads', async (invalid) => {
    expect((await request(app()).post('/api/audit/export').set('Authorization', `Bearer ${token}`).send({ ...body, ...invalid })).status).toBe(400);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it('does not approve an export when audit persistence fails', async () => {
    db.auditLog.create.mockRejectedValue(new Error('DB unavailable'));
    expect((await request(app()).post('/api/audit/export').set('Authorization', `Bearer ${token}`).send(body)).status).toBe(500);
  });
  it.each([['other', 403], ['u1', 204]])('limits receipt export to issuer/super admin: %s', async (issuedById, status) => {
    db.receipt.findUnique.mockResolvedValue({ id: 'r1', issuedById });
    const res = await request(app()).post('/api/audit/export').set('Authorization', `Bearer ${token}`)
      .send({ entity: 'receipt', entityId: 'r1', format: 'pdf', count: 1, columns: [] });
    expect(res.status).toBe(status);
    expect(entries().some(e => e.action === 'export-requested')).toBe(status === 204);
  });
});
