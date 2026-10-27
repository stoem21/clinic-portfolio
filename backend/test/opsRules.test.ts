import { describe, it, expect } from "vitest";
import {
  access,
  money,
  scalingState,
  shifts,
  slotFits,
} from "../src/lib/opsRules";
describe("front desk rules", () => {
  it("uses role defaults and explicit grants without removing owner access", () => {
    expect(access("USER", [])).not.toContain("labs.pay");
    expect(access("ADMIN", [])).not.toContain("finance.reverse");
    expect(
      access("USER", [{ permission: "labs.pay", allowed: true }]),
    ).toContain("labs.pay");
    expect(
      access("SUPER_ADMIN", [
        { permission: "settings.manage", allowed: false },
      ]),
    ).toContain("settings.manage");
    expect(
      access("USER", [
        { permission: "settings.manage", allowed: true },
        { permission: "finance.reverse", allowed: true },
      ]),
    ).not.toContain("settings.manage");
    expect(
      access("ADMIN", [{ permission: "finance.reverse", allowed: true }]),
    ).not.toContain("finance.reverse");
    expect(
      access("ADMIN", [{ permission: "settings.manage", allowed: true }]),
    ).not.toContain("settings.manage");
  });
  it("uses calendar months, strict boundary and missing-history distinction", () => {
    expect(scalingState(null).status).toBe("no-history");
    expect(scalingState(new Date("2025-08-31"), "2026-02-28").status).toBe(
      "current",
    );
    expect(scalingState(new Date("2025-08-31"), "2026-03-01").status).toBe(
      "overdue",
    );
    expect(scalingState(new Date("2026-03-18"), "2026-09-18").status).toBe(
      "current",
    );
  });
  it("cancels or replaces one day without mutating recurrence", () => {
    const rules = [
      {
        dentistId: "a",
        weekday: 5,
        startMinute: 540,
        endMinute: 1020,
        from: new Date("2026-01-01"),
        to: null,
      },
    ];
    const ex = [
      {
        dentistId: "a",
        date: new Date("2026-09-18"),
        cancelled: true,
        replacementId: null,
        startMinute: 540,
        endMinute: 720,
      },
    ];
    expect(shifts("2026-09-18", rules, ex)).toEqual([]);
    expect(shifts("2026-09-25", rules, ex)).toHaveLength(1);
    expect(
      shifts("2026-09-18", rules, [
        { ...ex[0], cancelled: false, replacementId: "b" },
      ])[0].dentistId,
    ).toBe("b");
    expect(rules[0].endMinute).toBe(1020);
    const covering = { ...ex[0], cancelled: false, replacementId: "b" };
    expect(
      shifts("2026-09-18", rules, [covering, { ...ex[0], dentistId: "b" }]),
    ).toHaveLength(0);
  });
  it("alternates Saturdays across month and year boundaries from the first shift", () => {
    const rule = {
      dentistId: "a", weekday: 6, intervalWeeks: 2,
      startMinute: 540, endMinute: 1020,
      from: new Date("2026-12-19"), to: null,
    };
    for (const date of ["2026-12-19", "2027-01-02", "2027-01-16", "2027-01-30", "2027-02-13"])
      expect(shifts(date, [rule], [])).toHaveLength(1);
    for (const date of ["2026-12-05", "2026-12-26", "2027-01-09", "2027-01-23", "2027-02-06", "2027-01-03"])
      expect(shifts(date, [rule], [])).toHaveLength(0);
    expect(shifts("2027-01-16", [{ ...rule, to: new Date("2027-01-15") }], [])).toHaveLength(0);
    expect(shifts("2027-01-16", [{ ...rule, to: new Date("2027-01-16") }], [])).toHaveLength(1);
  });
  it("keeps the fortnightly cycle after leave or an extra shift", () => {
    const rule = {
      dentistId: "a", weekday: 6, intervalWeeks: 2,
      startMinute: 540, endMinute: 1020,
      from: new Date("2026-09-19"), to: null,
    };
    const leave = { dentistId: "a", date: new Date("2026-10-03"), cancelled: true,
      replacementId: null, startMinute: 540, endMinute: 1020 };
    expect(shifts("2026-10-03", [rule], [leave])).toHaveLength(0);
    expect(shifts("2026-10-10", [rule], [leave])).toHaveLength(0);
    expect(shifts("2026-10-17", [rule], [leave])).toHaveLength(1);
    const extra = { ...leave, date: new Date("2026-09-26"), cancelled: false };
    expect(shifts("2026-09-26", [rule], [extra])).toHaveLength(1);
    expect(shifts("2026-10-03", [rule], [extra])).toHaveLength(1);
  });
  it.each([1, 2, 3, 4])("repeats every %i weeks", (intervalWeeks) => {
    const rule = { dentistId: "a", weekday: 6, intervalWeeks, startMinute: 540,
      endMinute: 1020, from: new Date("2026-09-19"), to: null };
    for (let week = 0; week < 9; week++) {
      const date = new Date(rule.from.getTime() + week * 7 * 86400000).toISOString().slice(0, 10);
      expect(shifts(date, [rule], [])).toHaveLength(week % intervalWeeks === 0 ? 1 : 0);
    }
  });
  it("validates slot alignment but has no capacity limit", () => {
    const w = [{ startMinute: 540, endMinute: 720 }];
    expect(slotFits(555, 15, w)).toBe(true);
    expect(slotFits(555, 30, w)).toBe(false);
    expect(slotFits(705, 30, w)).toBe(false);
    expect(slotFits(540, 30, w)).toBe(true);
    expect(slotFits(540, 30, w)).toBe(true);
  });
  it("uses precise money and rejects missing/zero/negative/overprecise values", () => {
    expect(money("0.10").plus(money("0.20")).toFixed(2)).toBe("0.30");
    for (const value of [null, "", "0", "-1", "1.001"])
      expect(() => money(value)).toThrow();
  });
});
