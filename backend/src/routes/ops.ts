import { auditContext } from '../lib/audit';
import express, { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middlewares/authenticate";
import { clinicToday } from "../lib/clinicDay";
import { LAB_COMPANIES, validLabCompany } from "../lib/labCompanies";
import {
  access,
  permissions,
  Permission,
  ensure,
  OpsError,
  text,
  day,
  minute,
  money,
  shifts,
  slotFits,
  scalingState,
  appointmentStatuses,
  callOutcomes,
} from "../lib/opsRules";
import { extractSlip } from "../lib/slipExtraction";

const router = Router();
type Tx = Prisma.TransactionClient;
const patientSelect = {
  id: true,
  hn: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  orthoDentId: true,
};
const appointmentInclude = {
  client: { select: patientSelect },
  dentist: { select: { id: true, name: true, isOrthoDent: true } },
  calls: { orderBy: { createdAt: "desc" as const } },
};
const serial = <T>(fn: (tx: Tx) => Promise<T>) =>
  prisma.$transaction(fn, { isolationLevel: "Serializable" });
const key = (req: Request) => text(req.body.requestKey, true, 100);
function range(req: Request) {
  const from = day(req.query.from || clinicToday()),
    to = day(req.query.to || from);
  ensure(
    from <= to && Date.parse(to) - Date.parse(from) <= 366 * 86400000,
    "เลือกช่วงวันที่ไม่เกิน 366 วัน",
  );
  return { from, to, where: { gte: new Date(from), lte: new Date(to) } };
}
async function log(
  tx: Tx,
  req: Request,
  action: string,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
  reason = "",
) {
  await tx.auditLog.create({
    data: {
      context: { ...auditContext(req), result: "success" },
      actorId: req.user!.id,
      actorUsername: req.user!.username,
      action,
      entity: `ops-${entity}`,
      entityId,
      summary: reason,
      changes: [
        {
          field: "record",
          before: JSON.stringify(before),
          after: JSON.stringify(after),
        },
      ],
    },
  });
}
router.use(authenticate);
router.use(async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  ensure(user?.isActive, "บัญชีไม่พร้อมใช้งาน", 401);
  ensure(!user.mustChangePassword, "กรุณาเปลี่ยนรหัสผ่านในระบบหลักก่อน", 403);
  req.user = { id: user.id, username: user.username, role: user.role };
  res.locals.permissions = access(
    user.role,
    await prisma.opsGrant.findMany({ where: { userId: user.id } }),
  );
  next();
});
function permit(p: Permission) {
  return (_req: Request, res: Response, next: NextFunction) => {
    ensure(res.locals.permissions.includes(p), "ไม่มีสิทธิ์ใช้งาน", 403);
    next();
  };
}
router.get("/me", (req, res) =>
  res.json({
    user: req.user,
    permissions: res.locals.permissions,
    today: clinicToday(),
  }),
);
router.get("/reference", async (_req, res) => {
  const canAppointments = res.locals.permissions.includes("appointments.view");
  ensure(
    canAppointments || res.locals.permissions.includes("finance.view"),
    "ไม่มีสิทธิ์ใช้งาน",
    403,
  );
  res.json({
    dentists: canAppointments
      ? await prisma.dentist.findMany({
          where: { deletedAt: null, isActive: true },
          select: { id: true, name: true, isOrthoDent: true },
        })
      : [],
    companies: LAB_COMPANIES,
  });
});
router.get("/patients", permit("appointments.view"), async (req, res) => {
  const q = text(req.query.q, true, 100);
  res.json(
    await prisma.client.findMany({
      where: {
        deletedAt: null,
        OR: ["hn", "firstName", "lastName", "phoneNumber"].map((f) => ({
          [f]: { contains: q, mode: "insensitive" },
        })),
      },
      select: patientSelect,
      take: 30,
    }),
  );
});
async function windows(tx: Tx, date: string) {
  return shifts(
    date,
    await tx.opsSchedule.findMany(),
    await tx.opsException.findMany({ where: { date: new Date(date) } }),
  );
}
async function validBooking(
  tx: Tx,
  dentistId: string,
  date: string,
  start: number,
) {
  const dentist = await tx.dentist.findFirst({
    where: { id: dentistId, deletedAt: null, isActive: true },
  });
  ensure(dentist, "ไม่พบทันตแพทย์");
  const duration = dentist.isOrthoDent ? 15 : 30;
  ensure(
    slotFits(
      start,
      duration,
      (await windows(tx, date)).filter((w) => w.dentistId === dentistId),
    ),
    "เวลานัดอยู่นอกตารางทำงาน กรุณาตรวจสอบตารางหมอ",
  );
  return duration;
}
async function affected(tx: Tx, from: string, to: string) {
  const rules = await tx.opsSchedule.findMany(),
    exceptions = await tx.opsException.findMany({
      where: { date: { gte: new Date(from), lte: new Date(to) } },
    });
  const rows = await tx.opsAppointment.findMany({
    where: {
      date: { gte: new Date(from), lte: new Date(to) },
      status: { in: ["scheduled", "arrived"] },
    },
    include: appointmentInclude,
  });
  return rows.filter(
    (a) =>
      !slotFits(
        a.minute,
        a.duration,
        shifts(a.date.toISOString().slice(0, 10), rules, exceptions).filter(
          (w) => w.dentistId === a.dentistId,
        ),
      ),
  );
}
router.get("/schedules", permit("appointments.view"), async (req, res) => {
  const r = range(req),
    rules = await prisma.opsSchedule.findMany(),
    exceptions = await prisma.opsException.findMany({
      where: { date: r.where },
    });
  const days = [];
  for (let d = Date.parse(r.from); d <= Date.parse(r.to); d += 86400000) {
    const date = new Date(d).toISOString().slice(0, 10);
    days.push({ date, shifts: shifts(date, rules, exceptions) });
  }
  res.json({
    rules,
    exceptions,
    days,
    affected: await affected(prisma, r.from, r.to),
  });
});
router.post("/schedules", permit("schedules.manage"), async (req, res) => {
  const b = req.body,
    dentistId = text(b.dentistId, true),
    startMinute = minute(b.startMinute),
    endMinute = minute(b.endMinute),
    from = day(b.from),
    to = b.to ? day(b.to) : null,
    intervalWeeks = b.intervalWeeks ?? 1;
  ensure(
    startMinute < endMinute &&
      (!to || to >= from) &&
      Number.isInteger(b.weekday) &&
      b.weekday >= 0 &&
      b.weekday <= 6 &&
      Number.isInteger(intervalWeeks) && intervalWeeks >= 1 && intervalWeeks <= 4 &&
      (intervalWeeks === 1 || new Date(from).getUTCDay() === b.weekday),
    "ตารางไม่ถูกต้อง",
  );
  const result = await serial(async (tx) => {
    const existing = await tx.opsSchedule.findUnique({
      where: { requestKey: key(req) },
    });
    if (existing) {
      ensure(existing.createdBy === req.user!.id, "คำขอซ้ำ", 409);
      return existing;
    }
    ensure(
      await tx.dentist.findFirst({
        where: { id: dentistId, isActive: true, deletedAt: null },
      }),
      "ไม่พบทันตแพทย์",
    );
    const saved = await tx.opsSchedule.create({
      data: {
        dentistId,
        startMinute,
        endMinute,
        from: new Date(from),
        to: to ? new Date(to) : null,
        weekday: b.weekday,
        intervalWeeks,
        createdBy: req.user!.id,
        requestKey: key(req),
      },
    });
    await log(tx, req, "create", "schedule", saved.id, null, saved);
    return saved;
  });
  res.json(result);
});
router.post("/exceptions", permit("schedules.manage"), async (req, res) => {
  const b = req.body,
    dentistId = text(b.dentistId, true),
    date = day(b.date),
    reason = text(b.reason, true),
    startMinute = minute(b.startMinute),
    endMinute = minute(b.endMinute);
  ensure(startMinute < endMinute, "เวลาเริ่มต้องก่อนเวลาสิ้นสุด");
  res.json(
    await serial(async (tx) => {
      const replacementId = text(b.replacementId) || null;
      for (const id of [dentistId, replacementId].filter(
        (x): x is string => !!x,
      ))
        ensure(
          await tx.dentist.findFirst({
            where: { id, isActive: true, deletedAt: null },
          }),
          "ไม่พบทันตแพทย์",
        );
      const old = await tx.opsException.findUnique({
        where: { dentistId_date: { dentistId, date: new Date(date) } },
      });
      ensure(
        (old?.version ?? 0) === b.version,
        "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่",
        409,
      );
      const data = {
        cancelled: b.cancelled === true,
        replacementId,
        startMinute,
        endMinute,
        reason,
        updatedBy: req.user!.id,
      };
      const saved = old
        ? await tx.opsException.update({
            where: { id: old.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.opsException.create({
            data: { ...data, dentistId, date: new Date(date) },
          });
      await log(tx, req, "update", "exception", saved.id, old, saved, reason);
      return { saved, affected: await affected(tx, date, date) };
    }),
  );
});
router.get("/appointments", permit("appointments.view"), async (req, res) => {
  const r = range(req),
    q = text(req.query.q),
    dentistId = text(req.query.dentistId);
  const rows = await prisma.opsAppointment.findMany({
    where: {
      date: r.where,
      ...(dentistId ? { dentistId } : {}),
      ...(q
        ? {
            OR: [
              { provisionalName: { contains: q, mode: "insensitive" } },
              { provisionalPhone: { contains: q } },
              {
                client: {
                  OR: ["hn", "firstName", "lastName", "phoneNumber"].map(
                    (f) => ({ [f]: { contains: q, mode: "insensitive" } }),
                  ),
                },
              },
            ],
          }
        : {}),
    },
    include: appointmentInclude,
    orderBy: [{ date: "asc" }, { minute: "asc" }],
  });
  const ids = rows.flatMap((a) =>
    a.client?.orthoDentId && a.clientId ? [a.clientId] : [],
  );
  const scaling = await prisma.treatmentRecord.findMany({
    where: {
      clientId: { in: ids },
      deletedAt: null,
      items: { some: { type: "scaling" } },
    },
    select: { clientId: true, treatmentDate: true },
    orderBy: { treatmentDate: "desc" },
  });
  const impacted = new Set(
    (await affected(prisma, r.from, r.to)).map((a) => a.id),
  );
  res.json(
    rows.map((a) => ({
      ...a,
      confirmation:
        a.calls.find((c) => c.revision === a.revision)?.outcome ?? "pending",
      affected: impacted.has(a.id),
      scaling: a.client?.orthoDentId
        ? scalingState(
            scaling.find((s) => s.clientId === a.clientId)?.treatmentDate ??
              null,
          )
        : null,
    })),
  );
});
router.post(
  "/appointments",
  permit("appointments.manage"),
  async (req, res) => {
    const b = req.body,
      date = day(b.date),
      start = minute(b.minute),
      dentistId = text(b.dentistId, true);
    res.json(
      await serial(async (tx) => {
        const old = await tx.opsAppointment.findUnique({
          where: { requestKey: key(req) },
        });
        if (old) {
          ensure(old.createdBy === req.user!.id, "คำขอซ้ำ", 409);
          return old;
        }
        const duration = await validBooking(tx, dentistId, date, start),
          clientId = text(b.clientId) || null;
        const client = clientId
          ? await tx.client.findFirst({
              where: { id: clientId, deletedAt: null },
            })
          : null;
        ensure(!clientId || client, "ไม่พบคนไข้");
        const saved = await tx.opsAppointment.create({
          data: {
            clientId,
            provisionalName: client
              ? `${client.firstName} ${client.lastName}`
              : text(b.name, true, 200),
            provisionalPhone: client?.phoneNumber || text(b.phone, true, 50),
            dentistId,
            date: new Date(date),
            minute: start,
            duration,
            notes: text(b.notes),
            requestKey: key(req),
            createdBy: req.user!.id,
            updatedBy: req.user!.id,
          },
        });
        await log(tx, req, "create", "appointment", saved.id, null, saved);
        return saved;
      }),
    );
  },
);
router.put(
  "/appointments/:id",
  permit("appointments.manage"),
  async (req, res) => {
    const b = req.body,
      reason = text(b.reason, true);
    res.json(
      await serial(async (tx) => {
        const old = await tx.opsAppointment.findUnique({
          where: { id: String(req.params.id) },
        });
        ensure(old, "ไม่พบนัด", 404);
        ensure(old.version === b.version, "นัดถูกแก้ไขแล้ว กรุณาโหลดใหม่", 409);
        const date = day(b.date),
          start = minute(b.minute),
          dentistId = text(b.dentistId, true),
          status = text(b.status, true);
        ensure(appointmentStatuses.includes(status), "สถานะไม่ถูกต้อง");
        const moved =
          old.date.toISOString().slice(0, 10) !== date ||
          old.minute !== start ||
          old.dentistId !== dentistId;
        const duration = moved
          ? await validBooking(tx, dentistId, date, start)
          : old.duration;
        const clientId =
          b.clientId === undefined ? old.clientId : text(b.clientId, true);
        ensure(
          !clientId ||
            (await tx.client.findFirst({
              where: { id: clientId, deletedAt: null },
            })),
          "ไม่พบคนไข้",
        );
        const saved = await tx.opsAppointment.update({
          where: { id: old.id },
          data: {
            date: new Date(date),
            minute: start,
            dentistId,
            duration,
            status,
            clientId,
            notes: text(b.notes),
            updatedBy: req.user!.id,
            version: { increment: 1 },
            revision: { increment: moved ? 1 : 0 },
          },
        });
        await log(
          tx,
          req,
          "update",
          "appointment",
          saved.id,
          old,
          saved,
          reason,
        );
        return saved;
      }),
    );
  },
);
router.get(
  "/appointments/:id/history",
  permit("appointments.view"),
  async (req, res) =>
    res.json(
      await prisma.auditLog.findMany({
        where: { entity: "ops-appointment", entityId: String(req.params.id) },
        orderBy: { createdAt: "desc" },
      }),
    ),
);
router.post(
  "/appointments/:id/calls",
  permit("appointments.manage"),
  async (req, res) => {
    ensure(callOutcomes.includes(req.body.outcome), "ผลการโทรไม่ถูกต้อง");
    res.json(
      await serial(async (tx) => {
        const existing = await tx.opsCall.findUnique({
          where: { requestKey: key(req) },
        });
        if (existing) {
          ensure(existing.staffId === req.user!.id, "คำขอซ้ำ", 409);
          return existing;
        }
        const a = await tx.opsAppointment.findUnique({
          where: { id: String(req.params.id) },
        });
        ensure(a, "ไม่พบนัด", 404);
        ensure(
          a.version === req.body.version,
          "นัดเปลี่ยนแล้ว กรุณาโหลดใหม่",
          409,
        );
        const saved = await tx.opsCall.create({
          data: {
            appointmentId: a.id,
            revision: a.revision,
            outcome: req.body.outcome,
            notes: text(req.body.notes),
            staffId: req.user!.id,
            staffName: req.user!.username,
            requestKey: key(req),
          },
        });
        await log(tx, req, "create", "call", saved.id, null, saved);
        return saved;
      }),
    );
  },
);
router.get("/follow-up", permit("followup.view"), async (_req, res) => {
  const today = clinicToday(),
    now = new Date(),
    currentMinute =
      Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Bangkok",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(now),
      ) *
        60 +
      now.getUTCMinutes();
  const patients = await prisma.client.findMany({
    where: { orthoDentId: { not: null }, deletedAt: null },
    select: {
      ...patientSelect,
      orthoDent: { select: { name: true } },
      treatments: {
        where: { deletedAt: null },
        orderBy: { treatmentDate: "desc" },
        select: { treatmentDate: true, items: { select: { type: true } } },
      },
      opsAppointments: {
        where: {
          status: { in: ["scheduled", "arrived"] },
          OR: [
            { date: { gt: new Date(today) } },
            { date: new Date(today), minute: { gte: currentMinute } },
          ],
        },
        orderBy: [{ date: "asc" }, { minute: "asc" }],
        take: 1,
        include: { dentist: { select: { name: true } } },
      },
    },
  });
  res.json(
    patients.map(({ treatments, opsAppointments, ...p }) => ({
      ...p,
      lastVisit: treatments[0]?.treatmentDate ?? null,
      nextAppointment: opsAppointments[0] ?? null,
      scaling: scalingState(
        treatments.find((t) => t.items.some((i) => i.type === "scaling"))
          ?.treatmentDate ?? null,
      ),
    })),
  );
});

router.get("/lab-jobs", permit("finance.view"), async (req, res) => {
  const r = range(req),
    companyId = text(req.query.companyId),
    status = text(req.query.status),
    basis = text(req.query.basis) || "job";
  ensure(["job", "payment"].includes(basis), "ชนิดวันที่ไม่ถูกต้อง");
  const groups = await prisma.$transaction(
    async (tx) => {
      const jobs = await tx.labWork.findMany({
        where: {
          treatmentRecord: {
            deletedAt: null,
            ...(basis === "job" ? { treatmentDate: r.where } : {}),
          },
          ...(companyId ? { companyId } : {}),
        },
        include: {
          treatmentRecord: { include: { client: { select: patientSelect } } },
        },
      });
      const claims = await tx.opsLabLine.findMany({
        where: { activeJobId: { in: jobs.map((j) => j.id) } },
        select: { activeJobId: true },
      });
      const claimed = new Set(claims.map((c) => c.activeJobId));
      // Historical paid rows come exclusively from immutable payment snapshots.
      const paid = await tx.opsLabLine.findMany({
        where: {
          activeJobId: { not: null },
          ...(basis === "job" ? { jobDate: r.where } : {}),
          expense: {
            voidedAt: null,
            ...(companyId ? { companyId } : {}),
            ...(basis === "payment" ? { paidDate: r.where } : {}),
          },
        },
        include: { expense: true },
      });
      const companyName = (id: string | null) =>
        LAB_COMPANIES.find((c) => c.id === id)?.name ?? "ยังไม่ระบุแล็บ";
      const rows = [
        ...(basis === "job"
          ? jobs
              .filter((j) => !claimed.has(j.id))
              .map((j) => ({
                id: j.id,
                type: j.typeDescription ? `${j.type}: ${j.typeDescription}` : j.type,
                companyId: j.companyId,
                companyName: companyName(j.companyId),
                cost: j.cost,
                jobDate: j.treatmentRecord.treatmentDate,
                patient: j.treatmentRecord.client,
                sourceRecordId: j.treatmentRecordId,
                payment: null,
                paidAmount: null,
              }))
          : []),
        ...paid.map((l) => ({
          id: l.jobId,
          type: l.jobType,
          companyId: l.expense.companyId,
          companyName: companyName(l.expense.companyId),
          cost: l.amount,
          jobDate: l.jobDate,
          patient: l.patientSnapshot,
          sourceRecordId: l.sourceRecordId,
          payment: l.expense,
          paidAmount: l.amount,
        })),
      ].filter(
        (j) => !status || (status === "paid" ? !!j.payment : !j.payment),
      );
      const groups = [...new Set(rows.map((j) => j.companyId))].map((id) => {
        const items = rows.filter((j) => j.companyId === id);
        const sum = (list: typeof items, paid: boolean) =>
          list
            .reduce(
              (s, j) => s.plus((paid ? j.paidAmount : j.cost) ?? 0),
              new Prisma.Decimal(0),
            )
            .toFixed(2);
        return {
          companyId: id,
          name: items[0].companyName,
          total: sum(items, false),
          paid: sum(
            items.filter((j) => j.payment),
            true,
          ),
          outstanding: sum(
            items.filter((j) => !j.payment),
            false,
          ),
          unknownCosts: items.filter((j) => j.cost === null).length,
          items,
        };
      });
      return groups;
    },
    { isolationLevel: "RepeatableRead" },
  );
  res.json(groups);
});
async function evidenceAllowed(tx: Tx, id: string | null, req: Request) {
  if (!id) return;
  const e = await tx.opsEvidence.findUnique({
    where: { id },
    select: { createdBy: true },
  });
  ensure(
    e && (e.createdBy === req.user!.id || req.user!.role === "SUPER_ADMIN"),
    "ไม่พบหลักฐานที่คุณอัปโหลด",
    403,
  );
}
async function duplicateWarning(
  tx: Tx,
  reference: string,
  evidenceId: string | null,
) {
  const e = evidenceId
    ? await tx.opsEvidence.findUnique({
        where: { id: evidenceId },
        select: { hash: true },
      })
    : null;
  if (!reference && !e) return false;
  return !!(await tx.opsExpense.findFirst({
    where: {
      voidedAt: null,
      OR: [
        ...(reference ? [{ reference }] : []),
        ...(e ? [{ evidence: { hash: e.hash } }] : []),
      ],
    },
    select: { id: true },
  }));
}
async function createExpense(req: Request, kind: "manual" | "lab") {
  const b = req.body,
    paidDate = day(b.paidDate);
  ensure(paidDate <= clinicToday(), "วันที่จ่ายต้องไม่เป็นอนาคต");
  ensure(b.reviewed === true, "กรุณาตรวจสอบและยืนยันข้อมูล");
  return serial(async (tx) => {
    const existing = await tx.opsExpense.findUnique({
      where: { requestKey: key(req) },
    });
    if (existing) {
      ensure(existing.createdBy === req.user!.id, "คำขอซ้ำ", 409);
      return existing;
    }
    const evidenceId = text(b.evidenceId) || null,
      reference = text(b.reference, false, 200);
    await evidenceAllowed(tx, evidenceId, req);
    ensure(
      !(await duplicateWarning(tx, reference, evidenceId)) ||
        b.acknowledgeDuplicate === true,
      "อาจเป็นรายการซ้ำ กรุณาตรวจสอบและยืนยันรายการซ้ำ",
      409,
    );
    let amount: Prisma.Decimal,
      companyId: string | null = null;
    let lines: Prisma.OpsLabLineCreateWithoutExpenseInput[] = [];
    if (kind === "lab") {
      ensure(
        Array.isArray(b.jobIds) &&
          b.jobIds.length > 0 &&
          b.jobIds.length <= 200 &&
          b.jobIds.every((s: unknown) => typeof s === "string"),
        "กรุณาเลือกงานแล็บ",
      );
      const ids: string[] = [...new Set<string>(b.jobIds)];
      ensure(ids.length === b.jobIds.length, "งานซ้ำ");
      const jobs = await tx.labWork.findMany({
        where: { id: { in: ids }, treatmentRecord: { deletedAt: null } },
        include: {
          treatmentRecord: { include: { client: { select: patientSelect } } },
        },
      });
      ensure(jobs.length === ids.length, "ไม่พบงานแล็บบางรายการ");
      companyId = jobs[0].companyId;
      ensure(
        validLabCompany(companyId) &&
          jobs.every((j) => j.companyId === companyId),
        "เลือกงานจากแล็บเดียวกันที่ระบุบริษัทแล้ว",
      );
      ensure(
        b.expectedCompanyId === companyId,
        "บริษัทแล็บเปลี่ยนจากที่ตรวจสอบ กรุณาโหลดใหม่และยืนยันผู้รับเงินอีกครั้ง",
        409,
      );
      ensure(
        jobs.every((j) => j.cost !== null && j.cost.gt(0)),
        "ต้องระบุค่าแล็บมากกว่า 0 ทุกรายการ",
      );
      ensure(
        b.expectedAmounts &&
          typeof b.expectedAmounts === "object" &&
          jobs.every(
            (j) =>
              typeof b.expectedAmounts[j.id] === "string" &&
              /^\d+(\.\d{1,2})?$/.test(b.expectedAmounts[j.id]) &&
              j.cost!.equals(b.expectedAmounts[j.id]),
          ),
        "ค่าแล็บเปลี่ยนจากที่ตรวจสอบ กรุณาโหลดใหม่และยืนยันยอดอีกครั้ง",
        409,
      );
      ensure(
        jobs.every(
          (j) =>
            j.treatmentRecord.treatmentDate.toISOString().slice(0, 10) <=
            paidDate,
        ),
        "วันจ่ายต้องไม่ก่อนวันเกิดงาน",
      );
      ensure(
        !(await tx.opsLabLine.findFirst({
          where: { activeJobId: { in: ids } },
        })),
        "มีงานที่จ่ายแล้ว กรุณาโหลดใหม่",
        409,
      );
      lines = jobs.map((j) => ({
        jobId: j.id,
        activeJobId: j.id,
        amount: j.cost!,
        jobDate: j.treatmentRecord.treatmentDate,
        description: `${j.treatmentRecord.client.hn} ${j.treatmentRecord.client.firstName} ${j.type}`,
        jobType: j.type,
        patientSnapshot: j.treatmentRecord.client,
        sourceRecordId: j.treatmentRecordId,
      }));
      amount = jobs.reduce(
        (sum, j) => sum.plus(j.cost!),
        new Prisma.Decimal(0),
      );
    } else amount = money(b.amount);
    const paidTime = text(b.paidTime) || null;
    ensure(
      !paidTime || /^([01]\d|2[0-3]):[0-5]\d$/.test(paidTime),
      "เวลาจ่ายไม่ถูกต้อง",
    );
    const category = kind === "lab" ? "lab" : text(b.category, true);
    ensure(
      ["lab", "supplies", "rent", "utilities", "other"].includes(category) &&
        (kind === "lab" || category !== "lab"),
      "หมวดหมู่ไม่ถูกต้อง",
    );
    const saved = await tx.opsExpense.create({
      data: {
        kind,
        companyId,
        category,
        description: text(b.description, true),
        amount,
        paidDate: new Date(paidDate),
        paidTime,
        recipient:
          kind === "lab"
            ? LAB_COMPANIES.find((c) => c.id === companyId)!.name
            : text(b.recipient, true),
        bank: text(b.bank) || null,
        reference: reference || null,
        notes: text(b.notes),
        evidenceId,
        reviewed: true,
        createdBy: req.user!.id,
        requestKey: key(req),
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await log(tx, req, "create", "expense", saved.id, null, saved);
    return saved;
  });
}
router.post("/lab-payments", permit("labs.pay"), async (req, res) =>
  res.json(await createExpense(req, "lab")),
);
router.post("/expenses", permit("expenses.manage"), async (req, res) =>
  res.json(await createExpense(req, "manual")),
);
router.get("/expenses", permit("finance.view"), async (req, res) => {
  const r = range(req),
    rows = await prisma.opsExpense.findMany({
      where: { paidDate: r.where },
      include: { lines: true },
      orderBy: [{ paidDate: "desc" }, { createdAt: "desc" }],
    });
  res.json({
    total: rows
      .filter((x) => !x.voidedAt)
      .reduce((sum, x) => sum.plus(x.amount), new Prisma.Decimal(0))
      .toFixed(2),
    rows,
  });
});
router.post(
  "/expenses/:id/reverse",
  permit("finance.reverse"),
  async (req, res) =>
    res.json(
      await serial(async (tx) => {
        const old = await tx.opsExpense.findUnique({
          where: { id: String(req.params.id) },
        });
        ensure(old, "ไม่พบรายการ", 404);
        ensure(!old.voidedAt, "รายการถูกยกเลิกแล้ว", 409);
        const reason = text(req.body.reason, true);
        const saved = await tx.opsExpense.update({
          where: { id: old.id },
          data: {
            voidedAt: new Date(),
            voidedBy: req.user!.id,
            voidReason: reason,
          },
        });
        await tx.opsLabLine.updateMany({
          where: { expenseId: old.id },
          data: { activeJobId: null },
        });
        await log(tx, req, "reverse", "expense", old.id, old, saved, reason);
        return saved;
      }),
    ),
);
router.post(
  "/expenses/:id/evidence",
  permit("finance.view"),
  async (req, res) =>
    res.json(
      await serial(async (tx) => {
        const old = await tx.opsExpense.findUnique({
          where: { id: String(req.params.id) },
        });
        ensure(old, "ไม่พบรายการ", 404);
        ensure(
          res.locals.permissions.includes(
            old.kind === "lab" ? "labs.pay" : "expenses.manage",
          ),
          "ไม่มีสิทธิ์",
          403,
        );
        ensure(
          !old.voidedAt && !old.evidenceId,
          "รายการยกเลิกหรือมีหลักฐานแล้ว",
          409,
        );
        const evidenceId = text(req.body.evidenceId, true);
        await evidenceAllowed(tx, evidenceId, req);
        ensure(
          !(await duplicateWarning(tx, "", evidenceId)) ||
            req.body.acknowledgeDuplicate === true,
          "อาจเป็นหลักฐานซ้ำ กรุณายืนยัน",
          409,
        );
        const saved = await tx.opsExpense.update({
          where: { id: old.id },
          data: { evidenceId },
        });
        await log(tx, req, "attach", "expense", old.id, old, saved);
        return saved;
      }),
    ),
);
router.get("/evidence", permit("finance.view"), async (req, res) => {
  res.json(
    await prisma.opsEvidence.findMany({
      where: { createdBy: req.user!.id, expenses: { none: {} } },
      select: { id: true, createdAt: true, mime: true },
      orderBy: { createdAt: "desc" },
    }),
  );
});
router.post(
  "/evidence/:id/discard",
  permit("finance.view"),
  async (req, res) => {
    ensure(
      req.body.confirm === true,
      "กรุณายืนยันการลบไฟล์ร่างที่ยังไม่ได้ใช้",
    );
    res.json(
      await serial(async (tx) => {
        const id = String(req.params.id);
        const evidence = await tx.opsEvidence.findUnique({
          where: { id },
          select: {
            id: true,
            createdBy: true,
            hash: true,
            expenses: { select: { id: true } },
          },
        });
        ensure(
          evidence && evidence.createdBy === req.user!.id,
          "ไม่พบไฟล์ร่างของคุณ",
          403,
        );
        ensure(
          evidence.expenses.length === 0,
          "ไม่สามารถลบหลักฐานที่ใช้อ้างอิงรายการแล้ว",
          409,
        );
        await tx.opsEvidence.delete({ where: { id } });
        await log(
          tx,
          req,
          "discard",
          "evidence",
          id,
          { hash: evidence.hash },
          null,
          "Discarded unattached draft evidence",
        );
        return { discarded: true };
      }),
    );
  },
);
// express.json ignores image content; the raw parser here is image-only.
router.post(
  "/evidence",
  permit("finance.view"),
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    keyGenerator: (req) => req.user!.id,
    message: {
      message: "อัปโหลดได้ไม่เกิน 30 ครั้งต่อชั่วโมง กรุณากรอกข้อมูลเองก่อนได้",
    },
  }),
  express.raw({ type: ["image/png", "image/jpeg"], limit: "3mb" }),
  async (req, res) => {
    ensure(
      res.locals.permissions.includes("expenses.manage") ||
        res.locals.permissions.includes("labs.pay"),
      "ไม่มีสิทธิ์อัปโหลด",
      403,
    );
    const bytes = req.body;
    ensure(
      Buffer.isBuffer(bytes) && bytes.length > 8,
      "รองรับรูป PNG/JPEG ไม่เกิน 3 MB",
    );
    const png = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    ensure(png || jpeg, "ไฟล์รูปไม่ถูกต้อง");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const duplicate = !!(await prisma.opsExpense.findFirst({
      where: { evidence: { hash } },
      select: { id: true },
    }));
    const saved = await serial(async (tx) => {
      const existing = await tx.opsEvidence.findFirst({
        where: { hash, createdBy: req.user!.id },
        select: { id: true },
      });
      if (existing) return existing;
      // Bounded abandoned uploads per staff member; attaching evidence frees this quota.
      ensure(
        (await tx.opsEvidence.count({
          where: { createdBy: req.user!.id, expenses: { none: {} } },
        })) < 30,
        "มีหลักฐานที่ยังไม่ได้ใช้ครบ 30 ไฟล์ กรุณาใช้ไฟล์เดิมหรือให้เจ้าของตรวจสอบ",
        429,
      );
      return tx.opsEvidence.create({
        data: {
          bytes: Uint8Array.from(bytes),
          mime: png ? "image/png" : "image/jpeg",
          hash,
          createdBy: req.user!.id,
        },
        select: { id: true },
      });
    });
    res.json({ ...saved, duplicate, extraction: await extractSlip(bytes) });
  },
);
router.get("/evidence/:id", permit("finance.view"), async (req, res) => {
  const e = await prisma.opsEvidence.findUnique({
    where: { id: String(req.params.id) },
  });
  ensure(e, "ไม่พบไฟล์", 404);
  ensure(
    e.createdBy === req.user!.id ||
      !!(await prisma.opsExpense.findFirst({ where: { evidenceId: e.id } })),
    "ไม่มีสิทธิ์ดูไฟล์",
    403,
  );
  res
    .set({
      "Content-Type": e.mime,
      "Cache-Control": "no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    })
    .send(Buffer.from(e.bytes));
});
router.get("/settings", permit("settings.manage"), async (_req, res) =>
  res.json({
    permissions,
    users: await prisma.user.findMany({
      select: { id: true, username: true, role: true, isActive: true },
    }),
    grants: await prisma.opsGrant.findMany(),
  }),
);
router.put("/settings/:userId", permit("settings.manage"), async (req, res) => {
  const userId = String(req.params.userId),
    p = req.body.permission;
  ensure(
    permissions.includes(p) && typeof req.body.allowed === "boolean",
    "สิทธิ์ไม่ถูกต้อง",
  );
  ensure(
    !["settings.manage", "finance.reverse"].includes(p),
    "สิทธิ์นี้สงวนสำหรับเจ้าของคลินิกเท่านั้น",
    403,
  );
  res.json(
    await serial(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      ensure(
        user && user.role !== "SUPER_ADMIN",
        "ไม่สามารถเปลี่ยนสิทธิ์เจ้าของ",
      );
      const old = await tx.opsGrant.findUnique({
        where: { userId_permission: { userId, permission: p } },
      });
      const saved = await tx.opsGrant.upsert({
        where: { userId_permission: { userId, permission: p } },
        create: { userId, permission: p, allowed: req.body.allowed },
        update: { allowed: req.body.allowed },
      });
      await log(tx, req, "update", "permission", saved.id, old, saved);
      return saved;
    }),
  );
});
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof OpsError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2034"].includes(err.code)
  ) {
    res.status(409).json({
      message: "ข้อมูลถูกแก้ไขหรือบันทึกแล้ว กรุณาโหลดใหม่ก่อนลองอีกครั้ง",
    });
    return;
  }
  next(err);
});
export default router;
