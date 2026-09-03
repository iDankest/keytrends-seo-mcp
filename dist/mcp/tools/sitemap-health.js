import { z } from 'zod';
import { DERIVED, FIRST_PARTY_FETCH, measured, OFFICIAL_GSC, } from '../../models/provenance.js';
import { fetchSitemapGraph, } from '../../providers/sitemap/fetcher.js';
import { registerJsonTool } from '../wrap.js';
export function registerSitemapHealthTool(server, ctx) {
    registerJsonTool(server, ctx, {
        name: 'keytrends_get_sitemap_health',
        title: 'Salud del sitemap y contraste con Google Search Console',
        description: 'Compara los sitemaps declarados en Google Search Console con los accesibles en vivo en el sitio web (live fetch) y calcula discrepancias.',
        inputSchema: {
            include_urls: z
                .boolean()
                .default(false)
                .describe('Si es true, incluye el listado completo de URLs recolectadas en el sitemap vivo.'),
            max_sub_sitemaps: z
                .number()
                .int()
                .min(1)
                .max(200)
                .default(50)
                .describe('Número máximo de sub-sitemaps hijos a explorar en índices.'),
        },
        annotations: {
            readOnlyHint: true,
            openWorldHint: true,
        },
    }, async (args, currentCtx) => {
        const warnings = [];
        const siteUrl = currentCtx.config.siteUrl ?? '';
        const liveSitemap = await fetchSitemapGraph({
            siteUrl,
            sitemapUrl: currentCtx.config.sitemapUrl,
            http: currentCtx.http,
            maxSubSitemaps: args.max_sub_sitemaps,
            collectUrls: args.include_urls,
        });
        let gscSitemapsList;
        if (currentCtx.gsc) {
            try {
                const apiSitemaps = await currentCtx.gsc.listSitemaps();
                warnings.push('WmxSitemapContent.indexed está marcado "*Deprecated; do not use.*" en el discovery de la API: no se reporta.');
                gscSitemapsList = apiSitemaps.map((sm) => ({
                    path: sm.path,
                    type: sm.type,
                    is_index: sm.isSitemapsIndex,
                    is_pending: sm.isPending,
                    last_submitted: sm.lastSubmitted,
                    last_downloaded: sm.lastDownloaded,
                    warnings: typeof sm.warnings === 'number'
                        ? sm.warnings
                        : parseInt(String(sm.warnings || '0'), 10),
                    errors: typeof sm.errors === 'number'
                        ? sm.errors
                        : parseInt(String(sm.errors || '0'), 10),
                    contents: (sm.contents ?? []).map((c) => ({
                        type: c.type ?? 'WEB',
                        submitted: typeof c.submitted === 'number'
                            ? c.submitted
                            : parseInt(String(c.submitted || '0'), 10),
                    })),
                }));
            }
            catch (gscErr) {
                warnings.push(`Fallo al obtener sitemaps de Google Search Console: ${gscErr instanceof Error ? gscErr.message : String(gscErr)}`);
            }
        }
        else {
            warnings.push('Falta configuración de Google Search Console: gsc_sitemaps omitido; se muestra live_sitemap');
        }
        let gscSubmittedTotal = null;
        const gscPaths = new Set();
        if (gscSitemapsList) {
            let sum = 0;
            for (const sm of gscSitemapsList) {
                gscPaths.add(sm.path.trim().toLowerCase());
                for (const c of sm.contents) {
                    sum += c.submitted;
                }
            }
            gscSubmittedTotal = sum;
        }
        const liveTotalUrls = liveSitemap.total_urls;
        const delta = gscSubmittedTotal !== null ? liveTotalUrls - gscSubmittedTotal : null;
        const livePaths = new Set();
        if (liveSitemap.entrypoint) {
            livePaths.add(liveSitemap.entrypoint.trim().toLowerCase());
        }
        for (const sub of liveSitemap.sub_sitemaps) {
            livePaths.add(sub.url.trim().toLowerCase());
        }
        const pathsMissingInGsc = [];
        if (gscSitemapsList) {
            for (const lp of livePaths) {
                if (!gscPaths.has(lp)) {
                    pathsMissingInGsc.push(lp);
                }
            }
        }
        const pathsMissingLive = [];
        for (const gp of gscPaths) {
            if (!livePaths.has(gp)) {
                pathsMissingLive.push(gp);
            }
        }
        const crossCheck = {
            gsc_submitted_total: gscSubmittedTotal,
            live_total_urls: liveTotalUrls,
            delta,
            paths_missing_in_gsc: pathsMissingInGsc,
            paths_missing_live: pathsMissingLive,
        };
        const provenance = [
            {
                ...FIRST_PARTY_FETCH,
                retrieved_at: new Date().toISOString(),
                notes: 'Fetch directo del sitemap del sitio',
            },
            {
                ...DERIVED,
                retrieved_at: new Date().toISOString(),
                notes: 'Cálculo de discrepancias y cruce de sitemaps',
            },
        ];
        if (gscSitemapsList) {
            provenance.push({
                ...OFFICIAL_GSC,
                retrieved_at: new Date().toISOString(),
                notes: 'Listado oficial de sitemaps de Google Search Console',
            });
        }
        return {
            data: {
                ...(gscSitemapsList
                    ? { gsc_sitemaps: measured(gscSitemapsList, OFFICIAL_GSC) }
                    : {}),
                live_sitemap: measured(liveSitemap, FIRST_PARTY_FETCH),
                cross_check: measured(crossCheck, DERIVED),
            },
            provenance,
            warnings,
        };
    });
}
//# sourceMappingURL=sitemap-health.js.map