import { describe, expect, it } from 'vitest';
import { KeytrendsError } from '../src/models/errors.js';
import { RefreshTokenSource } from '../src/providers/gsc/oauth.js';
import type { HttpClient, HttpResponse } from '../src/utils/http.js';

describe('providers/gsc/oauth', () => {
  const creds = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    refreshToken: 'test-refresh-token',
  };

  it('caches token and avoids second HTTP request before expiration', async () => {
    let requestCount = 0;
    const http: HttpClient = {
      async request(): Promise<HttpResponse> {
        requestCount++;
        return {
          status: 200,
          ok: true,
          headers: new Headers(),
          text: JSON.stringify({ access_token: 'token-1', expires_in: 3600 }),
          json<T>() {
            return { access_token: 'token-1', expires_in: 3600 } as T;
          },
        };
      },
    };

    let fakeNow = 1000000;
    const source = new RefreshTokenSource(creds, http, () => fakeNow);

    const t1 = await source.getAccessToken();
    const t2 = await source.getAccessToken();

    expect(t1).toBe('token-1');
    expect(t2).toBe('token-1');
    expect(requestCount).toBe(1);
  });

  it('refreshes token after expiration window', async () => {
    let requestCount = 0;
    const http: HttpClient = {
      async request(): Promise<HttpResponse> {
        requestCount++;
        return {
          status: 200,
          ok: true,
          headers: new Headers(),
          text: JSON.stringify({ access_token: `token-${requestCount}`, expires_in: 3600 }),
          json<T>() {
            return { access_token: `token-${requestCount}`, expires_in: 3600 } as T;
          },
        };
      },
    };

    let fakeNow = 1000000;
    const source = new RefreshTokenSource(creds, http, () => fakeNow);

    const t1 = await source.getAccessToken();
    expect(t1).toBe('token-1');
    expect(requestCount).toBe(1);

    // Advance clock past expiration (3600s - 60s buffer = 3540s)
    fakeNow += 3600 * 1000;

    const t2 = await source.getAccessToken();
    expect(t2).toBe('token-2');
    expect(requestCount).toBe(2);
  });

  it('deduplicates concurrent getAccessToken calls into 1 HTTP request', async () => {
    let requestCount = 0;
    const http: HttpClient = {
      async request(): Promise<HttpResponse> {
        requestCount++;
        await Promise.resolve();
        return {
          status: 200,
          ok: true,
          headers: new Headers(),
          text: JSON.stringify({ access_token: 'concurrent-token', expires_in: 3600 }),
          json<T>() {
            return { access_token: 'concurrent-token', expires_in: 3600 } as T;
          },
        };
      },
    };

    const source = new RefreshTokenSource(creds, http);
    const [r1, r2, r3] = await Promise.all([
      source.getAccessToken(),
      source.getAccessToken(),
      source.getAccessToken(),
    ]);

    expect(r1).toBe('concurrent-token');
    expect(r2).toBe('concurrent-token');
    expect(r3).toBe('concurrent-token');
    expect(requestCount).toBe(1);
  });

  it('throws KeytrendsError AUTH_FAILED on HTTP 400', async () => {
    const http: HttpClient = {
      async request(): Promise<HttpResponse> {
        const text = JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        });
        return {
          status: 400,
          ok: false,
          headers: new Headers(),
          text,
          json<T>() {
            return JSON.parse(text) as T;
          },
        };
      },
    };

    const source = new RefreshTokenSource(creds, http);
    await expect(source.getAccessToken()).rejects.toThrowError(KeytrendsError);

    try {
      await source.getAccessToken();
    } catch (err: unknown) {
      const kerr = err as KeytrendsError;
      expect(kerr.code).toBe('AUTH_FAILED');
      expect(kerr.hint).toContain('GOOGLE_REFRESH_TOKEN');
    }
  });
});
