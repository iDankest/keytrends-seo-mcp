import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import {
  classifyCsvName,
  GscExportAiVisibilityProvider,
} from '../src/providers/ai/gsc-export.js';
import type { HttpClient, HttpResponse } from '../src/utils/http.js';
import type { RequestOptions } from '../src/utils/http.js';
import { createLogger } from '../src/utils/logger.js';

/** Doble de HttpClient que sirve contenido estático por URL y registra las peticiones. */
function fakeHttpClient(
  routes: Record<string, { status?: number; text?: string; headers?: Record<string, string> } | undefined>,
  errors: Record<string, Error> = {}
): HttpClient & { calls: Array<{ url: string; headers: Record<string, string> }> } {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const api = {
    calls,
    async request(url: string, init?: RequestOptions): Promise<HttpResponse> {
      calls.push({ url, headers: init?.headers ?? {} });
      if (errors[url]) throw errors[url];
      const route = routes[url];
      const status = route?.status ?? 200;
      const text = route?.text ?? '';
      return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers(route?.headers ?? {}),
        text,
        json: () => JSON.parse(text),
      };
    },
  };
  return api as unknown as HttpClient & { calls: typeof calls };
}

function providerFor(
  routes: Parameters<typeof fakeHttpClient>[0],
  opts: { token?: string | null; errors?: Record<string, Error> } = {}
) {
  const client = fakeHttpClient(routes, opts.errors);
  const provider = GscExportAiVisibilityProvider.fromUrls(Object.keys(routes), {
    token: opts.token ?? null,
    timeoutMs: 1000,
    logger: createLogger('silent'),
    httpClient: client,
  });
  return { provider, client };
}

const WINDOW = { start_date: '2026-08-01', end_date: '2026-08-05' };

describe('providers/ai/gsc-export (modo URL)', () => {
  const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));
  let datesCsv = '';
  let pagesCsv = '';

  beforeAll(async () => {
    datesCsv = await readFile(`${fixturesDir}/ai-search-dates.csv`, 'utf8');
    pagesCsv = await readFile(`${fixturesDir}/ai-search-pages-es.csv`, 'utf8');
  });

  it('descarga dates+pages por URL y calcula el resumen completo', async () => {
    const { provider, client } = providerFor({
      'https://example.org/exports/search-ai-dates.csv': { text: datesCsv },
      'https://example.org/exports/search-ai-pages.csv': { text: pagesCsv },
    });

    const summary = await provider.getSummary({ window: WINDOW, surface: 'SEARCH' });

    expect(summary.available).toBe(true);
    expect(summary.surface).toBe('SEARCH');
    // Dates: 150+200+300+250+400 = 1300
    expect(summary.impressions?.value).toBe(1300);
    expect(summary.pages_count?.value).toBe(3);
    expect(summary.coverage?.first_date).toBe('2026-08-01');
    expect(summary.coverage?.last_date).toBe('2026-08-05');
    expect(summary.provenance.source).toBe('google_search_console_ui_export');
    expect(client.calls).toHaveLength(2);
  });

  it('getPages y getTimeseries leen del contenido remoto', async () => {
    const { provider } = providerFor({
      'https://example.org/exports/search-ai-dates.csv': { text: datesCsv },
      'https://example.org/exports/search-ai-pages.csv': { text: pagesCsv },
    });

    const pages = await provider.getPages({ window: WINDOW, surface: 'SEARCH', limit: 25 });
    expect(pages.available).toBe(true);
    expect(pages.rows[0]).toEqual({ page: 'https://keytrends.ai/', impressions: 1234 });

    const ts = await provider.getTimeseries({
      window: WINDOW,
      surface: 'SEARCH',
      granularity: 'DAY',
    });
    expect(ts.available).toBe(true);
    expect(ts.points).toHaveLength(5);
    expect(ts.points[0]).toEqual({ date: '2026-08-01', impressions: 150 });
  });

  it('todas las URLs responden 401 → available: false con HTTP 401 en el reason', async () => {
    const { provider } = providerFor({
      'https://example.org/exports/search-ai-dates.csv': { status: 401, text: 'Unauthorized' },
      'https://example.org/exports/search-ai-pages.csv': { status: 401, text: 'Unauthorized' },
    });

    const summary = await provider.getSummary({ window: WINDOW, surface: 'SEARCH' });

    expect(summary.available).toBe(false);
    expect(summary.reason).toContain('HTTP 401');
    expect(summary.reason).toContain('KEYTRENDS_AI_EXPORT_URL');
    expect(summary.provenance.source).toBe('google_search_console_ui_export');
  });

  it('envía Authorization: Bearer <token> cuando hay token', async () => {
    const { provider, client } = providerFor(
      {
        'https://example.org/exports/search-ai-dates.csv': { text: datesCsv },
        'https://example.org/exports/search-ai-pages.csv': { text: pagesCsv },
      },
      { token: 'github_pat_token123' }
    );

    await provider.getSummary({ window: WINDOW, surface: 'SEARCH' });

    expect(client.calls.length).toBeGreaterThan(0);
    for (const call of client.calls) {
      expect(call.headers['Authorization']).toBe('Bearer github_pat_token123');
    }
  });

  it('sin token no envía cabecera Authorization', async () => {
    const { provider, client } = providerFor({
      'https://example.org/exports/search-ai-dates.csv': { text: datesCsv },
    });

    await provider.getSummary({ window: WINDOW, surface: 'SEARCH' });
    expect(client.calls[0]?.headers['Authorization']).toBeUndefined();
  });

  it('Last-Modified presente → se refleja en notes; ausente → sin nota de antigüedad', async () => {
    const withDate = providerFor({
      'https://example.org/exports/search-ai-dates.csv': {
        text: datesCsv,
        headers: { 'Last-Modified': 'Tue, 01 Sep 2026 10:00:00 GMT' },
      },
    });
    const summaryWith = await withDate.provider.getSummary({ window: WINDOW, surface: 'SEARCH' });
    expect(summaryWith.provenance.notes).toContain('2026-09-01T10:00:00.000Z');
    expect(summaryWith.provenance.notes).toContain('search-ai-dates.csv');

    const withoutDate = providerFor({
      'https://example.org/exports/search-ai-dates.csv': { text: datesCsv },
    });
    const summaryWithout = await withoutDate.provider.getSummary({
      window: WINDOW,
      surface: 'SEARCH',
    });
    expect(summaryWithout.provenance.notes).not.toContain('antigüedad');
    expect(summaryWithout.provenance.notes).toContain('search-ai-dates.csv');
  });

  it('fallos parciales: sigue con las descargadas y añade nota de URLs fallidas', async () => {
    const { provider } = providerFor({
      'https://example.org/exports/search-ai-dates.csv': { text: datesCsv },
      'https://example.org/exports/search-ai-pages.csv': { status: 500, text: 'boom' },
    });

    const summary = await provider.getSummary({ window: WINDOW, surface: 'SEARCH' });

    expect(summary.available).toBe(true);
    expect(summary.impressions?.value).toBe(1300);
    expect(summary.provenance.notes).toContain('URLs fallidas');
    expect(summary.provenance.notes).toContain('HTTP 500');
  });

  it('export con fecha >30 días → nota de antigüedad en provenance.notes', async () => {
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toUTCString();
    const { provider } = providerFor({
      'https://example.org/exports/search-ai-dates.csv': {
        text: datesCsv,
        headers: { 'Last-Modified': oldDate },
      },
    });

    const summary = await provider.getSummary({ window: WINDOW, surface: 'SEARCH' });
    expect(summary.provenance.notes).toContain('antigüedad ≥30 días');
    expect(summary.provenance.notes).toContain('scripts/publish-ai-export.mjs');
  });

  it('CSV remoto demasiado grande (>10 MB) se descarta como fallido', async () => {
    const { provider } = providerFor({
      'https://example.org/exports/search-ai-dates.csv': {
        text: 'x'.repeat(10 * 1024 * 1024 + 1),
      },
    });

    const summary = await provider.getSummary({ window: WINDOW, surface: 'SEARCH' });
    expect(summary.available).toBe(false);
    expect(summary.reason).toContain('demasiado grande');
  });

  it('excepción de red en todas las URLs → available: false sin throw', async () => {
    const { provider } = providerFor(
      { 'https://example.org/exports/search-ai-dates.csv': undefined },
      { errors: { 'https://example.org/exports/search-ai-dates.csv': new Error('ECONNREFUSED') } }
    );

    const summary = await provider.getSummary({ window: WINDOW, surface: 'SEARCH' });
    expect(summary.available).toBe(false);
    expect(summary.reason).toContain('ECONNREFUSED');
  });
});

