import { describe, expect, it } from 'vitest';
import { KeytrendsError } from '../src/models/errors.js';
import { GscClient } from '../src/providers/gsc/client.js';
import type { TokenSource } from '../src/providers/gsc/oauth.js';
import type { HttpClient, HttpResponse } from '../src/utils/http.js';
import { createLogger } from '../src/utils/logger.js';

describe('providers/gsc/client', () => {
  const dummyTokens: TokenSource = {
    async getAccessToken(): Promise<string> {
      return 'test-bearer-token';
    },
  };
  const logger = createLogger('silent');

  it('correctly encodes sc-domain: and https:// URLs for searchAnalytics/query', async () => {
    let capturedUrl = '';
    let capturedAuth = '';

    const http: HttpClient = {
      async request(url, init): Promise<HttpResponse> {
        capturedUrl = url;
        capturedAuth = init?.headers?.Authorization ?? '';
        return {
          status: 200,
          ok: true,
          headers: new Headers(),
          text: JSON.stringify({ rows: [] }),
          json<T>() {
            return { rows: [] } as T;
          },
        };
      },
    };

    const domainClient = new GscClient({
      tokens: dummyTokens,
      property: 'sc-domain:keytrends.ai',
      http,
      logger,
    });

    await domainClient.querySearchAnalytics({
      startDate: '2026-08-01',
      endDate: '2026-08-28',
    });

    expect(capturedUrl).toBe(
      'https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Akeytrends.ai/searchAnalytics/query'
    );
    expect(capturedAuth).toBe('Bearer test-bearer-token');

    const prefixClient = new GscClient({
      tokens: dummyTokens,
      property: 'https://keytrends.ai/',
      http,
      logger,
    });

    await prefixClient.querySearchAnalytics({
      startDate: '2026-08-01',
      endDate: '2026-08-28',
    });

    expect(capturedUrl).toBe(
      'https://searchconsole.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fkeytrends.ai%2F/searchAnalytics/query'
    );
  });

  it('uses /v1/urlInspection/index:inspect for URL inspection', async () => {
    let capturedUrl = '';
    let capturedBody: Record<string, unknown> = {};

    const http: HttpClient = {
      async request(url, init): Promise<HttpResponse> {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body ?? '{}');
        return {
          status: 200,
          ok: true,
          headers: new Headers(),
          text: JSON.stringify({ inspectionResult: {} }),
          json<T>() {
            return { inspectionResult: {} } as T;
          },
        };
      },
    };

    const client = new GscClient({
      tokens: dummyTokens,
      property: 'sc-domain:keytrends.ai',
      http,
      logger,
    });

    await client.inspectUrl('https://keytrends.ai/page-1');

    expect(capturedUrl).toBe(
      'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'
    );
    expect(capturedBody.inspectionUrl).toBe('https://keytrends.ai/page-1');
    expect(capturedBody.siteUrl).toBe('sc-domain:keytrends.ai');
  });

  it('maps HTTP 403, 429 and 400 to corresponding KeytrendsError codes', async () => {
    function makeFailingHttp(status: number, errorStatus: string): HttpClient {
      return {
        async request(): Promise<HttpResponse> {
          const text = JSON.stringify({
            error: {
              code: status,
              message: `Error with status ${status}`,
              status: errorStatus,
            },
          });
          return {
            status,
            ok: false,
            headers: new Headers(),
            text,
            json<T>() {
              return JSON.parse(text) as T;
            },
          };
        },
      };
    }

    const c403 = new GscClient({
      tokens: dummyTokens,
      property: 'sc-domain:keytrends.ai',
      http: makeFailingHttp(403, 'PERMISSION_DENIED'),
      logger,
    });
    await expect(c403.listSites()).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });

    const c429 = new GscClient({
      tokens: dummyTokens,
      property: 'sc-domain:keytrends.ai',
      http: makeFailingHttp(429, 'RESOURCE_EXHAUSTED'),
      logger,
    });
    await expect(c429.listSites()).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });

    const c400 = new GscClient({
      tokens: dummyTokens,
      property: 'sc-domain:keytrends.ai',
      http: makeFailingHttp(400, 'INVALID_ARGUMENT'),
      logger,
    });
    await expect(c400.listSites()).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  it('sends uppercase enums and groupType: AND in querySearchAnalytics', async () => {
    let capturedBody: {
      type?: string;
      dimensions?: string[];
      dimensionFilterGroups?: Array<{
        groupType?: string;
        filters?: Array<{ operator?: string }>;
      }>;
    } = {};
    const http: HttpClient = {
      async request(_url, init): Promise<HttpResponse> {
        capturedBody = JSON.parse(init?.body ?? '{}');
        return {
          status: 200,
          ok: true,
          headers: new Headers(),
          text: JSON.stringify({ rows: [] }),
          json<T>() {
            return { rows: [] } as T;
          },
        };
      },
    };

    const client = new GscClient({
      tokens: dummyTokens,
      property: 'sc-domain:keytrends.ai',
      http,
      logger,
    });

    await client.querySearchAnalytics({
      startDate: '2026-08-01',
      endDate: '2026-08-28',
      type: 'WEB',
      dimensions: ['QUERY'],
      dimensionFilterGroups: [
        {
          groupType: 'AND',
          filters: [
            {
              dimension: 'QUERY',
              operator: 'CONTAINS',
              expression: 'seo',
            },
          ],
        },
      ],
    });

    expect(capturedBody.type).toBe('WEB');
    expect(capturedBody.dimensions).toEqual(['QUERY']);
    expect(capturedBody.dimensionFilterGroups[0].groupType).toBe('AND');
    expect(capturedBody.dimensionFilterGroups[0].filters[0].operator).toBe('CONTAINS');
  });
});
