import { describe, expect, it } from 'vitest';
import { KeytrendsError } from '../src/models/errors.js';
import type { GscClient } from '../src/providers/gsc/client.js';
import type { UrlInspectionResult } from '../src/providers/gsc/types.js';
import { inspectUrls } from '../src/providers/indexation/inspector.js';
import { createLogger } from '../src/utils/logger.js';

describe('providers/indexation/inspector', () => {
  const logger = createLogger('silent');

  it('aggregates verdicts and states for 5 URLs correctly', async () => {
    const verdicts: Record<string, 'PASS' | 'FAIL' | 'NEUTRAL'> = {
      'https://keytrends.ai/1': 'PASS',
      'https://keytrends.ai/2': 'PASS',
      'https://keytrends.ai/3': 'FAIL',
      'https://keytrends.ai/4': 'NEUTRAL',
      'https://keytrends.ai/5': 'PASS',
    };

    const stubClient = {
      async inspectUrl(url: string): Promise<UrlInspectionResult> {
        return {
          inspectionResult: {
            inspectionUrl: url,
            indexStatusResult: {
              verdict: verdicts[url] ?? 'VERDICT_UNSPECIFIED',
              coverage_state: 'Indexed, submitted in sitemap',
              indexing_state: 'INDEXING_ALLOWED',
              robots_txt_state: 'ALLOWED',
              pageFetchState: 'SUCCESSFUL',
              sitemap: ['https://keytrends.ai/sitemap.xml'],
            },
          },
        };
      },
    } as unknown as GscClient;

    const urls = Object.keys(verdicts);
    const outcome = await inspectUrls({
      urls,
      client: stubClient,
      logger,
      concurrency: 5,
      minIntervalMs: 0,
    });

    expect(outcome.rows).toHaveLength(5);
    expect(outcome.errors).toHaveLength(0);

    const passCount = outcome.rows.filter((r) => r.verdict === 'PASS').length;
    expect(passCount).toBe(3);

    const inSitemapCount = outcome.rows.filter((r) => r.in_sitemap).length;
    expect(inSitemapCount).toBe(5);
  });

  it('retries once on RATE_LIMITED and resolves if second attempt succeeds', async () => {
    let attempts = 0;
    const stubClient = {
      async inspectUrl(url: string): Promise<UrlInspectionResult> {
        attempts++;
        if (attempts === 1) {
          throw new KeytrendsError({
            code: 'RATE_LIMITED',
            message: 'Rate limit exceeded',
            httpStatus: 429,
          });
        }
        return {
          inspectionResult: {
            inspectionUrl: url,
            indexStatusResult: {
              verdict: 'PASS',
              coverage_state: 'Indexed',
            },
          },
        };
      },
    } as unknown as GscClient;

    const outcome = await inspectUrls({
      urls: ['https://keytrends.ai/retry-page'],
      client: stubClient,
      logger,
      retryDelayMs: 1,
      minIntervalMs: 0,
    });

    expect(attempts).toBe(2);
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.errors).toHaveLength(0);
    expect(outcome.rows[0].verdict).toBe('PASS');
  });

  it('records in errors if URL fails twice without aborting other URLs', async () => {
    const stubClient = {
      async inspectUrl(url: string): Promise<UrlInspectionResult> {
        if (url.includes('failing')) {
          throw new KeytrendsError({
            code: 'RATE_LIMITED',
            message: 'Permanent rate limit error for this test',
            httpStatus: 429,
          });
        }
        return {
          inspectionResult: {
            inspectionUrl: url,
            indexStatusResult: { verdict: 'PASS' },
          },
        };
      },
    } as unknown as GscClient;

    const outcome = await inspectUrls({
      urls: ['https://keytrends.ai/ok', 'https://keytrends.ai/failing'],
      client: stubClient,
      logger,
      retryDelayMs: 1,
      minIntervalMs: 0,
    });

    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0].url).toBe('https://keytrends.ai/ok');
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0].url).toBe('https://keytrends.ai/failing');
    expect(outcome.errors[0].code).toBe('RATE_LIMITED');
  });
});
