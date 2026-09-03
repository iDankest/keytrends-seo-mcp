export type SourceId =
  | 'google_search_console_api'
  | 'google_search_console_ui_export'
  | 'live_site_fetch'
  | 'keytrends_derived'
  | 'unavailable';

export type SourceType = 'official' | 'export' | 'first_party' | 'third_party' | 'inferred';
export type Confidence = 'official' | 'high' | 'medium' | 'low' | 'unavailable';

export interface Provenance {
  source: SourceId;
  source_type: SourceType;
  confidence: Confidence;
  retrieved_at: string; // ISO 8601 UTC
  notes?: string;
}

export interface Measured<T> extends Provenance {
  value: T;
}

export function measured<T>(
  value: T,
  p: Omit<Provenance, 'retrieved_at'> & { retrieved_at?: string }
): Measured<T> {
  return {
    value,
    source: p.source,
    source_type: p.source_type,
    confidence: p.confidence,
    retrieved_at: p.retrieved_at ?? new Date().toISOString(),
    ...(p.notes !== undefined ? { notes: p.notes } : {}),
  };
}

export const OFFICIAL_GSC: Omit<Provenance, 'retrieved_at'> = {
  source: 'google_search_console_api',
  source_type: 'official',
  confidence: 'official',
};

export const EXPORT_GSC_UI: Omit<Provenance, 'retrieved_at'> = {
  source: 'google_search_console_ui_export',
  source_type: 'export',
  confidence: 'high',
};

export const FIRST_PARTY_FETCH: Omit<Provenance, 'retrieved_at'> = {
  source: 'live_site_fetch',
  source_type: 'first_party',
  confidence: 'high',
};

export const DERIVED: Omit<Provenance, 'retrieved_at'> = {
  source: 'keytrends_derived',
  source_type: 'inferred',
  confidence: 'medium',
};

export const UNAVAILABLE_OFFICIAL: Omit<Provenance, 'retrieved_at'> = {
  source: 'unavailable',
  source_type: 'official',
  confidence: 'unavailable',
};
