import { describe, expect, it } from 'vitest';
import type { ToolEnvelope, ToolErrorEnvelope } from '../src/models/envelope.js';
import {
  DERIVED,
  EXPORT_GSC_UI,
  FIRST_PARTY_FETCH,
  measured,
  OFFICIAL_GSC,
  UNAVAILABLE_OFFICIAL,
} from '../src/models/provenance.js';

describe('models/provenance & envelope', () => {
  it('measured() wraps values with provenance metadata and ISO timestamp', () => {
    const item = measured(42, OFFICIAL_GSC);
    expect(item.value).toBe(42);
    expect(item.source).toBe('google_search_console_api');
    expect(item.source_type).toBe('official');
    expect(item.confidence).toBe('official');
    expect(typeof item.retrieved_at).toBe('string');
    expect(() => new Date(item.retrieved_at)).not.toThrow();
  });

  it('measured() preserves custom notes and retrieved_at', () => {
    const item = measured('hello', {
      ...DERIVED,
      retrieved_at: '2026-09-01T00:00:00.000Z',
      notes: 'Test derivation note',
    });
    expect(item.value).toBe('hello');
    expect(item.source).toBe('keytrends_derived');
    expect(item.notes).toBe('Test derivation note');
    expect(item.retrieved_at).toBe('2026-09-01T00:00:00.000Z');
  });

  it('verifies standard constants have expected categories', () => {
    expect(OFFICIAL_GSC.source_type).toBe('official');
    expect(EXPORT_GSC_UI.source_type).toBe('export');
    expect(FIRST_PARTY_FETCH.source_type).toBe('first_party');
    expect(DERIVED.source_type).toBe('inferred');
    expect(UNAVAILABLE_OFFICIAL.confidence).toBe('unavailable');
  });

  it('validates success and error envelope shapes', () => {
    const success: ToolEnvelope<{ count: number }> = {
      ok: true,
      tool: 'test_tool',
      property: 'sc-domain:keytrends.ai',
      window: { start_date: '2026-08-01', end_date: '2026-08-28', days: 28 },
      data: { count: 10 },
      provenance: [
        {
          source: 'google_search_console_api',
          source_type: 'official',
          confidence: 'official',
          retrieved_at: new Date().toISOString(),
        },
      ],
      warnings: [],
      generated_at: new Date().toISOString(),
      server: { name: '@keytrends/seo-mcp', version: '0.1.0' },
    };
    expect(success.ok).toBe(true);
    expect(success.tool).toBe('test_tool');

    const failure: ToolErrorEnvelope = {
      ok: false,
      tool: 'test_tool',
      error: {
        code: 'MISSING_CONFIG',
        message: 'Missing config variable',
        hint: 'Check env',
      },
      warnings: [],
      generated_at: new Date().toISOString(),
      server: { name: '@keytrends/seo-mcp', version: '0.1.0' },
    };
    expect(failure.ok).toBe(false);
    expect(failure.error.code).toBe('MISSING_CONFIG');
  });
});
