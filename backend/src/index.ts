import { startDailyDemoScheduler } from './lib/dailyDemo';
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import authRouter from './routes/auth';
import totpRouter from './routes/totp';
import usersRouter from './routes/users';
import dentistsRouter from './routes/dentists';
import clientsRouter from './routes/clients';
import treatmentsRouter from './routes/treatments';
import auditRouter from './routes/audit';
import hnCounterRouter from './routes/hnCounter';
import dashboardRouter from './routes/dashboard';
import receiptsRouter from './routes/receipts';
import labWorkRouter from './routes/labWork';
import opsRouter from './routes/ops';
import backupsRouter, { runBackup } from './routes/backups';
import { startScheduler } from './lib/backupScheduler';
import { logger, httpLogger } from './lib/logger';
import { auditActivity } from './middlewares/auditActivity';
import './types/auth'; // load Express Request augmentation

const app = express();

// Behind cloudflared/Cloudflare the real client IP arrives in headers; trust the
// proxy so req.ip and the rate limiter use it (not the tunnel's localhost).
app.set('trust proxy', true);

// CSP disabled so the bundled SPA (module scripts / styles) loads; the rest of
// helmet's protections stay on.
app.use(helmet({ contentSecurityPolicy: false }));

// Same-origin by default (Express serves the built frontend + API on one
// origin). Set CORS_ORIGINS=a,b to allow specific cross-origin callers.
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  }),
);
app.use(express.json());

// Structured request logging (request id + authenticated actor).
app.use(httpLogger);
app.use(auditActivity);

// Prefer Cloudflare's real-client-IP header for rate-limit keys.
const clientKey = (req: Request): string => {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf;
  return ipKeyGenerator(req.ip ?? '');
};

// Strict limiter on auth (brute-force protection); looser one on the rest.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
  // We intentionally trust the proxy (cloudflared) and key off CF-Connecting-IP.
  validate: { trustProxy: false },
  message: { message: 'Too many attempts. Please try again later.' },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
  validate: { trustProxy: false },
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/refresh', authLimiter);
app.use('/api/auth/totp/verify-login', authLimiter);
app.use('/api/auth', authRouter);
app.use('/api/auth/totp', totpRouter);
app.use('/api/users', usersRouter);
app.use('/api/dentists', dentistsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/treatments', treatmentsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/hn-counter', hnCounterRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/receipts', receiptsRouter);
app.use('/api/lab-work', labWorkRouter);
app.use('/api/backups', backupsRouter);
app.use('/api/ops', opsRouter);

// API 404 (only for /api/* so it doesn't shadow the SPA fallback below).
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ message: 'Not found' });
});

// Serve the built frontend if present, with SPA history fallback. This avoids
// exposing the Vite dev server publicly — build once, serve from here.
const distDir = path.resolve(__dirname, '../../frontend/dist');
const opsDist = path.resolve(__dirname, '../../frontdesk/dist');
if (fs.existsSync(opsDist)) {
  app.use('/frontdesk', express.static(opsDist));
  app.use('/frontdesk', (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(opsDist, 'index.html'));
  });
}
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
  logger.info(`Serving frontend build from ${distDir}`);
}

// Global error handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({ message: 'Internal server error' });
});

// Don't bind a port or start the scheduler under test.
if (process.env.NODE_ENV !== 'test') {
  const PORT = Number(process.env.PORT) || 4000;
  app.listen(PORT, () => {
    logger.info(`Backend listening on http://localhost:${PORT}`);
  });
  if (process.env.DEMO_MODE !== 'true') startScheduler(runBackup);
  startDailyDemoScheduler();
}

export { app };
