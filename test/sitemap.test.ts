import { describe, expect, it } from 'vitest';
import { fetchSitemapGraph } from '../src/providers/sitemap/fetcher.js';
import type { HttpClient, HttpResponse } from '../src/utils/http.js';

function createStubHttp(routes: Record<string, { status: number; text: string }>): HttpClient {
  return {
    async request(url: string): Promise<HttpResponse> {
      const matched = routes[url];
      if (!matched) {
        return {
          status: 404,
          ok: false,
          headers: new Headers(),
          text: 'Not found',
          json<T>() {
            throw new Error('Not found');
          },
        };
      }
      return {
        status: matched.status,
        ok: matched.status >= 200 && matched.status < 300,
        headers: new Headers(),
        text: matched.text,
        json<T>() {
          return JSON.parse(matched.text) as T;
        },
      };
    },
  };
}

describe('providers/sitemap/fetcher', () => {
  it('handles sitemap index with 2 child sitemaps', async () => {
    const http = createStubHttp({
      'https://keytrends.ai/robots.txt': { status: 404, text: '' },
      'https://keytrends.ai/sitemap_index.xml': {
        status: 200,
        text: `<sitemapindex>
          <sitemap><loc>https://keytrends.ai/post-sitemap.xml</loc></sitemap>
          <sitemap><loc>https://keytrends.ai/page-sitemap.xml</loc></sitemap>
        </sitemapindex>`,
      },
      'https://keytrends.ai/post-sitemap.xml': {
        status: 200,
        text: `<urlset>
          <url><loc>https://keytrends.ai/post-1</loc></url>
          <url><loc>https://keytrends.ai/post-2</loc></url>
        </urlset>`,
      },
      'https://keytrends.ai/page-sitemap.xml': {
        status: 200,
        text: `<urlset>
          <url><loc>https://keytrends.ai/about</loc></url>
        </urlset>`,
      },
    });

    const graph = await fetchSitemapGraph({
      siteUrl: 'https://keytrends.ai/',
      http,
      maxSubSitemaps: 10,
      collectUrls: true,
    });

    expect(graph.entrypoint).toBe('https://keytrends.ai/sitemap_index.xml');
    expect(graph.sub_sitemaps).toHaveLength(2);
    expect(graph.total_urls).toBe(3);
    expect(graph.urls).toEqual([
      'https://keytrends.ai/post-1',
      'https://keytrends.ai/post-2',
      'https://keytrends.ai/about',
    ]);
  });

  it('falls back to sitemap.xml when sitemap_index.xml is 404', async () => {
    const http = createStubHttp({
      'https://keytrends.ai/robots.txt': { status: 404, text: '' },
      'https://keytrends.ai/sitemap_index.xml': { status: 404, text: 'Not found' },
      'https://keytrends.ai/sitemap.xml': {
        status: 200,
        text: `<urlset><url><loc>https://keytrends.ai/home</loc></url></urlset>`,
      },
    });

    const graph = await fetchSitemapGraph({
      siteUrl: 'https://keytrends.ai/',
      http,
      maxSubSitemaps: 10,
      collectUrls: true,
    });

    expect(graph.entrypoint).toBe('https://keytrends.ai/sitemap.xml');
    expect(graph.total_urls).toBe(1);
    expect(graph.urls).toEqual(['https://keytrends.ai/home']);
  });

  it('falls back to robots.txt Sitemap: directive when standard paths 404', async () => {
    const http = createStubHttp({
      'https://keytrends.ai/robots.txt': {
        status: 200,
        text: `User-agent: *\nSitemap: https://keytrends.ai/custom-sitemap.xml`,
      },
      'https://keytrends.ai/sitemap_index.xml': { status: 404, text: '' },
      'https://keytrends.ai/sitemap.xml': { status: 404, text: '' },
      'https://keytrends.ai/custom-sitemap.xml': {
        status: 200,
        text: `<urlset><url><loc>https://keytrends.ai/custom-page</loc></url></urlset>`,
      },
    });

    const graph = await fetchSitemapGraph({
      siteUrl: 'https://keytrends.ai/',
      http,
      maxSubSitemaps: 10,
      collectUrls: true,
    });

    expect(graph.entrypoint).toBe('https://keytrends.ai/custom-sitemap.xml');
    expect(graph.total_urls).toBe(1);
    expect(graph.urls).toEqual(['https://keytrends.ai/custom-page']);
  });

  it('handles child sitemap with HTTP 500 error gracefully', async () => {
    const http = createStubHttp({
      'https://keytrends.ai/robots.txt': { status: 404, text: '' },
      'https://keytrends.ai/sitemap_index.xml': {
        status: 200,
        text: `<sitemapindex>
          <sitemap><loc>https://keytrends.ai/ok-sitemap.xml</loc></sitemap>
          <sitemap><loc>https://keytrends.ai/error-sitemap.xml</loc></sitemap>
        </sitemapindex>`,
      },
      'https://keytrends.ai/ok-sitemap.xml': {
        status: 200,
        text: `<urlset><url><loc>https://keytrends.ai/ok</loc></url></urlset>`,
      },
      'https://keytrends.ai/error-sitemap.xml': {
        status: 500,
        text: 'Internal Server Error',
      },
    });

    const graph = await fetchSitemapGraph({
      siteUrl: 'https://keytrends.ai/',
      http,
      maxSubSitemaps: 10,
      collectUrls: true,
    });

    expect(graph.sub_sitemaps).toHaveLength(2);
    const errSub = graph.sub_sitemaps.find((s) => s.url.includes('error-sitemap'));
    expect(errSub?.status).toBe('error');
    expect(graph.total_urls).toBe(1);
    expect(graph.errors.length).toBeGreaterThan(0);
  });
});
