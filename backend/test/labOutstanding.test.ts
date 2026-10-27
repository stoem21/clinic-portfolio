import { describe, expect, it } from 'vitest';
import { outstandingAt } from '../src/lib/labOutstanding';
describe('outstanding lab portions at Bangkok end date', () => {
  const assigned = new Date('2026-08-03');
  it('includes the August 3 assignment before its August 30 payment', () => {
    const paidAt = new Date('2026-08-30T10:00:00+07:00');
    expect(outstandingAt(assigned, true, paidAt, '2026-08-15')).toBe(true);
    expect(outstandingAt(assigned, true, paidAt, '2026-08-30')).toBe(false);
    expect(outstandingAt(assigned, true, paidAt, '2026-09-18')).toBe(false);
  });
  it('includes the whole end date, not the next Bangkok day', () => {
    expect(outstandingAt(assigned, true, new Date('2026-08-15T16:59:59.999Z'), '2026-08-15')).toBe(false);
    expect(outstandingAt(assigned, true, new Date('2026-08-15T17:00:00Z'), '2026-08-15')).toBe(true);
  });
  it('excludes assignments after the cutoff and flags unknown historical dates', () => {
    expect(outstandingAt(assigned, false, null, '2026-08-02')).toBe(false);
    expect(outstandingAt(assigned, false, null, '2026-08-03')).toBe(true);
    expect(outstandingAt(null, false, null, '2026-08-15')).toBeNull();
    expect(outstandingAt(assigned, true, null, '2026-08-15')).toBeNull();
  });
});
