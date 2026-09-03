import type { ToolContext } from './context.js';
import { fetchSitemapGraph } from './providers/sitemap/fetcher.js';
import { resolveWindow } from './utils/dates.js';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface HealthCheckItem {
  id: string;
  status: CheckStatus;
  detail: string;
  latency_ms?: number;
}

export interface HealthReport {
  overall: CheckStatus;
  checks: HealthCheckItem[];
  config: {
    property: string | null;
    site_url: string | null;
    ai_provider: 'none' | 'gsc_export';
    env_present: {
      GSC_PROPERTY: boolean;
      GOOGLE_CLIENT_ID: boolean;
      GOOGLE_CLIENT_SECRET: boolean;
      GOOGLE_REFRESH_TOKEN: boolean;
    };
    missing_env: string[];
  };
  capabilities: {
    search_analytics: boolean;
    url_inspection: boolean;
    sitemaps_api: boolean;
    ai_visibility: 'unavailable_official' | 'export';
  };
  server: {
    version: string;
    node_version: string;
    transport: 'stdio';
  };
}

export async function runHealthcheck(
  ctx: ToolContext,
  opts: { deep: boolean }
): Promise<HealthReport> {
  const checks: HealthCheckItem[] = [];

  const envPresent = {
    GSC_PROPERTY: Boolean(ctx.config.property),
    GOOGLE_CLIENT_ID: Boolean(ctx.config.google?.clientId),
    GOOGLE_CLIENT_SECRET: Boolean(ctx.config.google?.clientSecret),
    GOOGLE_REFRESH_TOKEN: Boolean(ctx.config.google?.refreshToken),
  };

  const missingEnv = ctx.missingEnv;

  // 1. env_config check
  if (missingEnv.length > 0) {
    checks.push({
      id: 'env_config',
      status: 'fail',
      detail: `Faltan variables de entorno requeridas: ${missingEnv.join(', ')}`,
    });
  } else {
    checks.push({
      id: 'env_config',
      status: 'pass',
      detail: 'Todas las variables de entorno requeridas están presentes',
    });
  }

  let searchAnalyticsOk = false;

  if (opts.deep) {
    if (missingEnv.length > 0 || !ctx.gsc) {
      checks.push({
        id: 'oauth_token',
        status: 'fail',
        detail: 'Omitido: faltan credenciales de Google OAuth',
      });
      checks.push({
        id: 'gsc_property_access',
        status: 'fail',
        detail: 'Omitido: falta cliente GSC o credenciales',
      });
      checks.push({
        id: 'search_analytics_probe',
        status: 'fail',
        detail: 'Omitido: falta cliente GSC o credenciales',
      });
    } else {
      // 2. oauth_token check
      const oauthStart = Date.now();
      try {
        await ctx.gsc.listSites(); // Triggers token acquisition
        checks.push({
          id: 'oauth_token',
          status: 'pass',
          detail: 'Token de acceso OAuth2 obtenido correctamente',
          latency_ms: Date.now() - oauthStart,
        });
      } catch (err: unknown) {
        checks.push({
          id: 'oauth_token',
          status: 'fail',
          detail: `Fallo al obtener token OAuth: ${err instanceof Error ? err.message : String(err)}`,
          latency_ms: Date.now() - oauthStart,
        });
      }

      // 3. gsc_property_access check
      const propStart = Date.now();
      try {
        const sites = await ctx.gsc.listSites();
        const configuredProp = ctx.config.property!;
        const match = sites.find(
          (s) =>
            s.siteUrl === configuredProp ||
            s.siteUrl.toLowerCase() === configuredProp.toLowerCase() ||
            encodeURIComponent(s.siteUrl) === encodeURIComponent(configuredProp)
        );

        if (match) {
          checks.push({
            id: 'gsc_property_access',
            status: 'pass',
            detail: `Propiedad accesible con nivel de permiso: ${match.permissionLevel}`,
            latency_ms: Date.now() - propStart,
          });
        } else {
          const available = sites.map((s) => s.siteUrl).join(', ') || 'ninguna';
          checks.push({
            id: 'gsc_property_access',
            status: 'fail',
            detail: `Propiedad '${configuredProp}' no encontrada en la cuenta de Google. Propiedades disponibles: [${available}]`,
            latency_ms: Date.now() - propStart,
          });
        }
      } catch (err: unknown) {
        checks.push({
          id: 'gsc_property_access',
          status: 'fail',
          detail: `Fallo al verificar acceso a propiedad: ${err instanceof Error ? err.message : String(err)}`,
          latency_ms: Date.now() - propStart,
        });
      }

      // 4. search_analytics_probe check
      const saStart = Date.now();
      try {
        const window = resolveWindow({ range: '7d', now: ctx.now() });
        await ctx.gsc.querySearchAnalytics({
          startDate: window.start_date,
          endDate: window.end_date,
          dimensions: ['DATE'],
          type: 'WEB',
          rowLimit: 1,
        });
        searchAnalyticsOk = true;
        checks.push({
          id: 'search_analytics_probe',
          status: 'pass',
          detail: 'Consulta de prueba Search Analytics ejecutada correctamente',
          latency_ms: Date.now() - saStart,
        });
      } catch (err: unknown) {
        checks.push({
          id: 'search_analytics_probe',
          status: 'fail',
          detail: `Fallo en consulta de prueba Search Analytics: ${err instanceof Error ? err.message : String(err)}`,
          latency_ms: Date.now() - saStart,
        });
      }
    }

    // 5. sitemap_reachable check
    const sitemapTarget = ctx.config.siteUrl;
    if (sitemapTarget) {
      const smStart = Date.now();
      try {
        const graph = await fetchSitemapGraph({
          siteUrl: sitemapTarget,
          sitemapUrl: ctx.config.sitemapUrl,
          http: ctx.http,
          maxSubSitemaps: 1,
          collectUrls: false,
        });
        if (graph.entrypoint) {
          checks.push({
            id: 'sitemap_reachable',
            status: 'pass',
            detail: `Entrypoint de sitemap detectado: ${graph.entrypoint} (${graph.total_urls} URLs estimadas)`,
            latency_ms: Date.now() - smStart,
          });
        } else {
          checks.push({
            id: 'sitemap_reachable',
            status: 'warn',
            detail: `No se detectó sitemap accesible en ${sitemapTarget}. Candidatos probados: ${graph.candidates_tried.join(', ')}`,
            latency_ms: Date.now() - smStart,
          });
        }
      } catch (err: unknown) {
        checks.push({
          id: 'sitemap_reachable',
          status: 'warn',
          detail: `Error al comprobar sitemap: ${err instanceof Error ? err.message : String(err)}`,
          latency_ms: Date.now() - smStart,
        });
      }
    } else {
      checks.push({
        id: 'sitemap_reachable',
        status: 'warn',
        detail: 'No se pudo derivar KEYTRENDS_SITE_URL para comprobar el sitemap',
      });
    }

    // 6. ai_provider check
    if (ctx.ai.id === 'gsc_export') {
      checks.push({
        id: 'ai_provider',
        status: 'pass',
        detail: `Provider de IA gsc_export activo con directorio ${ctx.config.aiExportDir}`,
      });
    } else {
      checks.push({
        id: 'ai_provider',
        status: 'warn',
        detail:
          'Provider de IA none: la API oficial de Google Search Console v1 no expone métricas de IA generativa (revisión 20260902). Activable mediante exportación CSV desde la UI con KEYTRENDS_AI_EXPORT_DIR.',
      });
    }
  }

  let overall: CheckStatus = 'pass';
  if (checks.some((c) => c.status === 'fail')) {
    overall = 'fail';
  } else if (checks.some((c) => c.status === 'warn')) {
    overall = 'warn';
  }

  return {
    overall,
    checks,
    config: {
      property: ctx.config.property,
      site_url: ctx.config.siteUrl,
      ai_provider: ctx.ai.id,
      env_present: envPresent,
      missing_env: missingEnv,
    },
    capabilities: {
      search_analytics: searchAnalyticsOk || (!opts.deep && Boolean(ctx.gsc)),
      url_inspection: Boolean(ctx.gsc),
      sitemaps_api: Boolean(ctx.gsc),
      ai_visibility: ctx.ai.id === 'gsc_export' ? 'export' : 'unavailable_official',
    },
    server: {
      version: ctx.version,
      node_version: process.version,
      transport: 'stdio',
    },
  };
}
