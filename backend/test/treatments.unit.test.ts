import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { computeTotalCost, parseBody } from '../src/routes/treatments';

const dec = (n: number) => new Prisma.Decimal(n);

describe('computeTotalCost', () => {
  it('returns null when every price is null', () => {
    expect(computeTotalCost([{ price: null }, { price: null }])).toBeNull();
  });

  it('sums non-null prices', () => {
    expect(computeTotalCost([{ price: dec(100) }, { price: dec(50.5) }, { price: null }])).toBe(
      150.5,
    );
  });
});

describe('parseBody', () => {
  const validBody = {
    clientId: 'c1',
    dentistId: 'd1',
    treatmentDate: '2026-06-01',
    items: [{ type: 'filling', data: { tooth: 11 }, price: 500 }],
  };

  it('accepts a valid body', () => {
    const result = parseBody({ ...validBody });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.clientId).toBe('c1');
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].price).toBe(500);
    }
  });

  it('rejects a missing clientId', () => {
    const result = parseBody({ ...validBody, clientId: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects an empty items array', () => {
    const result = parseBody({ ...validBody, items: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid date', () => {
    const result = parseBody({ ...validBody, treatmentDate: 'not-a-date' });
    expect(result.ok).toBe(false);
  });

  it('treats blank price as null', () => {
    const result = parseBody({
      ...validBody,
      items: [{ type: 'exam', data: {}, price: '' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.items[0].price).toBeNull();
  });

  it('defaults orthoCaseAction to null', () => {
    const result = parseBody({ ...validBody });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.orthoCaseAction).toBeNull();
  });

  it('accepts orthoCaseAction "start" and "end"', () => {
    const start = parseBody({ ...validBody, orthoCaseAction: 'start' });
    expect(start.ok).toBe(true);
    if (start.ok) expect(start.data.orthoCaseAction).toBe('start');

    const end = parseBody({ ...validBody, orthoCaseAction: 'end' });
    expect(end.ok).toBe(true);
    if (end.ok) expect(end.data.orthoCaseAction).toBe('end');
  });

  it('rejects an invalid orthoCaseAction', () => {
    const result = parseBody({ ...validBody, orthoCaseAction: 'maybe' });
    expect(result.ok).toBe(false);
  });

  it('defaults payments to an empty array when omitted', () => {
    const result = parseBody({ ...validBody });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.payments).toEqual([]);
  });

  it('accepts payments that sum to exactly the items total', () => {
    const result = parseBody({
      ...validBody,
      items: [{ type: 'filling', data: {}, price: 500 }],
      payments: [
        { type: 'cash', amount: 300 },
        { type: 'transfer', amount: 200 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.payments).toEqual([
        { type: 'cash', amount: 300 },
        { type: 'transfer', amount: 200 },
      ]);
    }
  });

  it('rejects payments that do not sum to the items total', () => {
    const result = parseBody({
      ...validBody,
      items: [{ type: 'filling', data: {}, price: 500 }],
      payments: [{ type: 'cash', amount: 400 }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown payment type', () => {
    const result = parseBody({
      ...validBody,
      items: [{ type: 'filling', data: {}, price: 500 }],
      payments: [{ type: 'crypto', amount: 500 }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a zero or negative payment amount', () => {
    const result = parseBody({
      ...validBody,
      items: [{ type: 'filling', data: {}, price: 500 }],
      payments: [{ type: 'cash', amount: 0 }],
    });
    expect(result.ok).toBe(false);
  });

  it('accepts socialSecurity as a payment type', () => {
    const result = parseBody({
      ...validBody,
      items: [{ type: 'filling', data: {}, price: 500 }],
      payments: [{ type: 'socialSecurity', amount: 500 }],
    });
    expect(result.ok).toBe(true);
  });

  it('tolerates floating-point rounding when comparing totals', () => {
    // 0.1 + 0.2 !== 0.3 in raw floating point — must still be accepted.
    const result = parseBody({
      ...validBody,
      items: [
        { type: 'filling', data: {}, price: 0.1 },
        { type: 'filling', data: {}, price: 0.2 },
      ],
      payments: [{ type: 'cash', amount: 0.3 }],
    });
    expect(result.ok).toBe(true);
  });
});
