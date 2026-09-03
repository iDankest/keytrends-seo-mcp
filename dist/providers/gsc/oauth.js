import { KeytrendsError } from '../../models/errors.js';
export class RefreshTokenSource {
    creds;
    http;
    now;
    cachedToken = null;
    expiresAtMs = 0;
    inFlightPromise = null;
    constructor(creds, http, now = () => Date.now()) {
        this.creds = creds;
        this.http = http;
        this.now = now;
    }
    async getAccessToken() {
        const currentTime = this.now();
        if (this.cachedToken && currentTime < this.expiresAtMs - 60_000) {
            return this.cachedToken;
        }
        if (this.inFlightPromise) {
            return this.inFlightPromise;
        }
        this.inFlightPromise = this.refreshToken();
        try {
            return await this.inFlightPromise;
        }
        finally {
            this.inFlightPromise = null;
        }
    }
    async refreshToken() {
        const params = new URLSearchParams({
            client_id: this.creds.clientId,
            client_secret: this.creds.clientSecret,
            refresh_token: this.creds.refreshToken,
            grant_type: 'refresh_token',
        });
        const resp = await this.http.request('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });
        if (!resp.ok) {
            let desc = resp.text;
            try {
                const json = JSON.parse(resp.text);
                if (typeof json.error_description === 'string') {
                    desc = `${json.error}: ${json.error_description}`;
                }
                else if (typeof json.error === 'string') {
                    desc = json.error;
                }
            }
            catch {
                // use raw text
            }
            throw new KeytrendsError({
                code: 'AUTH_FAILED',
                message: `Fallo de autenticación OAuth de Google (${resp.status}): ${desc}`,
                hint: 'Regenera GOOGLE_REFRESH_TOKEN con scope https://www.googleapis.com/auth/webmasters.readonly',
                httpStatus: resp.status,
            });
        }
        const data = resp.json();
        if (!data.access_token) {
            throw new KeytrendsError({
                code: 'AUTH_FAILED',
                message: 'Google OAuth token endpoint did not return access_token',
                hint: 'Regenera GOOGLE_REFRESH_TOKEN con scope https://www.googleapis.com/auth/webmasters.readonly',
            });
        }
        const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
        this.cachedToken = data.access_token;
        this.expiresAtMs = this.now() + expiresInSec * 1000;
        return this.cachedToken;
    }
}
//# sourceMappingURL=oauth.js.map