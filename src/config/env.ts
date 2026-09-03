import { z } from 'zod';
import type { LogLevel } from '../utils/logger.js';

export interface ResolvedConfig {
  property: string | null;
  siteUrl: string | null; // siempre con barra final
  sitemapUrl: string | null;
  google: { clientId: string; clientSecret: string; refreshToken: string } | null;
  aiExportDir: string | null;
  aiProviderMode: 'auto' | 'none' | 'gsc_export';
  aiExportUrls: string[];
  aiExportToken: string | null;
  logLevel: LogLevel;
  httpTimeoutMs: number;
  maxInspectUrls: number;
}

export interface ConfigLoadResult {
  config: ResolvedConfig;
  missing: string[];
  warnings: string[];
}

const LogLevelSchema = z.enum(['silent', 'error', 'warn', 'info', 'debug']);
const AiProviderModeSchema = z.enum(['auto', 'none', 'gsc_export']);

export function normalizeUrlWithTrailingSlash(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    let href = parsed.href;
    if (!href.endsWith('/')) {
      href += '/';
    }
    return href;
  } catch {
    return rawUrl.endsWith('/') ? rawUrl : `${rawUrl}/`;
  }
}

export function deriveSiteUrl(property: string | null, explicitSiteUrl?: string | null): string | null {
  if (explicitSiteUrl && explicitSiteUrl.trim().length > 0) {
    return normalizeUrlWithTrailingSlash(explicitSiteUrl.trim());
  }

  if (!property) {
    return null;
  }

  const trimmed = property.trim();
  if (trimmed.startsWith('sc-domain:')) {
    const domain = trimmed.slice('sc-domain:'.length);
    return `https://${domain}/`;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      return `${url.origin}/`;
    } catch {
      return normalizeUrlWithTrailingSlash(trimmed);
    }
  }

  return null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ConfigLoadResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  const rawProperty = env.GSC_PROPERTY?.trim() || null;
  const clientId = env.GOOGLE_CLIENT_ID?.trim() || null;
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() || null;
  const refreshToken = env.GOOGLE_REFRESH_TOKEN?.trim() || null;

  if (!rawProperty) {
    missing.push('GSC_PROPERTY');
  } else {
    if (
      !rawProperty.startsWith('sc-domain:') &&
      !rawProperty.startsWith('http://') &&
      !rawProperty.startsWith('https://')
    ) {
      warnings.push(
        `GSC_PROPERTY ('${rawProperty}') no comienza con 'sc-domain:' ni 'https://'; Google podría rechazarla con 404.`
      );
    }
  }

  if (!clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!refreshToken) missing.push('GOOGLE_REFRESH_TOKEN');

  const google =
    clientId && clientSecret && refreshToken
      ? { clientId, clientSecret, refreshToken }
      : null;

  const siteUrl = deriveSiteUrl(rawProperty, env.KEYTRENDS_SITE_URL);
  const sitemapUrl = env.KEYTRENDS_SITEMAP_URL?.trim() || null;
  const aiExportUrls: string[] = [];
  const rawAiExportUrls = env.KEYTRENDS_AI_EXPORT_URL?.trim();
  if (rawAiExportUrls) {
    for (const part of rawAiExportUrls.split(',')) {
      const url = part.trim();
      if (!url) continue;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        aiExportUrls.push(url);
      } else {
        warnings.push(`KEYTRENDS_AI_EXPORT_URL contiene una URL inválida ('${url}'); ignorada.`);
      }
    }
  }
  const aiExportToken = env.KEYTRENDS_AI_EXPORT_TOKEN?.trim() || null;
  const aiExportDir = env.KEYTRENDS_AI_EXPORT_DIR?.trim() || null;

  let logLevel: LogLevel = 'info';
  if (env.KEYTRENDS_LOG_LEVEL) {
    const parsedLogLevel = LogLevelSchema.safeParse(env.KEYTRENDS_LOG_LEVEL.trim().toLowerCase());
    if (parsedLogLevel.success) {
      logLevel = parsedLogLevel.data;
    } else {
      warnings.push(
        `KEYTRENDS_LOG_LEVEL inválido ('${env.KEYTRENDS_LOG_LEVEL}'); usando default 'info'.`
      );
    }
  }

  let aiProviderMode: 'auto' | 'none' | 'gsc_export' = 'auto';
  if (env.KEYTRENDS_AI_PROVIDER) {
    const parsedAiMode = AiProviderModeSchema.safeParse(env.KEYTRENDS_AI_PROVIDER.trim().toLowerCase());
    if (parsedAiMode.success) {
      aiProviderMode = parsedAiMode.data;
    } else {
      warnings.push(
        `KEYTRENDS_AI_PROVIDER inválido ('${env.KEYTRENDS_AI_PROVIDER}'); usando default 'auto'.`
      );
    }
  }

  let httpTimeoutMs = 20000;
  if (env.KEYTRENDS_HTTP_TIMEOUT_MS) {
    const parsedTimeout = parseInt(env.KEYTRENDS_HTTP_TIMEOUT_MS.trim(), 10);
    if (!isNaN(parsedTimeout) && parsedTimeout > 0) {
      httpTimeoutMs = parsedTimeout;
    } else {
      warnings.push(
        `KEYTRENDS_HTTP_TIMEOUT_MS no numérico o inválido ('${env.KEYTRENDS_HTTP_TIMEOUT_MS}'); usando default 20000ms.`
      );
    }
  }

  let maxInspectUrls = 50;
  if (env.KEYTRENDS_MAX_INSPECT_URLS) {
    const parsedMax = parseInt(env.KEYTRENDS_MAX_INSPECT_URLS.trim(), 10);
    if (!isNaN(parsedMax) && parsedMax > 0) {
      maxInspectUrls = parsedMax;
    } else {
      warnings.push(
        `KEYTRENDS_MAX_INSPECT_URLS no numérico o inválido ('${env.KEYTRENDS_MAX_INSPECT_URLS}'); usando default 50.`
      );
    }
  }

  const config: ResolvedConfig = {
    property: rawProperty,
    siteUrl,
    sitemapUrl,
    google,
    aiProviderMode,
    aiExportDir,
    aiExportUrls,
    aiExportToken,
    logLevel,
    httpTimeoutMs,
    maxInspectUrls,
  };

  return { config, missing, warnings };
}
