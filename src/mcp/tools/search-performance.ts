import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { requireGsc, type ToolContext } from '../../context.js';
import { measured, OFFICIAL_GSC, type Measured, type Provenance } from '../../models/provenance.js';
import type {
  ApiDimensionFilterGroup,
  Dimension,
  SearchType,
} from '../../providers/gsc/types.js';
import { resolveWindow } from '../../utils/dates.js';
import { registerJsonTool, type ToolResult } from '../wrap.js';
import { windowShape } from './gsc-summary.js';

export interface PerformanceRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchPerformanceData {
  dimension: Dimension;
  rows: Measured<PerformanceRow[]>;
  row_count: number;
  truncated: boolean;
  response_aggregation_type: string | null;
  first_incomplete_date: string | null;
}

export function registerSearchPerformanceTool(server: McpServer, ctx: ToolContext): void {
  registerJsonTool(
    server,
    ctx,
    {
      name: 'keytrends_get_search_performance',
      title: 'Rendimiento detallado de búsqueda en Google',
      description:
        'Consulta métricas agrupadas por consulta (QUERY), página (PAGE), país (COUNTRY), dispositivo (DEVICE), fecha (DATE) o apariencia (SEARCH_APPEARANCE).',
      inputSchema: {
        ...windowShape,
        dimension: z
          .enum(['QUERY', 'PAGE', 'COUNTRY', 'DEVICE', 'DATE', 'SEARCH_APPEARANCE'])
          .default('QUERY')
          .describe('Dimensión de agrupación principal.'),
        search_type: z
          .enum(['WEB', 'IMAGE', 'VIDEO', 'NEWS', 'DISCOVER', 'GOOGLE_NEWS'])
          .default('WEB')
          .describe('Tipo de búsqueda.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(25000)
          .default(25)
          .describe('Número máximo de filas a devolver (máx. 25.000).'),
        start_row: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe('Índice de fila inicial (paginación con offset).'),
        filter: z
          .object({
            dimension: z.enum(['QUERY', 'PAGE', 'COUNTRY', 'DEVICE']),
            operator: z
              .enum([
                'EQUALS',
                'NOT_EQUALS',
                'CONTAINS',
                'NOT_CONTAINS',
                'INCLUDING_REGEX',
                'EXCLUDING_REGEX',
              ])
              .default('CONTAINS'),
            expression: z.string().min(1),
          })
          .optional()
          .describe('Filtro opcional sobre una dimensión.'),
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
        dimension: Dimension;
        search_type: SearchType;
        limit: number;
        start_row: number;
        filter?: {
          dimension: 'QUERY' | 'PAGE' | 'COUNTRY' | 'DEVICE';
          operator:
            | 'EQUALS'
            | 'NOT_EQUALS'
            | 'CONTAINS'
            | 'NOT_CONTAINS'
            | 'INCLUDING_REGEX'
            | 'EXCLUDING_REGEX';
          expression: string;
        };
      },
      currentCtx: ToolContext
    ): Promise<ToolResult<SearchPerformanceData>> => {
      const gsc = requireGsc(currentCtx);
      const w = resolveWindow({
        range: args.range,
        start_date: args.start_date,
        end_date: args.end_date,
        now: currentCtx.now(),
      });

      const warnings: string[] = [];

      if (args.dimension === 'PAGE' || args.dimension === 'QUERY') {
        warnings.push(
          'Recuento es cota inferior: Google descarta filas de baja frecuencia al agrupar por página o consulta y aplica topes de 25.000 filas por respuesta (https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data).'
        );
      }

      if (args.dimension === 'SEARCH_APPEARANCE') {
        warnings.push(
          'searchAppearance es un catálogo de resultados enriquecidos y no contiene ningún valor de IA (https://support.google.com/webmasters/answer/17011259); no sirve para medir AI Overviews ni AI Mode.'
        );
      }

      let dimensionFilterGroups: ApiDimensionFilterGroup[] | undefined;
      if (args.filter) {
        dimensionFilterGroups = [
          {
            groupType: 'AND',
            filters: [
              {
                dimension: args.filter.dimension,
                operator: args.filter.operator,
                expression: args.filter.expression,
              },
            ],
          },
        ];
      }

      const res = await gsc.querySearchAnalytics({
        startDate: w.start_date,
        endDate: w.end_date,
        dimensions: [args.dimension],
        type: args.search_type,
        dataState: args.data_state,
        rowLimit: args.limit,
        startRow: args.start_row,
        dimensionFilterGroups,
      });

      const rows: PerformanceRow[] = (res.rows ?? []).map((r) => ({
        key: r.keys?.[0] ?? '',
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0,
      }));

      const provenance: Provenance[] = [
        { ...OFFICIAL_GSC, retrieved_at: new Date().toISOString() },
      ];

      return {
        data: {
          dimension: args.dimension,
          rows: measured(rows, OFFICIAL_GSC),
          row_count: rows.length,
          truncated: rows.length === args.limit,
          response_aggregation_type: res.responseAggregationType ?? null,
          first_incomplete_date: res.metadata?.firstIncompleteDate ?? null,
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
