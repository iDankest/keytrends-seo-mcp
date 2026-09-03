export function measured(value, p) {
    return {
        value,
        source: p.source,
        source_type: p.source_type,
        confidence: p.confidence,
        retrieved_at: p.retrieved_at ?? new Date().toISOString(),
        ...(p.notes !== undefined ? { notes: p.notes } : {}),
    };
}
export const OFFICIAL_GSC = {
    source: 'google_search_console_api',
    source_type: 'official',
    confidence: 'official',
};
export const EXPORT_GSC_UI = {
    source: 'google_search_console_ui_export',
    source_type: 'export',
    confidence: 'high',
};
export const FIRST_PARTY_FETCH = {
    source: 'live_site_fetch',
    source_type: 'first_party',
    confidence: 'high',
};
export const DERIVED = {
    source: 'keytrends_derived',
    source_type: 'inferred',
    confidence: 'medium',
};
export const UNAVAILABLE_OFFICIAL = {
    source: 'unavailable',
    source_type: 'official',
    confidence: 'unavailable',
};
//# sourceMappingURL=provenance.js.map