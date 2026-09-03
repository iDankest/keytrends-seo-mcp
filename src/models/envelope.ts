import type { Provenance } from './provenance.js';
import type { ErrorCode } from './errors.js';

export interface ToolWindow {
  start_date: string;
  end_date: string;
  days: number;
  data_state?: 'FINAL' | 'ALL';
}

export interface ToolEnvelope<D> {
  ok: true;
  tool: string;
  property: string | null;
  window: ToolWindow | null;
  data: D;
  provenance: Provenance[];
  warnings: string[];
  generated_at: string;
  server: { name: '@keytrends/seo-mcp'; version: string };
}

export interface ToolErrorEnvelope {
  ok: false;
  tool: string;
  error: {
    code: ErrorCode;
    message: string;
    hint?: string;
    http_status?: number;
    google_status?: string;
  };
  warnings: string[];
  generated_at: string;
  server: { name: '@keytrends/seo-mcp'; version: string };
}
