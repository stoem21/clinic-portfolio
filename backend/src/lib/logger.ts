import pino from 'pino';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';

const env = process.env.NODE_ENV;
const isProd = env === 'production';
const isTest = env === 'test';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  // Pretty-print only in development. Production emits raw JSON for log
  // shippers; tests skip the transport worker entirely.
  transport:
    isProd || isTest
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});

export const httpLogger = pinoHttp({
  logger,
  // Stable request id (reuses an upstream x-request-id when present).
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id = (typeof existing === 'string' && existing) || randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  // Attach the authenticated actor (set by the auth middleware) to each log.
  customProps: (req) => {
    const user = (req as { user?: { id: string; username: string } }).user;
    return user ? { actorId: user.id, actor: user.username } : {};
  },
  // Quieter, useful request/response serialization.
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
