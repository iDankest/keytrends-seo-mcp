import { loadConfig } from './config/env.js';
import { KeytrendsError } from './models/errors.js';
import { resolveAiProvider } from './providers/ai/index.js';
import { GscClient } from './providers/gsc/client.js';
import { RefreshTokenSource } from './providers/gsc/oauth.js';
import { createHttpClient } from './utils/http.js';
import { createLogger } from './utils/logger.js';
export const PACKAGE_VERSION = '0.2.0';
export function buildContext(env = process.env, overrides) {
    const { config, missing, warnings } = loadConfig(env);
    const logger = overrides?.logger ?? createLogger(config.logLevel);
    const http = overrides?.http ??
        createHttpClient({
            timeoutMs: config.httpTimeoutMs,
            userAgent: `@keytrends/seo-mcp/${PACKAGE_VERSION}`,
            logger,
        });
    const now = overrides?.now ?? (() => new Date());
    let gsc = null;
    if (overrides?.gsc !== undefined) {
        gsc = overrides.gsc;
    }
    else if (config.google && config.property) {
        const tokens = new RefreshTokenSource(config.google, http, () => now().getTime());
        gsc = new GscClient({
            tokens,
            property: config.property,
            http,
            logger,
        });
    }
    const ai = overrides?.ai ?? resolveAiProvider(config, { logger });
    const ctx = {
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
export function requireGsc(ctx) {
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
//# sourceMappingURL=context.js.map