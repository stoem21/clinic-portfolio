import { Request, Response, NextFunction } from 'express';
import { AuditEvent, writeAudit } from '../lib/audit';
import { logger } from '../lib/logger';

/** Observe completed API responses without retaining bodies, tokens or clinical data. */
export function auditActivity(req: Request, res: Response, next: NextFunction) {
  const path = req.path;
  let subjectId = '';
  let hn = '';
  let count: number | undefined;
  let pending = false;
  const json = res.json;
  res.json = function (body) {
    if (path === '/api/auth/login') pending = body?.totpRequired === true;
    // Only project IDs/counts from clinical reads, never copy the response body.
    if (req.method === 'GET' && /^\/api\/(clients|treatments)(\/|$)/.test(path)) {
      subjectId = typeof body?.id === 'string' ? body.id : '';
      hn = typeof body?.hn === 'string' ? body.hn
        : typeof body?.client?.hn === 'string' ? body.client.hn : '';
      const rows = Array.isArray(body) ? body : body?.data;
      if (Array.isArray(rows)) count = rows.length;
    }
    return json.call(this, body);
  };
  res.once('finish', () => {
    const status = res.statusCode;
    const ok = status >= 200 && status < 300;
    let event: AuditEvent | undefined;
    if (req.method === 'POST' && ['/api/auth/login', '/api/auth/totp/verify-login'].includes(path)) {
      event = { action: ok ? (pending ? 'login-challenge' : 'login-success') : 'login-failed',
        entity: 'session', entityId: req.user?.id ?? '',
        context: { attemptedUsername: path === '/api/auth/login' && typeof req.body?.username === 'string'
          ? req.body.username.trim().slice(0, 100) : null } };
    } else if (req.method === 'POST' && path === '/api/auth/logout') {
      event = { action: 'logout', entity: 'session', entityId: req.user?.id ?? '' };
    } else if (req.method === 'POST' && path === '/api/auth/change-password') {
      event = { action: 'change-password', entity: 'user', entityId: req.user?.id ?? '' };
    } else if (status === 401 || status === 403 || status === 429) {
      // Store route templates, not arbitrary URLs (which may contain secrets).
      event = { action: 'access-denied', entity: 'security', entityId: '',
        context: { route: typeof req.route?.path === 'string' ? `${req.baseUrl}${req.route.path}` : 'api' } };
    } else if (path.startsWith('/api/backups') && ['POST', 'PUT', 'DELETE'].includes(req.method) && !path.endsWith('/download')) {
      event = { action: req.method === 'POST' ? 'create' : req.method === 'DELETE' ? 'delete' : 'update',
        entity: 'backup', entityId: String(req.params.fileId ?? (path.endsWith('/schedule') ? 'schedule' : '')) };
    } else if (path.startsWith('/api/backups') && path.endsWith('/download') && !ok) {
      event = { action: 'download-failed', entity: 'backup', entityId: String(req.params.fileId ?? '') };
    } else if (ok && req.method === 'GET' && path === '/api/audit') {
      event = { action: 'view', entity: 'audit', entityId: '' };
    } else if (ok && req.method === 'GET' && /^\/api\/(clients|treatments)(\/|$)/.test(path) && (subjectId || count !== undefined)) {
      event = { action: subjectId ? 'view' : 'list',
        entity: path.startsWith('/api/clients') ? 'client' : 'treatment',
        entityId: subjectId || String(req.params.id ?? (typeof req.query.clientId === 'string' ? req.query.clientId.slice(0, 100) : '')),
        summary: hn || undefined,
        context: { count: count ?? null, scope: subjectId ? 'detail' : 'list',
          bulk: req.query.limit === 'all' || req.query.limit === '0',
          route: typeof req.route?.path === 'string' ? req.route.path : '' } };
    }
    if (event) {
      event.context = { ...event.context, statusCode: status, result: ok ? 'success' : 'failure' };
      void writeAudit(req, event).catch((err) => logger.error({ err }, 'activity audit failed'));
    }
  });
  next();
}
