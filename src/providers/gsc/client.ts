import { mapGoogleError } from '../../models/errors.js';
import type { HttpClient } from '../../utils/http.js';
import type { Logger } from '../../utils/logger.js';
import type { TokenSource } from './oauth.js';
import type {
  SearchAnalyticsQueryRequest,
  SearchAnalyticsQueryResponse,
  SitesListResponse,
  WmxSite,
  SitemapsListResponse,
  WmxSitemap,
  UrlInspectionResult,
} from './types.js';

export interface GscClientOptions {
  tokens: TokenSource;
  property: string;
  http: HttpClient;
  logger: Logger;
}

export class GscClient {
  readonly property: string;
  private readonly tokens: TokenSource;
  private readonly http: HttpClient;
  private readonly logger: Logger;

  constructor(opts: GscClientOptions) {
    this.tokens = opts.tokens;
    this.property = opts.property;
    this.http = opts.http;
    this.logger = opts.logger;
  }

  private async request<T>(
    url: string,
    method: 'GET' | 'POST',
    body?: unknown
  ): Promise<T> {
    const token = await this.tokens.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    let serializedBody: string | undefined;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      serializedBody = JSON.stringify(body);
      this.logger.debug('GSC API Request body', { url, method, body });
    } else {
      this.logger.debug('GSC API Request', { url, method });
    }

    const resp = await this.http.request(url, {
      method,
      headers,
      body: serializedBody,
    });

    if (!resp.ok) {
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(resp.text);
      } catch {
        parsedBody = { error: { message: resp.text } };
      }
      throw mapGoogleError(resp.status, parsedBody);
    }

    return resp.json<T>();
  }

  async listSites(): Promise<WmxSite[]> {
    const url = 'https://searchconsole.googleapis.com/webmasters/v3/sites';
    const resp = await this.request<SitesListResponse>(url, 'GET');
    return resp.siteEntry ?? [];
  }

  async querySearchAnalytics(
    body: SearchAnalyticsQueryRequest
  ): Promise<SearchAnalyticsQueryResponse> {
    const encodedProperty = encodeURIComponent(this.property);
    const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedProperty}/searchAnalytics/query`;
    return this.request<SearchAnalyticsQueryResponse>(url, 'POST', body);
  }

  async listSitemaps(sitemapIndex?: string): Promise<WmxSitemap[]> {
    const encodedProperty = encodeURIComponent(this.property);
    let url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedProperty}/sitemaps`;
    if (sitemapIndex) {
      url += `?sitemapIndex=${encodeURIComponent(sitemapIndex)}`;
    }
    const resp = await this.request<SitemapsListResponse>(url, 'GET');
    return resp.sitemap ?? [];
  }

  async inspectUrl(
    inspectionUrl: string,
    languageCode?: string
  ): Promise<UrlInspectionResult> {
    const url = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
    const body: { inspectionUrl: string; siteUrl: string; languageCode?: string } = {
      inspectionUrl,
      siteUrl: this.property,
    };
    if (languageCode) {
      body.languageCode = languageCode;
    }
    return this.request<UrlInspectionResult>(url, 'POST', body);
  }
}
