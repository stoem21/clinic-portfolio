import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clinicToday } from '../src/lib/clinicDay';

const { db } = vi.hoisted(() => ({ db: {
  client: { findMany: vi.fn(), findFirst: vi.fn() },
  user: { findMany: vi.fn(), findFirst: vi.fn() },
  followUpCall: { create: vi.fn(), findMany: vi.fn() },
  auditLog: { create: vi.fn() },
} }));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
import { app } from '../src/index';
import { signAccessToken } from '../src/lib/jwt';
const auth = (role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = 'USER') => ({ Authorization: `Bearer ${signAccessToken({ id: 'u1', username: 'staff', role })}` });
const ago = (days: number) => new Date(Date.parse(clinicToday()) - days * 86400000);
const patient = (id: string, treatment: number | null, contact: number | null) => ({
  id, hn: id, nameTitle: '', firstName: 'Test', lastName: 'Patient', phoneNumber: '', orthoDent: { id: 'd1', name: 'Dentist' },
  treatments: treatment === null ? [] : [{ treatmentDate: ago(treatment) }],
  followUpCalls: contact === null ? [] : [{ callDate: ago(contact) }],
});
beforeEach(() => { vi.resetAllMocks(); db.auditLog.create.mockResolvedValue({}); });
describe('orthodontic follow-up API', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/clients/ortho-follow-up')).status).toBe(401);
    expect((await request(app).post('/api/clients/c1/follow-up-calls')).status).toBe(401);
  });
  it.each(['USER', 'ADMIN', 'SUPER_ADMIN'] as const)('allows clinical access for %s with inclusive boundaries', async role => {
    db.client.findMany.mockResolvedValue([
      patient('179', 179, null), patient('180', 180, null), patient('360', null, 360), patient('361', 361, null),
      patient('contact-newer', 240, 60), patient('treatment-newer', 60, 240), patient('no-history', null, null),
    ]);
    const res = await request(app).get('/api/clients/ortho-follow-up').set(auth(role));
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { id: string }) => p.id)).toEqual(['180', '360']);
    expect(db.client.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, orthoDentId: { not: null } });
    expect(db.client.findMany.mock.calls[0][0].select.followUpCalls).toEqual({ orderBy: { callDate: 'desc' }, take: 1, select: { callDate: true } });
  });
  it.each(['minDays=-1', 'minDays=1.5', 'minDays=361&maxDays=180', 'minDays=no', 'maxDays='])('rejects invalid range %s', async query => {
    expect((await request(app).get(`/api/clients/ortho-follow-up?${query}`).set(auth())).status).toBe(400);
    expect(db.client.findMany).not.toHaveBeenCalled();
  });
  it('appends calls, retains backdated history, and recalculates eligibility on reload', async () => {
    const calls: { id: string; clientId: string; callerId: string; callerName: string; callDate: Date; createdAt: Date }[] = [];
    db.client.findFirst.mockResolvedValue({ id: 'c1' });
    db.user.findFirst.mockResolvedValue({ id: 'u1', username: 'staff' });
    db.followUpCall.create.mockImplementation(({ data }) => {
      const call = { ...data, id: `call-${calls.length}`, createdAt: new Date() };
      calls.push(call); return Promise.resolve(call);
    });
    db.followUpCall.findMany.mockImplementation(() => Promise.resolve([...calls].sort((a, b) => +b.callDate - +a.callDate)));
    db.client.findMany.mockImplementation(() => Promise.resolve([{ ...patient('c1', 240, null), followUpCalls: [...calls].sort((a, b) => +b.callDate - +a.callDate).slice(0, 1) }]));
    expect((await request(app).get('/api/clients/ortho-follow-up').set(auth())).body.data).toHaveLength(1);
    for (const days of [60, 300]) {
      expect((await request(app).post('/api/clients/c1/follow-up-calls').set(auth()).send({ callDate: ago(days).toISOString().slice(0, 10), callerId: 'u1' })).status).toBe(201);
    }
    const history = await request(app).get('/api/clients/c1/follow-up-calls').set(auth());
    expect(history.body.data).toHaveLength(2);
    expect(history.body.data[0].callerName).toBe('staff');
    expect(history.body.data[0].callDate.slice(0, 10)).toBe(ago(60).toISOString().slice(0, 10));
    expect((await request(app).get('/api/clients/ortho-follow-up').set(auth())).body.data).toHaveLength(0);
    expect(db.auditLog.create.mock.calls.filter(([arg]) => arg.data.action === 'create' && arg.data.entity === 'follow-up-call')).toHaveLength(2);
    expect(db.auditLog.create.mock.calls.filter(([arg]) => arg.data.action === 'list')).toHaveLength(3);
  });
  it('rejects inactive callers and completed cases', async () => {
    db.client.findFirst.mockResolvedValue({ id: 'c1' });
    db.user.findFirst.mockResolvedValue(null);
    const body = { callDate: clinicToday(), callerId: 'inactive' };
    expect((await request(app).post('/api/clients/c1/follow-up-calls').set(auth()).send(body)).status).toBe(400);
    db.client.findFirst.mockResolvedValue(null);
    expect((await request(app).post('/api/clients/c1/follow-up-calls').set(auth()).send(body)).status).toBe(404);
    expect(db.followUpCall.create).not.toHaveBeenCalled();
  });
});
