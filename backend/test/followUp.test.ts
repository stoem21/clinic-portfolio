import { describe, expect, it } from 'vitest';
import { clinicToday, elapsedDays, validDay } from '../src/lib/clinicDay';

const today = '2026-09-17';
const ago = (days: number) => new Date(Date.parse(today) - days * 86400000);
describe('follow-up calendar days', () => {
  it.each([179, 180, 360, 361])('calculates boundary %i', days => {
    const actual = elapsedDays(ago(days), null, today)!;
    expect(actual).toBe(days);
    expect(actual >= 180 && actual <= 360).toBe(days === 180 || days === 360);
  });
  it('uses the later treatment or contact, or the only available date', () => {
    expect(elapsedDays(ago(240), ago(60), today)).toBe(60);
    expect(elapsedDays(ago(60), ago(240), today)).toBe(60);
    expect(elapsedDays(null, ago(180), today)).toBe(180);
    expect(elapsedDays(ago(180), null, today)).toBe(180);
    expect(elapsedDays(null, null, today)).toBeNull();
  });
  it('uses Bangkok midnight rather than server or UTC midnight', () => {
    expect(clinicToday(new Date('2026-09-16T17:00:00Z'))).toBe(today);
    expect(clinicToday(new Date('2026-09-16T16:59:59Z'))).toBe('2026-09-16');
  });
  it('validates real date-only inputs and ignores clinical time of day', () => {
    expect(validDay('2026-02-30')).toBe(false);
    expect(validDay('2026-02-28')).toBe(true);
    expect(validDay('2026-02-28T00:00:00Z')).toBe(false);
    expect(elapsedDays(new Date('2026-09-16T23:59:59Z'), null, today)).toBe(1);
  });
});
