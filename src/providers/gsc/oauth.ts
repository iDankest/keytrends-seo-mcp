import { KeytrendsError } from '../../models/errors.js';
import type { HttpClient } from '../../utils/http.js';

export interface TokenSource {
  getAccessToken(): Promise<string>;
}

export interface GoogleOAuthCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export class RefreshTokenSource implements TokenSource {
  private readonly creds: GoogleOAuthCredentials;
  private readonly http: HttpClient;
  private readonly now: () => number;
  private cachedToken: string | null = null;
  private expiresAtMs = 0;
  private inFlightPromise: Promise<string> | null = null;

  constructor(
    creds: GoogleOAuthCredentials,
    http: HttpClient,
    now: () => number = () => Date.now()
  ) {
    this.creds = creds;
    this.http = http;
    this.now = now;
  }

  async getAccessToken(): Promise<string> {
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
    } finally {
      this.inFlightPromise = null;
    }
  }

  private async refreshToken(): Promise<string> {
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
        const json = JSON.parse(resp.text) as Record<string, unknown>;
        if (typeof json.error_description === 'string') {
          desc = `${json.error}: ${json.error_description}`;
        } else if (typeof json.error === 'string') {
          desc = json.error;
        }
      } catch {
        // use raw text
      }

      throw new KeytrendsError({
        code: 'AUTH_FAILED',
        message: `Fallo de autenticación OAuth de Google (${resp.status}): ${desc}`,
        hint: 'Regenera GOOGLE_REFRESH_TOKEN con scope https://www.googleapis.com/auth/webmasters.readonly',
        httpStatus: resp.status,
      });
    }

    interface OAuthSuccess {
      access_token: string;
      expires_in: number;
      token_type?: string;
    }

    const data = resp.json<OAuthSuccess>();
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
