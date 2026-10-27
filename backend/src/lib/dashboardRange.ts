import { Request } from 'express';
import { Role } from '@prisma/client';
import { clinicToday } from './clinicDay';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export interface DashboardRange {
  isOwner: boolean;
  rangeFrom: Date;
  rangeTo: Date;
  scopeLabCost: boolean;
}

/**
 * Resolve the dashboard's selected period from the request, shared by the
 * main dashboard route and the per-dentist detail route so the two never
 * drift out of sync on what "the selected period" means per role.
 *
 * Only the owner (SUPER_ADMIN) may pick a custom period; USER/ADMIN are
 * locked to today's figures regardless of any from/to passed (enforced here
 * so the restriction can't be bypassed by calling the API directly).
 *
 * scopeLabCost is retained for older callers. The dentist report now uses
 * the end date for outstanding balances, independently of the start date.
 */
export function resolveDashboardRange(req: Request): DashboardRange {
  const now = new Date(clinicToday());
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = startOfMonth(now);

  const isOwner = req.user?.role === Role.SUPER_ADMIN;
  let rangeFrom = isOwner ? monthStart : todayStart;
  let rangeTo = todayEnd;
  if (isOwner) {
    if (typeof req.query.from === 'string' && req.query.from) {
      const f = new Date(req.query.from);
      if (!Number.isNaN(f.getTime())) rangeFrom = startOfDay(f);
    }
    if (typeof req.query.to === 'string' && req.query.to) {
      const t = new Date(req.query.to);
      if (!Number.isNaN(t.getTime())) rangeTo = endOfDay(t);
    }
  }
  const scopeLabCost = isOwner && req.query.scopeLabCost === 'true';

  return { isOwner, rangeFrom, rangeTo, scopeLabCost };
}
