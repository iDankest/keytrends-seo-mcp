import { loadConfig, type ResolvedConfig } from './config/env.js';
import { KeytrendsError } from './models/errors.js';
import { resolveAiProvider, type AIVisibilityProvider } from './providers/ai/index.js';
import { GscClient } from './providers/gsc/client.js';
import { RefreshTokenSource } from './providers/gsc/oauth.js';
import { createHttpClient, type HttpClient } from './utils/http.js';
import { createLogger, type Logger } from './utils/logger.js';

export const PACKAGE_VERSION = '0.2.0';

export interface ToolContext {
  version: string;
  config: ResolvedConfig;
  missingEnv: string[];
  configWarnings: string[];
  http: HttpClient;
  logger: Logger;
  gsc: GscClient | null;
  ai: AIVisibilityProvider;
  now: () => Date;
}

export function buildContext(
  env: NodeJS.ProcessEnv = process.env,
  overrides?: Partial<ToolContext>
): ToolContext {
  const { config, missing, warnings } = loadConfig(env);
  const logger = overrides?.logger ?? createLogger(config.logLevel);
  const http =
    overrides?.http ??
    createHttpClient({
      timeoutMs: config.httpTimeoutMs,
      userAgent: `@keytrends/seo-mcp/${PACKAGE_VERSION}`,
      logger,
    });

  const now = overrides?.now ?? (() => new Date());

  let gsc: GscClient | null = null;
  if (overrides?.gsc !== undefined) {
    gsc = overrides.gsc;
  } else if (config.google && config.property) {
    const tokens = new RefreshTokenSource(config.google, http, () => now().getTime());
    gsc = new GscClient({
      tokens,
      property: config.property,
      http,
      logger,
    });
  }

  const ai = overrides?.ai ?? resolveAiProvider(config, { logger });

  const ctx: ToolContext = {
    version: overrides?.version ?? PACKAGE_VERSION,
    config: overrides?.config ?? config,
    missingEnv: overrides?.missingEnv ?? missing,
    configWarnings: overrides?.configWarnings ?? warnings,
    http,
    logger,
    gsc,
    ai,
    now,
  };

  return ctx;
}

export function requireGsc(ctx: ToolContext): GscClient {
  if (!ctx.gsc) {
    const missingList = ctx.missingEnv.length > 0 ? ctx.missingEnv.join(', ') : 'GSC_PROPERTY o credenciales';
    throw new KeytrendsError({
      code: 'MISSING_CONFIG',
      message: `Faltan variables de entorno requeridas para Google Search Console: ${missingList}`,
      hint: 'Configura GSC_PROPERTY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REFRESH_TOKEN en el entorno',
    });
  }
  return ctx.gsc;
}
