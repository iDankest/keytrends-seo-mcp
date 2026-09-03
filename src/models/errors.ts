export type ErrorCode =
  | 'MISSING_CONFIG'
  | 'AUTH_FAILED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'INVALID_ARGUMENT'
  | 'UPSTREAM_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'NOT_AVAILABLE';

export class KeytrendsError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;
  readonly httpStatus?: number;
  readonly googleStatus?: string;

  constructor(opts: {
    code: ErrorCode;
    message: string;
    hint?: string;
    httpStatus?: number;
    googleStatus?: string;
    cause?: unknown;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = 'KeytrendsError';
    this.code = opts.code;
    this.hint = opts.hint;
    this.httpStatus = opts.httpStatus;
    this.googleStatus = opts.googleStatus;
  }
}

export function mapGoogleError(httpStatus: number, body: unknown): KeytrendsError {
  let message = `Google API returned HTTP ${httpStatus}`;
  let googleStatus: string | undefined;
  let reason: string | undefined;

  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    if (typeof b.error === 'object' && b.error !== null) {
      const errObj = b.error as Record<string, unknown>;
      if (typeof errObj.message === 'string') {
        message = errObj.message;
      }
      if (typeof errObj.status === 'string') {
        googleStatus = errObj.status;
      }
      if (Array.isArray(errObj.errors) && errObj.errors.length > 0) {
        const firstErr = errObj.errors[0] as Record<string, unknown>;
        if (typeof firstErr?.reason === 'string') {
          reason = firstErr.reason;
        }
      }
    }
  }

  let code: ErrorCode = 'UPSTREAM_ERROR';
  let hint: string | undefined;

  if (httpStatus === 400) {
    code = 'INVALID_ARGUMENT';
  } else if (httpStatus === 401) {
    code = 'AUTH_FAILED';
    hint = 'Regenera GOOGLE_REFRESH_TOKEN con scope https://www.googleapis.com/auth/webmasters.readonly';
  } else if (httpStatus === 403) {
    code = 'PERMISSION_DENIED';
    hint = 'Añade la cuenta como usuario de la propiedad en GSC';
  } else if (httpStatus === 404) {
    code = 'INVALID_ARGUMENT';
    hint = 'GSC_PROPERTY no existe o el formato no coincide: usa `sc-domain:dominio` o la URL con barra final';
  } else if (
    httpStatus === 429 ||
    reason === 'rateLimitExceeded' ||
    reason === 'userRateLimitExceeded' ||
    reason === 'quotaExceeded'
  ) {
    code = 'RATE_LIMITED';
    hint = 'Se ha superado la cuota de Google Search Console; reintenta más tarde';
  } else if (httpStatus >= 500) {
    code = 'UPSTREAM_ERROR';
  }

  return new KeytrendsError({
    code,
    message,
    hint,
    httpStatus,
    googleStatus,
  });
}
