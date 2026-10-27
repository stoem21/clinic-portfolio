import { Prisma, Role } from "@prisma/client";
import { clinicToday, validDay } from "./clinicDay";

export class OpsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new OpsError(status, message);
}
export const permissions = [
  "appointments.view",
  "appointments.manage",
  "schedules.manage",
  "followup.view",
  "finance.view",
  "expenses.manage",
  "labs.pay",
  "finance.reverse",
  "settings.manage",
] as const;
export type Permission = (typeof permissions)[number];
export function access(
  role: Role,
  grants: { permission: string; allowed: boolean }[],
) {
  const defaults: readonly string[] =
    role === "SUPER_ADMIN"
      ? permissions
      : role === "ADMIN"
        ? permissions.filter(
            (p) => !["finance.reverse", "settings.manage"].includes(p),
          )
        : ["appointments.view", "appointments.manage", "followup.view"];
  return permissions.filter(
    (p) =>
      role === "SUPER_ADMIN" ||
      (!["finance.reverse", "settings.manage"].includes(p) &&
        (grants.find((g) => g.permission === p)?.allowed ??
          defaults.includes(p))),
  );
}
export function day(value: unknown): string {
  ensure(validDay(value), "วันที่ไม่ถูกต้อง");
  return value;
}
export function text(value: unknown, required = false, max = 2000): string {
  ensure(
    value === undefined || value === null || typeof value === "string",
    "ข้อความไม่ถูกต้อง",
  );
  const s = typeof value === "string" ? value.trim() : "";
  ensure(
    s.length <= max && (!required || s.length > 0),
    "กรุณากรอกข้อความให้ครบถ้วน",
  );
  return s;
}
export function minute(value: unknown): number {
  ensure(
    Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 1440,
    "เวลาไม่ถูกต้อง",
  );
  return Number(value);
}
export function money(value: unknown) {
  ensure(
    typeof value === "string" && /^\d{1,10}(\.\d{1,2})?$/.test(value),
    "จำนวนเงินต้องเป็นตัวเลขทศนิยมไม่เกิน 2 ตำแหน่ง",
  );
  const amount = new Prisma.Decimal(value);
  ensure(amount.gt(0), "จำนวนเงินต้องมากกว่า 0");
  return amount;
}
export function scalingState(last: Date | null, today = clinicToday()) {
  if (!last) return { status: "no-history", lastDate: null };
  const d = new Date(last.toISOString().slice(0, 10));
  const date = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 6);
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(date, end));
  return {
    status: today > d.toISOString().slice(0, 10) ? "overdue" : "current",
    lastDate: last.toISOString().slice(0, 10),
  };
}
type Rule = {
  dentistId: string;
  weekday: number;
  intervalWeeks?: number;
  startMinute: number;
  endMinute: number;
  from: Date;
  to: Date | null;
};
type Exception = {
  dentistId: string;
  date: Date;
  cancelled: boolean;
  replacementId: string | null;
  startMinute: number;
  endMinute: number;
};
export function shifts(date: string, rules: Rule[], exceptions: Exception[]) {
  const weekday = new Date(date).getUTCDay();
  const overrides = exceptions.filter(
    (e) => e.date.toISOString().slice(0, 10) === date,
  );
  return [
    ...rules
      .filter(
        (r) =>
          r.weekday === weekday &&
          Math.floor((Date.parse(date) - r.from.getTime()) / (7 * 86400000)) % (r.intervalWeeks ?? 1) === 0 &&
          r.from.toISOString().slice(0, 10) <= date &&
          (!r.to || r.to.toISOString().slice(0, 10) >= date) &&
          !overrides.some((e) => e.dentistId === r.dentistId),
      )
      .map((r) => ({
        dentistId: r.dentistId,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
        sourceDentistId: r.dentistId,
      })),
    ...overrides
      .filter((e) => !e.cancelled)
      .flatMap((e) => {
        const target = e.replacementId
          ? overrides.find((x) => x.dentistId === e.replacementId)
          : undefined;
        // A dentist's own leave/replacement takes precedence over incoming cover.
        if (target?.cancelled || target?.replacementId) return [];
        const startMinute = Math.max(
          e.startMinute,
          target?.startMinute ?? e.startMinute,
        );
        const endMinute = Math.min(
          e.endMinute,
          target?.endMinute ?? e.endMinute,
        );
        return startMinute < endMinute
          ? [
              {
                dentistId: e.replacementId || e.dentistId,
                startMinute,
                endMinute,
                sourceDentistId: e.dentistId,
              },
            ]
          : [];
      }),
  ];
}
export function slotFits(
  start: number,
  duration: number,
  windows: { startMinute: number; endMinute: number }[],
) {
  return windows.some(
    (w) =>
      start >= w.startMinute &&
      start + duration <= w.endMinute &&
      (start - w.startMinute) % duration === 0,
  );
}
export const appointmentStatuses = [
  "scheduled",
  "arrived",
  "completed",
  "cancelled",
  "no-show",
];
export const callOutcomes = [
  "confirmed",
  "no-answer",
  "disconnected",
  "callback",
  "switched-off",
  "out-of-service",
  "wrong-number",
];
