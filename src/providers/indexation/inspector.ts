import { KeytrendsError, type ErrorCode } from '../../models/errors.js';
import type { GscClient } from '../gsc/client.js';
import type { Logger } from '../../utils/logger.js';
import { createLimiter, sleep } from '../../utils/throttle.js';

export interface IndexRow {
  url: string;
  verdict: string;
  coverage_state: string;
  indexing_state: string;
  robots_txt_state: string;
  page_fetch_state: string;
  google_canonical: string | null;
  user_canonical: string | null;
  last_crawl_time: string | null;
  crawled_as: string | null;
  in_sitemap: boolean;
  inspection_link: string | null;
}

export interface InspectionOutcome {
  rows: IndexRow[];
  errors: { url: string; message: string; code: ErrorCode }[];
}

export async function inspectUrls(opts: {
  urls: string[];
  client: GscClient;
  logger: Logger;
  concurrency?: number;
  minIntervalMs?: number;
  retryDelayMs?: number;
}): Promise<InspectionOutcome> {
  const {
    urls,
    client,
    logger,
    concurrency = 4,
    minIntervalMs = 110,
    retryDelayMs = 1500,
  } = opts;

  const limiter = createLimiter({ concurrency, minIntervalMs });
  const rows: IndexRow[] = [];
  const errors: { url: string; message: string; code: ErrorCode }[] = [];

  const inspectSingle = async (url: string) => {
    let attempt = 0;
    while (attempt < 2) {
      attempt++;
      try {
        const res = await limiter(() => client.inspectUrl(url));
        const indexResult = res.inspectionResult?.indexStatusResult;

        rows.push({
          url,
          verdict: indexResult?.verdict ?? 'VERDICT_UNSPECIFIED',
          coverage_state: indexResult?.coverageState ?? 'COVERAGE_STATE_UNSPECIFIED',
          indexing_state: indexResult?.indexingState ?? 'INDEXING_STATE_UNSPECIFIED',
          robots_txt_state: indexResult?.robotsTxtState ?? 'ROBOTS_TXT_STATE_UNSPECIFIED',
          page_fetch_state: indexResult?.pageFetchState ?? 'PAGE_FETCH_STATE_UNSPECIFIED',
          google_canonical: indexResult?.googleCanonical ?? null,
          user_canonical: indexResult?.userCanonical ?? null,
          last_crawl_time: indexResult?.lastCrawlTime ?? null,
          crawled_as: indexResult?.crawledAs ?? null,
          in_sitemap: (indexResult?.sitemap?.length ?? 0) > 0,
          inspection_link: null,
        });
        return;
      } catch (err) {
        const isRetryable =
          err instanceof KeytrendsError &&
          (err.code === 'RATE_LIMITED' || err.httpStatus === 503);

        if (isRetryable && attempt === 1) {
          logger.warn('Reintentando inspección de URL tras rate limit o 503', {
            url,
            attempt,
            retryDelayMs,
          });
          await sleep(retryDelayMs);
          continue;
        }

        const code: ErrorCode =
          err instanceof KeytrendsError ? err.code : 'UPSTREAM_ERROR';
        const message = err instanceof Error ? err.message : String(err);

        errors.push({ url, message, code });
        logger.error('Fallo en inspección de URL', { url, code, message });
        return;
      }
    }
  };

  await Promise.all(urls.map((url) => inspectSingle(url)));

  return { rows, errors };
}
