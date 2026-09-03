import { UNAVAILABLE_OFFICIAL } from '../../models/provenance.js';
import type {
  AIVisibilityProvider,
  AiGranularity,
  AiSurface,
  AiVisibilityPages,
  AiVisibilitySummary,
  AiVisibilityTimeseries,
  AiWindow,
} from './provider.js';

export const REASON_NO_OFFICIAL_AI_API =
  'La API v1 de Google Search Console no expone métricas de IA generativa: los enums type (WEB|IMAGE|VIDEO|NEWS|DISCOVER|GOOGLE_NEWS) y dimensions (DATE|QUERY|PAGE|COUNTRY|DEVICE|SEARCH_APPEARANCE|HOUR) no incluyen ningún valor de IA (discovery rev. 20260902). Las impresiones y clics de AI Overviews y AI Mode SÍ existen, pero agregados dentro del tipo de búsqueda WEB.';

export const AI_ACTIVATION_REQUIREMENTS = [
  'Opción A (disponible hoy): exportar el CSV del informe de IA generativa desde la UI de GSC (https://search.google.com/search-console/performance/search-analytics/ai y https://search.google.com/search-console/performance/discover/ai), colocarlo en KEYTRENDS_AI_EXPORT_DIR y fijar KEYTRENDS_AI_PROVIDER=gsc_export.',
  'Opción B (pendiente de Google): que la API de Search Console publique un type/dimension de IA o un recurso dedicado; se detecta releyendo el discovery document (https://searchconsole.googleapis.com/$discovery/rest?version=v1) y buscando ai_overview|ai_mode|generative.',
  'Opción C (pendiente de Google): que la exportación masiva a BigQuery añada un search_type de IA (hoy: web, image, video, news, discover, googleNews).',
  'Requisito de elegibilidad del sitio, independiente de la vía: estar indexado y permitir snippet (sin nosnippet ni max-snippet:0) y no haber excluido el sitio en https://search.google.com/search-console/settings/search-gen-ai.',
];

export class NoAiVisibilityProvider implements AIVisibilityProvider {
  readonly id = 'none' as const;

  async getSummary(args: { window: AiWindow; surface: AiSurface }): Promise<AiVisibilitySummary> {
    return {
      available: false,
      surface: args.surface,
      reason: REASON_NO_OFFICIAL_AI_API,
      activation_requirements: AI_ACTIVATION_REQUIREMENTS,
      provenance: {
        ...UNAVAILABLE_OFFICIAL,
        retrieved_at: new Date().toISOString(),
        notes: 'Search Console API v1 discovery revision 20260902: no AI type/dimension exists',
      },
    };
  }

  async getPages(args: {
    window: AiWindow;
    surface: AiSurface;
    limit: number;
  }): Promise<AiVisibilityPages> {
    return {
      available: false,
      surface: args.surface,
      rows: [],
      truncated: false,
      total_rows_in_source: null,
      reason: REASON_NO_OFFICIAL_AI_API,
      activation_requirements: AI_ACTIVATION_REQUIREMENTS,
      provenance: {
        ...UNAVAILABLE_OFFICIAL,
        retrieved_at: new Date().toISOString(),
        notes: 'Search Console API v1 discovery revision 20260902: no AI type/dimension exists',
      },
    };
  }

  async getTimeseries(args: {
    window: AiWindow;
    surface: AiSurface;
    granularity: AiGranularity;
  }): Promise<AiVisibilityTimeseries> {
    return {
      available: false,
      surface: args.surface,
      granularity: args.granularity,
      points: [],
      reason: REASON_NO_OFFICIAL_AI_API,
      provenance: {
        ...UNAVAILABLE_OFFICIAL,
        retrieved_at: new Date().toISOString(),
        notes: 'Search Console API v1 discovery revision 20260902: no AI type/dimension exists',
      },
    };
  }
}
