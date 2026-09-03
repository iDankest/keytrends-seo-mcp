import { describe, expect, it } from 'vitest';
import {
  AI_ACTIVATION_REQUIREMENTS,
  NoAiVisibilityProvider,
  REASON_NO_OFFICIAL_AI_API,
} from '../src/providers/ai/none.js';

describe('providers/ai/none', () => {
  const provider = new NoAiVisibilityProvider();
  const window = { start_date: '2026-08-01', end_date: '2026-08-28' };

  it('summary returns available: false, activation_requirements, and NO impressions key', async () => {
    const summary = await provider.getSummary({ window, surface: 'SEARCH' });

    expect(summary.available).toBe(false);
    expect(summary.surface).toBe('SEARCH');
    expect(summary.reason).toBe(REASON_NO_OFFICIAL_AI_API);
    expect(summary.activation_requirements).toEqual(AI_ACTIVATION_REQUIREMENTS);
    expect(summary.activation_requirements).toHaveLength(4);
    expect(summary.provenance.confidence).toBe('unavailable');
    expect(summary.impressions).toBeUndefined();

    // Critical anti-zero invariant assertion:
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('"impressions"');
    expect(serialized).not.toContain('"pages_count"');
  });

  it('pages returns available: false, empty rows, and activation requirements', async () => {
    const pages = await provider.getPages({ window, surface: 'SEARCH', limit: 10 });

    expect(pages.available).toBe(false);
    expect(pages.surface).toBe('SEARCH');
    expect(pages.rows).toEqual([]);
    expect(pages.total_rows_in_source).toBeNull();
    expect(pages.activation_requirements).toHaveLength(4);
    expect(pages.provenance.confidence).toBe('unavailable');
  });

  it('timeseries returns available: false and empty points', async () => {
    const ts = await provider.getTimeseries({
      window,
      surface: 'SEARCH',
      granularity: 'DAY',
    });

    expect(ts.available).toBe(false);
    expect(ts.granularity).toBe('DAY');
    expect(ts.points).toEqual([]);
    expect(ts.provenance.confidence).toBe('unavailable');
  });
});
