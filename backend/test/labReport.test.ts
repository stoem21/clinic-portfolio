import { describe, expect, it } from 'vitest';
import { canReverseLabPayment, labPortionInPeriod } from '../src/lib/labReport';
const from = '2026-09-01', today = '2026-09-18';
function evaluate(assigned: string | null, payment: string | null, to = '2026-09-15', amount: number | null = 500) {
  return labPortionInPeriod({ assignedDate: assigned ? new Date(assigned) : null, paid: !!payment, paidAt: payment ? new Date(`${payment}T12:00:00+07:00`) : null, amount }, from, to, today);
}
describe('lab period display and deductions', () => {
  it.each([
    ['2026-08-20', '2026-08-30', false, 0],
    ['2026-08-20', '2026-09-01', true, 500],
    ['2026-08-20', '2026-09-15', true, 500],
    ['2026-08-20', '2026-09-16', true, 0],
    ['2026-08-20', null, true, 0],
    ['2026-09-05', '2026-09-10', true, 500],
    ['2026-09-05', '2026-09-16', true, 0],
    ['2026-09-05', null, true, 0],
    ['2026-09-16', null, false, 0],
  ] as const)('historical: %s / %s', (assigned, paid, visible, deduction) => {
    expect(evaluate(assigned, paid)).toMatchObject({ visible, deduction });
  });
  it('today example: deducts paid-in-period and outstanding portions', () => {
    const rows = [evaluate('2026-08-30', '2026-09-02', today), evaluate('2026-08-30', null, today), evaluate('2026-09-05', null, today)];
    expect(rows.map(r => r.visible)).toEqual([true, true, true]);
    expect(rows.map(r => r.deduction)).toEqual([500, 500, 500]);
  });
  it.each([
    ['2026-08-20', '2026-08-31', 0],
    ['2026-08-20', '2026-09-01', 500],
    ['2026-08-20', '2026-09-18', 500],
    ['2026-08-20', '2026-09-19', 0],
    ['2026-08-20', null, 500],
    ['2026-09-05', '2026-09-10', 500],
    ['2026-09-19', null, 0],
  ] as const)('today: assigned %s / paid %s deducts %s', (assigned, paid, deduction) => {
    expect(evaluate(assigned, paid, today).deduction).toBe(deduction);
  });
  it('today uses inclusive Bangkok payment dates', () => {
    const p = { assignedDate: new Date('2026-08-20'), paid: true, amount: 500 };
    for (const [paidAt, deduction] of [
      ['2026-08-31T16:59:59Z', 0],
      ['2026-08-31T17:00:00Z', 500],
      ['2026-09-18T16:59:59Z', 500],
      ['2026-09-18T17:00:00Z', 0],
    ] as const) {
      expect(labPortionInPeriod({ ...p, paidAt: new Date(paidAt) }, from, today, today).deduction).toBe(deduction);
    }
  });
  it('shows missing and invalid data without deductions', () => {
    expect(evaluate(null, null)).toMatchObject({ visible: true, issue: 'incomplete-dates', deduction: 0 });
    expect(evaluate('2026-09-05', '2026-09-04')).toMatchObject({ issue: 'payment-before-assignment', deduction: 0 });
    expect(evaluate('2026-09-05', null, today, null)).toMatchObject({ issue: 'missing-cost', deduction: 0 });
  });
  it('uses Bangkok date boundaries for payment and reversal', () => {
    const p = { assignedDate: new Date('2026-08-30'), paid: true, amount: 500 };
    expect(labPortionInPeriod({ ...p, paidAt: new Date('2026-08-31T17:00:00Z') }, from, '2026-09-15', today).deduction).toBe(500);
    expect(labPortionInPeriod({ ...p, paidAt: new Date('2026-09-15T17:00:00Z') }, from, '2026-09-15', today).deduction).toBe(0);
    expect(canReverseLabPayment(new Date('2026-09-17T17:00:00Z'), new Date('2026-09-18T16:59:59Z'))).toBe(true);
    expect(canReverseLabPayment(new Date('2026-09-17T16:59:59Z'), new Date('2026-09-17T17:00:00Z'))).toBe(false);
    expect(canReverseLabPayment(null)).toBe(false);
  });
});
