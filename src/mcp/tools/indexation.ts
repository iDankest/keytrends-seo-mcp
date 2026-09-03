import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { requireGsc, type ToolContext } from '../../context.js';
import { KeytrendsError } from '../../models/errors.js';
import {
  DERIVED,
  FIRST_PARTY_FETCH,
  OFFICIAL_GSC,
  type Provenance,
} from '../../models/provenance.js';
import { inspectUrls, type IndexRow } from '../../providers/indexation/inspector.js';
import { fetchSitemapGraph } from '../../providers/sitemap/fetcher.js';
import { sampleWithSeed } from '../../utils/random.js';
import { registerJsonTool, type ToolResult } from '../wrap.js';

export interface IndexationCounts {
  verdict: Record<string, number>;
  coverage_state: Record<string, number>;
  indexing_state: Record<string, number>;
  robots_txt_state: Record<string, number>;
  page_fetch_state: Record<string, number>;
}

export interface IndexationData {
  source_of_urls: 'SITEMAP' | 'ARGS';
  requested: number;
  inspected: number;
  indexed_pass: number;
  counts: IndexationCounts;
  rows?: IndexRow[];
  errors: Array<{ url: string; message: string; code: string }>;
  quota_note: string;
}

export function registerIndexationTool(server: McpServer, ctx: ToolContext): void {
  registerJsonTool(
    server,
    ctx,
    {
      name: 'keytrends_get_indexation',
      title: 'Inspección de estado de indexación de URLs',
      description:
        'Inspecciona el estado de indexación en Google Search Console para un lote de URLs obtenidas del sitemap o proporcionadas directamente.',
      inputSchema: {
        source: z
          .enum(['SITEMAP', 'ARGS'])
          .default('SITEMAP')
          .describe('Origen de las URLs a inspeccionar: SITEMAP (autodetectado) o ARGS (array explícito).'),
        urls: z
          .array(z.string().url())
          .max(200)
          .optional()
          .describe('Array de URLs a inspeccionar cuando source es ARGS.'),
        max_urls: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(25)
          .describe('Número máximo de URLs a inspeccionar (acotado por KEYTRENDS_MAX_INSPECT_URLS).'),
        sampling: z
          .enum(['FIRST', 'RANDOM'])
          .default('FIRST')
          .describe('Estrategia de selección de URLs: FIRST (primeras N) o RANDOM (muestreo determinista).'),
        seed: z
          .number()
          .int()
          .default(7)
          .describe('Semilla para el generador pseudoaleatorio cuando sampling es RANDOM.'),
        include_rows: z
          .boolean()
          .default(true)
          .describe('Si es true, incluye el detalle fila a fila además de los agregados.'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (
      args: {
        source: 'SITEMAP' | 'ARGS';
        urls?: string[];
        max_urls: number;
        sampling: 'FIRST' | 'RANDOM';
        seed: number;
        include_rows: boolean;
      },
      currentCtx: ToolContext
    ): Promise<ToolResult<IndexationData>> => {
      const gsc = requireGsc(currentCtx);
      const warnings: string[] = [];

      let candidateUrls: string[] = [];

      if (args.source === 'ARGS') {
        if (!args.urls || args.urls.length === 0) {
          throw new KeytrendsError({
            code: 'INVALID_ARGUMENT',
            message: "source: 'ARGS' exige proporcionar al menos una URL válida en el parámetro 'urls'.",
          });
        }
        candidateUrls = args.urls;
      } else {
        // source === 'SITEMAP'
        const siteUrl = currentCtx.config.siteUrl;
        if (!siteUrl) {
          throw new KeytrendsError({
            code: 'INVALID_ARGUMENT',
            message:
              'No se pudo derivar la URL del sitio para leer el sitemap. Configura KEYTRENDS_SITE_URL o GSC_PROPERTY.',
          });
        }

        const graph = await fetchSitemapGraph({
          siteUrl,
          sitemapUrl: currentCtx.config.sitemapUrl,
          http: currentCtx.http,
          maxSubSitemaps: 50,
          collectUrls: true,
        });

        candidateUrls = graph.urls;
        if (candidateUrls.length === 0) {
          warnings.push(
            `No se encontraron URLs en los sitemaps de ${siteUrl}. Candidatos probados: ${graph.candidates_tried.join(', ')}`
          );
        }
      }

      const effectiveMax = Math.min(args.max_urls, currentCtx.config.maxInspectUrls);
      if (args.max_urls > currentCtx.config.maxInspectUrls) {
        warnings.push(
          `max_urls solicitado (${args.max_urls}) excede el límite máximo configurado KEYTRENDS_MAX_INSPECT_URLS (${currentCtx.config.maxInspectUrls}); limitado a ${effectiveMax}.`
        );
      }

      let sampledUrls: string[] = [];
      if (candidateUrls.length > 0) {
        if (args.sampling === 'RANDOM') {
          sampledUrls = sampleWithSeed(candidateUrls, effectiveMax, args.seed);
        } else {
          sampledUrls = candidateUrls.slice(0, effectiveMax);
        }
      }

      const outcome = await inspectUrls({
        urls: sampledUrls,
        client: gsc,
        logger: currentCtx.logger,
      });

      const counts: IndexationCounts = {
        verdict: {},
        coverage_state: {},
        indexing_state: {},
        robots_txt_state: {},
        page_fetch_state: {},
      };

      for (const row of outcome.rows) {
        counts.verdict[row.verdict] = (counts.verdict[row.verdict] ?? 0) + 1;
        counts.coverage_state[row.coverage_state] =
          (counts.coverage_state[row.coverage_state] ?? 0) + 1;
        counts.indexing_state[row.indexing_state] =
          (counts.indexing_state[row.indexing_state] ?? 0) + 1;
        counts.robots_txt_state[row.robots_txt_state] =
          (counts.robots_txt_state[row.robots_txt_state] ?? 0) + 1;
        counts.page_fetch_state[row.page_fetch_state] =
          (counts.page_fetch_state[row.page_fetch_state] ?? 0) + 1;
      }

      const indexedPass = outcome.rows.filter((r) => r.verdict === 'PASS').length;

      const provenance: Provenance[] = [
        {
          ...OFFICIAL_GSC,
          retrieved_at: new Date().toISOString(),
          notes: 'Resultados de URL Inspection de Google Search Console',
        },
        {
          ...DERIVED,
          retrieved_at: new Date().toISOString(),
          notes: 'Agregaciones y conteos de estado de indexación',
        },
      ];

      if (args.source === 'SITEMAP') {
        provenance.push({
          ...FIRST_PARTY_FETCH,
          retrieved_at: new Date().toISOString(),
          notes: 'Extracción de URLs del sitemap en vivo',
        });
      }

      return {
        data: {
          source_of_urls: args.source,
          requested: sampledUrls.length,
          inspected: outcome.rows.length,
          indexed_pass: indexedPass,
          counts,
          ...(args.include_rows ? { rows: outcome.rows } : {}),
          errors: outcome.errors,
          quota_note:
            'URL Inspection: 2.000 QPD y 600 QPM por sitio (https://developers.google.com/webmaster-tools/limits).',
        },
        provenance,
        warnings,
      };
    }
  );
}
