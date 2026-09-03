import { KeytrendsError } from '../../models/errors.js';
import { createLimiter, sleep } from '../../utils/throttle.js';
export async function inspectUrls(opts) {
    const { urls, client, logger, concurrency = 4, minIntervalMs = 110, retryDelayMs = 1500, } = opts;
    const limiter = createLimiter({ concurrency, minIntervalMs });
    const rows = [];
    const errors = [];
    const inspectSingle = async (url) => {
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
            }
            catch (err) {
                const isRetryable = err instanceof KeytrendsError &&
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
                const code = err instanceof KeytrendsError ? err.code : 'UPSTREAM_ERROR';
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
//# sourceMappingURL=inspector.js.map