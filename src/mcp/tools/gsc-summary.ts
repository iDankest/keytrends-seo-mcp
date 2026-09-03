import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { requireGsc, type ToolContext } from '../../context.js';
import {
  DERIVED,
  measured,
  OFFICIAL_GSC,
  type Measured,
  type Provenance,
} from '../../models/provenance.js';
import type { SearchAnalyticsQueryResponse } from '../../providers/gsc/types.js';
import { resolveWindow, shiftWindowBack } from '../../utils/dates.js';
import { registerJsonTool, type ToolResult } from '../wrap.js';

export const windowShape = {
  range: z.enum(['7d', '28d', '90d', '12mo', 'custom']).default('28d'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  data_state: z.enum(['FINAL', 'ALL']).default('FINAL'),
};

export interface MetricTotals {
  clicks: Measured<number>;
  impressions: Measured<number>;
  ctr: Measured<number>;
  position: Measured<number>;
}

export interface MetricDeltas {
  clicks_pct: Measured<number | null>;
  impressions_pct: Measured<number | null>;
  ctr_pp: Measured<number | null>;
  position_abs: Measured<number | null>;
}

export interface DimensionBreakdownRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscSummaryData {
  totals: MetricTotals;
  previous?: MetricTotals;
  deltas?: MetricDeltas;
  devices: Measured<DimensionBreakdownRow[]>;
  top_countries: Measured<DimensionBreakdownRow[]>;
  ai_note: {
    text: string;
    doc_url: string;
  };
  first_incomplete_date: string | null;
}

export function registerGscSummaryTool(server: McpServer, ctx: ToolContext): void {
  registerJsonTool(
    server,
    ctx,
    {
      name: 'keytrends_get_gsc_summary',
      title: 'Resumen ejecutivo de rendimiento en Google Search Console',
      description:
        'Obtiene métricas agregadas de clics, impresiones, CTR y posición media para el tipo WEB, con desglose por dispositivo, top países y comparativa con el periodo anterior.',
      inputSchema: {
        ...windowShape,
        compare_previous: z
          .boolean()
          .default(true)
          .describe('Si es true, calcula el periodo contiguo anterior y las variaciones.'),
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
        compare_previous: boolean;
      },
      currentCtx: ToolContext
    ): Promise<ToolResult<GscSummaryData>> => {
      const gsc = requireGsc(currentCtx);
      const w = resolveWindow({
        range: args.range,
        start_date: args.start_date,
        end_date: args.end_date,
        now: currentCtx.now(),
      });

      const warnings: string[] = [];

      // Google impression anomaly check
      if (w.start_date <= '2026-04-27' && w.end_date >= '2025-05-13') {
        warnings.push(
          'La ventana solapa la anomalía oficial de registro de impresiones de Google (2025-05-13 a 2026-04-27): impresiones, CTR y posición media no son comparables sin advertirlo (https://support.google.com/webmasters/answer/6211453).'
        );
      }

      // Fetch queries in parallel
      const totalsPromise = gsc.querySearchAnalytics({
        startDate: w.start_date,
        endDate: w.end_date,
        type: 'WEB',
        dataState: args.data_state,
      });

      const devicesPromise = gsc.querySearchAnalytics({
        startDate: w.start_date,
        endDate: w.end_date,
        type: 'WEB',
        dataState: args.data_state,
        dimensions: ['DEVICE'],
      });

      const countriesPromise = gsc.querySearchAnalytics({
        startDate: w.start_date,
        endDate: w.end_date,
        type: 'WEB',
        dataState: args.data_state,
        dimensions: ['COUNTRY'],
        rowLimit: 5,
      });

      let previousPromise: Promise<SearchAnalyticsQueryResponse> | undefined;
      if (args.compare_previous) {
        const prevW = shiftWindowBack(w);
        previousPromise = gsc.querySearchAnalytics({
          startDate: prevW.start_date,
          endDate: prevW.end_date,
          type: 'WEB',
          dataState: args.data_state,
        });
      }

      const [totalsRes, devicesRes, countriesRes, previousRes] = await Promise.all([
        totalsPromise,
        devicesPromise,
        countriesPromise,
        previousPromise,
      ]);

      const mainRow = totalsRes.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      const currentClicks = mainRow.clicks ?? 0;
      const currentImpressions = mainRow.impressions ?? 0;
      const currentCtr = mainRow.ctr ?? 0;
      const currentPosition = mainRow.position ?? 0;

      const totals: MetricTotals = {
        clicks: measured(currentClicks, OFFICIAL_GSC),
        impressions: measured(currentImpressions, OFFICIAL_GSC),
        ctr: measured(currentCtr, OFFICIAL_GSC),
        position: measured(currentPosition, OFFICIAL_GSC),
      };

      let previous: MetricTotals | undefined;
      let deltas: MetricDeltas | undefined;

      if (previousRes) {
        const prevRow = previousRes.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
        const prevClicks = prevRow.clicks ?? 0;
        const prevImpressions = prevRow.impressions ?? 0;
        const prevCtr = prevRow.ctr ?? 0;
        const prevPosition = prevRow.position ?? 0;

        previous = {
          clicks: measured(prevClicks, OFFICIAL_GSC),
          impressions: measured(prevImpressions, OFFICIAL_GSC),
          ctr: measured(prevCtr, OFFICIAL_GSC),
          position: measured(prevPosition, OFFICIAL_GSC),
        };

        const clicksPct =
          prevClicks > 0 ? ((currentClicks - prevClicks) / prevClicks) * 100 : null;
        const impressionsPct =
          prevImpressions > 0
            ? ((currentImpressions - prevImpressions) / prevImpressions) * 100
            : null;
        const ctrPp = (currentCtr - prevCtr) * 100;
        const positionAbs = currentPosition - prevPosition;

        deltas = {
          clicks_pct: measured(clicksPct, DERIVED),
          impressions_pct: measured(impressionsPct, DERIVED),
          ctr_pp: measured(ctrPp, DERIVED),
          position_abs: measured(positionAbs, DERIVED),
        };
      }

      const devices: DimensionBreakdownRow[] = (devicesRes.rows ?? []).map((r) => ({
        key: r.keys?.[0] ?? 'UNKNOWN',
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0,
      }));

      const topCountries: DimensionBreakdownRow[] = (countriesRes.rows ?? []).map((r) => ({
        key: r.keys?.[0] ?? 'UNKNOWN',
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0,
      }));

      const provenance: Provenance[] = [
        { ...OFFICIAL_GSC, retrieved_at: new Date().toISOString() },
        { ...DERIVED, retrieved_at: new Date().toISOString() },
      ];

      return {
        data: {
          totals,
          ...(previous ? { previous } : {}),
          ...(deltas ? { deltas } : {}),
          devices: measured(devices, OFFICIAL_GSC),
          top_countries: measured(topCountries, OFFICIAL_GSC),
          ai_note: {
            text: 'Las impresiones y clics de AI Overviews y AI Mode están incluidos en estos totales del tipo de búsqueda WEB; Search Console no los desglosa en la API.',
            doc_url: 'https://developers.google.com/search/docs/appearance/ai-features',
          },
          first_incomplete_date: totalsRes.metadata?.firstIncompleteDate ?? null,
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
