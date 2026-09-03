import { mapGoogleError } from '../../models/errors.js';
export class GscClient {
    property;
    tokens;
    http;
    logger;
    constructor(opts) {
        this.tokens = opts.tokens;
        this.property = opts.property;
        this.http = opts.http;
        this.logger = opts.logger;
    }
    async request(url, method, body) {
        const token = await this.tokens.getAccessToken();
        const headers = {
            Authorization: `Bearer ${token}`,
        };
        let serializedBody;
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            serializedBody = JSON.stringify(body);
            this.logger.debug('GSC API Request body', { url, method, body });
        }
        else {
            this.logger.debug('GSC API Request', { url, method });
        }
        const resp = await this.http.request(url, {
            method,
            headers,
            body: serializedBody,
        });
        if (!resp.ok) {
            let parsedBody;
            try {
                parsedBody = JSON.parse(resp.text);
            }
            catch {
                parsedBody = { error: { message: resp.text } };
            }
            throw mapGoogleError(resp.status, parsedBody);
        }
        return resp.json();
    }
    async listSites() {
        const url = 'https://searchconsole.googleapis.com/webmasters/v3/sites';
        const resp = await this.request(url, 'GET');
        return resp.siteEntry ?? [];
    }
    async querySearchAnalytics(body) {
        const encodedProperty = encodeURIComponent(this.property);
        const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedProperty}/searchAnalytics/query`;
        return this.request(url, 'POST', body);
    }
    async listSitemaps(sitemapIndex) {
        const encodedProperty = encodeURIComponent(this.property);
        let url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedProperty}/sitemaps`;
        if (sitemapIndex) {
            url += `?sitemapIndex=${encodeURIComponent(sitemapIndex)}`;
        }
        const resp = await this.request(url, 'GET');
        return resp.sitemap ?? [];
    }
    async inspectUrl(inspectionUrl, languageCode) {
        const url = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
        const body = {
            inspectionUrl,
            siteUrl: this.property,
        };
        if (languageCode) {
            body.languageCode = languageCode;
        }
        return this.request(url, 'POST', body);
    }
}
//# sourceMappingURL=client.js.map