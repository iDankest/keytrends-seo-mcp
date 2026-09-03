import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GscExportAiVisibilityProvider } from '../src/providers/ai/gsc-export.js';
import { createLogger } from '../src/utils/logger.js';

describe('providers/ai/gsc-export', () => {
  const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));
  const logger = createLogger('silent');

  it('parses SEARCH dates and Spanish pages (with dot thousands separator) and filters by window', async () => {
    const provider = new GscExportAiVisibilityProvider(fixturesDir, logger);
    const summary = await provider.getSummary({
      window: { start_date: '2026-08-01', end_date: '2026-08-03' },
      surface: 'SEARCH',
    });

    expect(summary.available).toBe(true);
    expect(summary.surface).toBe('SEARCH');
    // Dates 08-01 (150) + 08-02 (200) + 08-03 (300) = 650
    expect(summary.impressions?.value).toBe(650);
    // Pages: 3 distinct pages in ai-search-pages-es.csv
    expect(summary.pages_count?.value).toBe(3);
    expect(summary.coverage?.first_date).toBe('2026-08-01');
    expect(summary.coverage?.last_date).toBe('2026-08-03');
    expect(summary.provenance.source_type).toBe('export');
  });

  it('correctly associates discover files with DISCOVER surface', async () => {
    const provider = new GscExportAiVisibilityProvider(fixturesDir, logger);
    const summary = await provider.getSummary({
      window: { start_date: '2026-08-01', end_date: '2026-08-02' },
      surface: 'DISCOVER',
    });

    expect(summary.available).toBe(true);
    expect(summary.surface).toBe('DISCOVER');
    // Discover dates 08-01 (50) + 08-02 (80) = 130
    expect(summary.impressions?.value).toBe(130);
  });

  it('getPages sorts descending and respects limit and parses 1.234 as 1234', async () => {
    const provider = new GscExportAiVisibilityProvider(fixturesDir, logger);
    const pages = await provider.getPages({
      window: { start_date: '2026-08-01', end_date: '2026-08-05' },
      surface: 'SEARCH',
      limit: 2,
    });

    expect(pages.available).toBe(true);
    expect(pages.rows).toHaveLength(2);
    expect(pages.total_rows_in_source).toBe(3);
    expect(pages.truncated).toBe(true);
    expect(pages.rows[0].page).toBe('https://keytrends.ai/');
    expect(pages.rows[0].impressions).toBe(1234);
    expect(pages.rows[1].impressions).toBe(890);
  });

  it('getTimeseries aggregates by MONTH and WEEK correctly', async () => {
    const provider = new GscExportAiVisibilityProvider(fixturesDir, logger);
    const dayTs = await provider.getTimeseries({
      window: { start_date: '2026-08-01', end_date: '2026-08-03' },
      surface: 'SEARCH',
      granularity: 'DAY',
    });

    expect(dayTs.available).toBe(true);
    expect(dayTs.points).toHaveLength(3);
    expect(dayTs.points[0].date).toBe('2026-08-01');
    expect(dayTs.points[0].impressions).toBe(150);

    const monthTs = await provider.getTimeseries({
      window: { start_date: '2026-08-01', end_date: '2026-08-05' },
      surface: 'SEARCH',
      granularity: 'MONTH',
    });

    expect(monthTs.available).toBe(true);
    expect(monthTs.points).toHaveLength(1);
    expect(monthTs.points[0].date).toBe('2026-08');
    // 150 + 200 + 300 + 250 + 400 = 1300
    expect(monthTs.points[0].impressions).toBe(1300);
  });

  it('bad headers produce available: false with reason detailing observed headers', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'keytrends-bad-headers-'));
    try {
      await writeFile(
        join(tempDir, 'dates.csv'),
        'ColumnaInvalida,OtraColumna\nvalor1,100\n'
      );
      const provider = new GscExportAiVisibilityProvider(tempDir, logger);
      const summary = await provider.getSummary({
        window: { start_date: '2026-08-01', end_date: '2026-08-05' },
        surface: 'SEARCH',
      });

      expect(summary.available).toBe(false);
      expect(summary.reason).toContain('Cabeceras no reconocidas');
      expect(summary.reason).toContain('ColumnaInvalida');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
