import { describe, it, expect } from 'vitest';
import { diffFields, idWithLabel } from '../src/lib/audit';

describe('idWithLabel', () => {
  it('returns null when the id itself is null', () => {
    expect(idWithLabel(null, 'ทพ. สมชาย')).toBeNull();
  });

  it('returns the bare id when no label is available', () => {
    expect(idWithLabel('abc-123', undefined)).toBe('abc-123');
    expect(idWithLabel('abc-123', null)).toBe('abc-123');
    expect(idWithLabel('abc-123', '')).toBe('abc-123');
  });

  it('formats as "id(label)" when a label is available', () => {
    expect(idWithLabel('abc-123', 'ทพ. สมชาย')).toBe('abc-123(ทพ. สมชาย)');
  });
});

describe('diffFields — labels param', () => {
  it('leaves unlabeled fields as the raw normalized value', () => {
    const changes = diffFields(
      { note: 'old note' },
      { note: 'new note' },
      ['note'],
    );
    expect(changes).toEqual([{ field: 'note', before: 'old note', after: 'new note' }]);
  });

  it('formats a labeled field as "id(name)" on both sides', () => {
    const changes = diffFields(
      { dentistId: 'd1' },
      { dentistId: 'd2' },
      ['dentistId'],
      { dentistId: { before: 'ทพ. เก่า', after: 'ทพญ. ใหม่' } },
    );
    expect(changes).toEqual([
      { field: 'dentistId', before: 'd1(ทพ. เก่า)', after: 'd2(ทพญ. ใหม่)' },
    ]);
  });

  it('a labeled field with no name available falls back to the bare id', () => {
    const changes = diffFields(
      { dentistId: 'd1' },
      { dentistId: 'd2' },
      ['dentistId'],
      { dentistId: { before: undefined, after: undefined } },
    );
    expect(changes).toEqual([{ field: 'dentistId', before: 'd1', after: 'd2' }]);
  });

  it('only the labeled fields are affected; other diffed fields in the same call stay plain', () => {
    const changes = diffFields(
      { dentistId: 'd1', note: 'old' },
      { dentistId: 'd2', note: 'new' },
      ['dentistId', 'note'],
      { dentistId: { before: 'ทพ. เก่า', after: 'ทพญ. ใหม่' } },
    );
    expect(changes).toEqual([
      { field: 'dentistId', before: 'd1(ทพ. เก่า)', after: 'd2(ทพญ. ใหม่)' },
      { field: 'note', before: 'old', after: 'new' },
    ]);
  });

  it('change detection still keys off the raw id, not the label — no change if the id is the same', () => {
    const changes = diffFields(
      { dentistId: 'd1' },
      { dentistId: 'd1' },
      ['dentistId'],
      { dentistId: { before: 'ทพ. เก่า', after: 'ทพญ. ใหม่ (renamed but same id)' } },
    );
    expect(changes).toEqual([]);
  });

  it('a null id stays null even when labeled', () => {
    const changes = diffFields(
      { dentistId: null as string | null },
      { dentistId: 'd1' },
      ['dentistId'],
      { dentistId: { before: null, after: 'ทพ. ใหม่' } },
    );
    expect(changes).toEqual([{ field: 'dentistId', before: null, after: 'd1(ทพ. ใหม่)' }]);
  });
});
