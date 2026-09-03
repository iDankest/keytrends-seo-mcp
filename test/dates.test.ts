import { describe, expect, it } from 'vitest';
import { KeytrendsError } from '../src/models/errors.js';
import {
  daysBetween,
  resolveWindow,
  shiftWindowBack,
  todayInPacific,
} from '../src/utils/dates.js';

describe('utils/dates', () => {
  const fakeNow = new Date('2026-09-03T12:00:00Z');

  it('calculates today in Pacific (America/Los_Angeles)', () => {
    const todayPst = todayInPacific(fakeNow);
    expect(todayPst).toBe('2026-09-03');
  });

  it('resolves 28d preset ending 2 days before today PST', () => {
    const w = resolveWindow({ range: '28d', now: fakeNow });
    expect(w.end_date).toBe('2026-09-01');
    expect(w.start_date).toBe('2026-08-05');
    expect(w.days).toBe(28);
    expect(daysBetween(w.start_date, w.end_date) + 1).toBe(28);
  });

  it('resolves 7d preset', () => {
    const w = resolveWindow({ range: '7d', now: fakeNow });
    expect(w.end_date).toBe('2026-09-01');
    expect(w.start_date).toBe('2026-08-26');
    expect(w.days).toBe(7);
  });

  it('throws INVALID_ARGUMENT when custom range lacks end_date', () => {
    expect(() =>
      resolveWindow({ range: 'custom', start_date: '2026-08-01', now: fakeNow })
    ).toThrowError(KeytrendsError);

    try {
      resolveWindow({ range: 'custom', start_date: '2026-08-01', now: fakeNow });
    } catch (err: unknown) {
      expect((err as KeytrendsError).code).toBe('INVALID_ARGUMENT');
    }
  });

  it('throws INVALID_ARGUMENT when start_date > end_date', () => {
    expect(() =>
      resolveWindow({
        range: 'custom',
        start_date: '2026-08-10',
        end_date: '2026-08-05',
        now: fakeNow,
      })
    ).toThrowError(KeytrendsError);
  });

  it('shiftWindowBack returns contiguous previous period', () => {
    const initial = {
      start_date: '2026-08-05',
      end_date: '2026-09-01',
      days: 28,
    };
    const previous = shiftWindowBack(initial);
    expect(previous.end_date).toBe('2026-08-04');
    expect(previous.start_date).toBe('2026-07-08');
    expect(previous.days).toBe(28);
    expect(daysBetween(previous.start_date, previous.end_date) + 1).toBe(28);
  });
});
