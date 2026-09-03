import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from '../../context.js';
import {
  DERIVED,
  measured,
  OFFICIAL_GSC,
  type Measured,
  type Provenance,
} from '../../models/provenance.js';
import type {
  AiGranularity,
  AiSurface,
  AiVisibilitySummary,
  AiVisibilityTimeseries,
} from '../../providers/ai/provider.js';
import { resolveWindow } from '../../utils/dates.js';
import { registerJsonTool, type ToolResult } from '../wrap.js';
import { windowShape } from './gsc-summary.js';

export interface AiVisibilityData {
  ai: AiVisibilitySummary;
  timeseries?: AiVisibilityTimeseries;
  web_totals_include_ai?: Measured<{ impressions: number; clicks: number }>;
  ai_share_of_web_impressions?: Measured<number>;
  provider: {
    id: string;
    mode: string;
  };
}

export function registerAiVisibilityTool(server: McpServer, ctx: ToolContext): void {
  registerJsonTool(
    server,
    ctx,
    {
      name: 'keytrends_get_ai_visibility',
      title: 'Visibilidad en IA generativa (AI Overviews / AI Mode)',
      description:
        'Consulta métricas de visibilidad en IA generativa desde providers desacoplados (exportación de UI o provider none con requisitos de activación) y contexto web oficial.',
      inputSchema: {
        ...windowShape,
        surface: z
          .enum(['SEARCH', 'DISCOVER'])
          .default('SEARCH')
          .describe('Superficie de búsqueda en IA: SEARCH o DISCOVER.'),
        include_timeseries: z
          .boolean()
          .default(false)
          .describe('Si es true, incluye serie temporal de impresiones.'),
        granularity: z
          .enum(['DAY', 'WEEK', 'MONTH'])
          .default('DAY')
          .describe('Granularidad temporal de la serie (DAY, WEEK o MONTH).'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (
      args: {
        range: '7d' | '28d' | '90d' | '12mo' | 'custom';
        start_date?: string;
        end_date?: string;
        data_state: 'FINAL' | 'ALL';
        surface: AiSurface;
        include_timeseries: boolean;
        granularity: AiGranularity;
      },
      currentCtx: ToolContext
    ): Promise<ToolResult<AiVisibilityData>> => {
      const w = resolveWindow({
        range: args.range,
        start_date: args.start_date,
        end_date: args.end_date,
        now: currentCtx.now(),
      });

      const aiWindow = {
        start_date: w.start_date,
        end_date: w.end_date,
      };

      const warnings: string[] = [];

      // Fetch AI summary and optional timeseries
      const aiSummaryPromise = currentCtx.ai.getSummary({
        window: aiWindow,
        surface: args.surface,
      });

      let aiTimeseriesPromise: Promise<AiVisibilityTimeseries> | undefined;
      if (args.include_timeseries) {
        aiTimeseriesPromise = currentCtx.ai.getTimeseries({
          window: aiWindow,
          surface: args.surface,
          granularity: args.granularity,
        });
      }

      // Fetch official GSC web totals for reference if GSC is configured
      let webTotalsPromise: Promise<Measured<{ impressions: number; clicks: number }> | undefined> =
        Promise.resolve(undefined);

      if (currentCtx.gsc) {
        webTotalsPromise = currentCtx.gsc
          .querySearchAnalytics({
            startDate: w.start_date,
            endDate: w.end_date,
            type: 'WEB',
            dataState: args.data_state,
          })
          .then((res) => {
            const row = res.rows?.[0] ?? { clicks: 0, impressions: 0 };
            return measured(
              {
                impressions: row.impressions ?? 0,
                clicks: row.clicks ?? 0,
              },
              OFFICIAL_GSC
            );
          })
          .catch((err: unknown) => {
            warnings.push(
              `No se pudieron obtener totales WEB de referencia desde GSC: ${err instanceof Error ? err.message : String(err)}`
            );
            return undefined;
          });
      } else {
        warnings.push(
          'Falta configuración de Google Search Console: totales WEB de referencia no disponibles'
        );
      }

      const [aiSummary, aiTimeseries, webTotals] = await Promise.all([
        aiSummaryPromise,
        aiTimeseriesPromise,
        webTotalsPromise,
      ]);

      let aiShareOfWeb: Measured<number> | undefined;
      if (
        aiSummary.available &&
        aiSummary.impressions &&
        webTotals &&
        webTotals.value.impressions > 0
      ) {
        const sharePct = (aiSummary.impressions.value / webTotals.value.impressions) * 100;
        aiShareOfWeb = measured(sharePct, DERIVED);
      }

      const provenance: Provenance[] = [aiSummary.provenance];
      if (webTotals) {
        provenance.push({ ...OFFICIAL_GSC, retrieved_at: new Date().toISOString() });
      }
      if (aiShareOfWeb) {
        provenance.push({ ...DERIVED, retrieved_at: new Date().toISOString() });
      }

      return {
        data: {
          ai: aiSummary,
          ...(aiTimeseries ? { timeseries: aiTimeseries } : {}),
          ...(webTotals ? { web_totals_include_ai: webTotals } : {}),
          ...(aiShareOfWeb ? { ai_share_of_web_impressions: aiShareOfWeb } : {}),
          provider: {
            id: currentCtx.ai.id,
            mode: currentCtx.config.aiProviderMode,
          },
        },
        provenance,
        warnings,
        window: {
          start_date: w.start_date,
          end_date: w.end_date,
          days: w.days,
          data_state: args.data_state,
        },
      };
    }
  );
}
