import type { Measured, Provenance } from '../../models/provenance.js';

export type AiSurface = 'SEARCH' | 'DISCOVER';
export type AiGranularity = 'DAY' | 'WEEK' | 'MONTH';

export interface AiWindow {
  start_date: string;
  end_date: string;
}

export interface AiVisibilitySummary {
  available: boolean;
  surface: AiSurface;
  impressions?: Measured<number>;
  pages_count?: Measured<number>;
  countries?: Measured<Array<{ country: string; impressions: number }>>;
  devices?: Measured<Array<{ device: string; impressions: number }>>;
  coverage?: { first_date: string | null; last_date: string | null };
  reason?: string;
  activation_requirements?: string[];
  provenance: Provenance;
}

export interface AiVisibilityPages {
  available: boolean;
  surface: AiSurface;
  rows: Array<{ page: string; impressions: number }>;
  truncated: boolean;
  total_rows_in_source: number | null;
  reason?: string;
  activation_requirements?: string[];
  provenance: Provenance;
}

export interface AiVisibilityTimeseries {
  available: boolean;
  surface: AiSurface;
  granularity: AiGranularity;
  points: Array<{ date: string; impressions: number }>;
  reason?: string;
  provenance: Provenance;
}

export interface AIVisibilityProvider {
  readonly id: 'none' | 'gsc_export';
  getSummary(args: { window: AiWindow; surface: AiSurface }): Promise<AiVisibilitySummary>;
  getPages(args: {
    window: AiWindow;
    surface: AiSurface;
    limit: number;
  }): Promise<AiVisibilityPages>;
  getTimeseries(args: {
    window: AiWindow;
    surface: AiSurface;
    granularity: AiGranularity;
  }): Promise<AiVisibilityTimeseries>;
}
