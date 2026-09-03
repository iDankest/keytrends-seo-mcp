import { KeytrendsError } from '../models/errors.js';
import type { Logger } from './logger.js';

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  text: string;
  json<T>(): T;
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpClient {
  request(url: string, init?: RequestOptions): Promise<HttpResponse>;
}

export function createHttpClient(opts: {
  timeoutMs: number;
  userAgent: string;
  logger: Logger;
  retries?: number;
}): HttpClient {
  const { timeoutMs: defaultTimeoutMs, userAgent, logger, retries: maxRetries = 1 } = opts;

  async function waitMs(ms: number): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, ms);
    return promise;
  }

  async function executeRequest(
    url: string,
    init: RequestOptions | undefined,
    attempt: number
  ): Promise<HttpResponse> {
    const timeout = init?.timeoutMs ?? defaultTimeoutMs;
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers();

    headers.set('User-Agent', userAgent);
    if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers)) {
        headers.set(k, v);
      }
    }

    logger.debug('HTTP request', { url, method, attempt });

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: init?.body,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
          throw new KeytrendsError({
            code: 'TIMEOUT',
            message: `Request to ${url} timed out after ${timeout}ms`,
            cause: err,
          });
        }
      }
      throw new KeytrendsError({
        code: 'NETWORK_ERROR',
        message: `Network error requesting ${url}: ${err instanceof Error ? err.message : String(err)}`,
        cause: err,
      });
    }

    const status = response.status;
    const retryableStatus = [429, 500, 502, 503, 504].includes(status);

    if (retryableStatus && attempt < maxRetries) {
      let delayMs = 1500;
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        const sec = parseInt(retryAfter, 10);
        if (!isNaN(sec) && sec > 0) {
          delayMs = sec * 1000;
        }
      }
      logger.warn('Retrying HTTP request', { url, status, attempt, nextDelayMs: delayMs });
      await waitMs(delayMs);
      return executeRequest(url, init, attempt + 1);
    }

    const text = await response.text();

    return {
      status,
      ok: response.ok,
      headers: response.headers,
      text,
      json<T>(): T {
        try {
          return JSON.parse(text) as T;
        } catch (parseErr) {
          throw new KeytrendsError({
            code: 'UPSTREAM_ERROR',
            message: `Failed to parse JSON response from ${url}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
            cause: parseErr,
          });
        }
      },
    };
  }

  return {
    request(url: string, init?: RequestOptions): Promise<HttpResponse> {
      return executeRequest(url, init, 0);
    },
  };
}