describe('classifyCsvName', () => {
  it('clasifica por nombre canónico', () => {
    expect(classifyCsvName('search-ai-dates.csv')).toEqual({ surface: 'SEARCH', dimension: 'date' });
    expect(classifyCsvName('discover-ai-pages.csv')).toEqual({ surface: 'DISCOVER', dimension: 'page' });
    expect(classifyCsvName('discover-ai-dates.csv')).toEqual({ surface: 'DISCOVER', dimension: 'date' });
    expect(classifyCsvName('foo.csv')).toEqual({ surface: 'SEARCH', dimension: 'unknown' });
  });
});

describe('loadConfig (KEYTRENDS_AI_EXPORT_URL/TOKEN)', () => {
  it('URL válida + inválida mezcladas → 1 URL y 1 warning; token recortado', () => {
    const { config, warnings } = loadConfig({
      KEYTRENDS_AI_EXPORT_URL:
        ' https://raw.githubusercontent.com/iDankest/keytrends-gsc-ai-exports/main/exports/search-ai-dates.csv , no-es-url , https://ok.example/x.csv ',
      KEYTRENDS_AI_EXPORT_TOKEN: '  github_pat_abc  ',
    } as NodeJS.ProcessEnv);

    expect(config.aiExportUrls).toEqual([
      'https://raw.githubusercontent.com/iDankest/keytrends-gsc-ai-exports/main/exports/search-ai-dates.csv',
      'https://ok.example/x.csv',
    ]);
    expect(config.aiExportToken).toBe('github_pat_abc');
    expect(warnings.filter((w) => w.includes('KEYTRENDS_AI_EXPORT_URL'))).toHaveLength(1);
    expect(warnings[0]).toContain('no-es-url');
  });

  it('sin variables → lista vacía y token null sin warnings', () => {
    const { config, warnings } = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.aiExportUrls).toEqual([]);
    expect(config.aiExportToken).toBeNull();
    expect(warnings.filter((w) => w.includes('KEYTRENDS_AI_EXPORT'))).toHaveLength(0);
  });
});
