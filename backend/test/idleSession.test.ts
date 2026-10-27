import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdleSession, IDLE_TIMEOUT_MS } from '../../frontend/src/lib/idleSession';

describe('four-hour inactivity timeout', () => {
  let values: Map<string, string>;
  let active: boolean;
  let expired: ReturnType<typeof vi.fn>;
  let session: ReturnType<typeof createIdleSession>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T00:00:00Z'));
    values = new Map(); active = true;
    expired = vi.fn(() => { active = false; });
    const storage: Storage = {
      get length() { return values.size; }, clear: () => values.clear(),
      getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); }, key: index => [...values.keys()][index] ?? null,
    };
    session = createIdleSession(storage, 'last', () => active, expired);
    session.start();
  });
  afterEach(() => vi.useRealTimers());
  it('expires at exactly four hours; passive checks do not extend it', () => {
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    expect(session.check()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(session.check()).toBe(false);
    expect(expired).toHaveBeenCalledOnce();
  });
  it('real activity extends the deadline', () => {
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1000);
    session.activity();
    vi.advanceTimersByTime(1000);
    expect(session.check()).toBe(true);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1000);
    expect(session.check()).toBe(false);
  });
  it('cannot revive an expired session by moving the pointer after sleep', () => {
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1);
    session.activity();
    expect(expired).toHaveBeenCalledOnce();
    expect(values.has('last')).toBe(false);
  });
  it('rejects an invalid persisted timestamp', () => {
    values.set('last', 'invalid');
    expect(session.check()).toBe(false);
  });
});
