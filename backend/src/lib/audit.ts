import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from './logger';

export interface FieldChange {
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

/** Reduce a value to a JSON-safe primitive for comparison and storage. */
function normalize(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v as string | number | boolean;
}

/**
 * Format an ID + its human-readable label as "id(label)" for audit diffs, so a
 * raw UUID isn't shown bare. Falls back to the id alone if no label is known
 * (e.g. a mock/edge case where the related row wasn't fetched), and to null
 * when the id itself is null (field was empty).
 */
export function idWithLabel(id: string | null, label: string | null | undefined): string | null {
  if (id === null) return null;
  return label ? `${id}(${label})` : id;
}

/**
 * Compute the per-field before/after diff between two records, limited to the
 * given fields. Used to record *what* an update changed (field: a -> b) in the
 * audit log. Unchanged fields are omitted.
 *
 * `labels` lets a caller enrich specific fields whose value is itself another
 * entity's ID (e.g. dentistId, clientId) with a human-readable name, stored as
 * "id(name)" instead of the bare ID — the diff itself still compares the raw
 * normalized value, so labels only affect what's stored for display, never
 * whether a change is detected.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: (keyof T & string)[],
  labels?: Partial<Record<keyof T & string, { before: string | null | undefined; after: string | null | undefined }>>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const b = normalize(before[field]);
    const a = normalize(after[field]);
    if (b !== a) {
      const l = labels?.[field];
      changes.push({
        field,
        before: l ? idWithLabel(b as string | null, l.before) : b,
        after: l ? idWithLabel(a as string | null, l.after) : a,
      });
    }
  }
  return changes;
}

/** Allowlisted request context. Never capture request bodies or query strings. */
export function auditContext(req: Request): Prisma.InputJsonObject {
  return {
    ip: (req.ip ?? req.socket?.remoteAddress ?? '').slice(0, 128),
    userAgent: (req.get('user-agent') ?? '').slice(0, 512),
    requestId: String(req.id ?? '').slice(0, 128),
    method: req.method,
  };
}

export interface AuditEvent {
  action: string;
  entity: string;
  entityId: string;
  summary?: string;
  changes?: FieldChange[];
  context?: Prisma.InputJsonObject;
  actor?: { id: string; username: string };
}

// Await this for downloads: if auditing fails, no file is released. Existing
// mutation callers remain best-effort to avoid reporting a committed edit as failed.
export async function writeAudit(req: Request, event: AuditEvent): Promise<void> {
  const actor = event.actor ?? req.user;
  await prisma.auditLog.create({ data: {
    actorId: actor?.id ?? null,
    actorUsername: actor?.username ?? 'anonymous',
    action: event.action,
    entity: event.entity,
    entityId: event.entityId,
    summary: event.summary ?? null,
    changes: event.changes?.length
      ? event.changes as unknown as Prisma.InputJsonValue : undefined,
    context: { ...auditContext(req), result: 'success', ...event.context },
  } });
}

export function audit(
  req: Request, action: string, entity: string, entityId: string,
  summary?: string, changes?: FieldChange[],
): void {
  void writeAudit(req, { action, entity, entityId, summary, changes })
    .catch((err) => logger.error({ err }, 'audit log failed'));
}
