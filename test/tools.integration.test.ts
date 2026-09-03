import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildContext } from '../src/context.js';
import type { ToolEnvelope, ToolErrorEnvelope } from '../src/models/envelope.js';
import { buildServer } from '../src/server.js';
import { createLogger } from '../src/utils/logger.js';

describe('tools integration (in-memory MCP transport)', () => {
  let client: Client;
  let serverTransport: InMemoryTransport;
  let clientTransport: InMemoryTransport;

  const expectedToolNames = [
    'keytrends_healthcheck',
    'keytrends_get_gsc_summary',
    'keytrends_get_search_performance',
    'keytrends_get_ai_visibility',
    'keytrends_get_ai_pages',
    'keytrends_get_indexation',
    'keytrends_get_sitemap_health',
  ];

  beforeEach(async () => {
    const ctx = buildContext(
      {}, // Empty env to test fallback/missing behavior
      { logger: createLogger('silent') }
    );

    const server = buildServer(ctx);
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  it('lists exactly the 7 registered tools in the specified canonical order', async () => {
    const listResult = await client.listTools();
    const registeredNames = listResult.tools.map((t) => t.name);

    expect(registeredNames).toEqual(expectedToolNames);
    expect(registeredNames).toHaveLength(7);
  });

  it('keytrends_healthcheck without credentials returns overall: fail and missing_env', async () => {
    const res = await client.callTool({
      name: 'keytrends_healthcheck',
      arguments: { deep: false },
    });

    expect(res.isError).toBeFalsy();
    const envelope = JSON.parse(
      (res.content as Array<{ type: string; text: string }>)[0].text
    ) as ToolEnvelope<{
      overall: string;
      config: { missing_env: string[]; env_present: Record<string, boolean> };
    }>;

    expect(envelope.ok).toBe(true);
    expect(envelope.tool).toBe('keytrends_healthcheck');
    expect(envelope.data.overall).toBe('fail');
    expect(envelope.data.config.missing_env).toEqual([
      'GSC_PROPERTY',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REFRESH_TOKEN',
    ]);
    expect(envelope.data.config.env_present).toEqual({
      GSC_PROPERTY: false,
      GOOGLE_CLIENT_ID: false,
      GOOGLE_CLIENT_SECRET: false,
      GOOGLE_REFRESH_TOKEN: false,
    });
  });

  it('keytrends_get_gsc_summary without credentials returns isError: true and MISSING_CONFIG', async () => {
    const res = await client.callTool({
      name: 'keytrends_get_gsc_summary',
      arguments: { range: '28d' },
    });

    expect(res.isError).toBe(true);
    const errEnvelope = JSON.parse(
      (res.content as Array<{ type: string; text: string }>)[0].text
    ) as ToolErrorEnvelope;

    expect(errEnvelope.ok).toBe(false);
    expect(errEnvelope.tool).toBe('keytrends_get_gsc_summary');
    expect(errEnvelope.error.code).toBe('MISSING_CONFIG');
    expect(errEnvelope.error.hint).toContain('GSC_PROPERTY');
  });

  it('keytrends_get_ai_visibility without credentials returns ok: true with ai.available: false', async () => {
    const res = await client.callTool({
      name: 'keytrends_get_ai_visibility',
      arguments: { range: '28d', surface: 'SEARCH' },
    });

    const envelope = JSON.parse(
      (res.content as Array<{ type: string; text: string }>)[0].text
    ) as ToolEnvelope<{
      ai: { available: boolean; impressions?: unknown; activation_requirements: string[] };
    }>;

    expect(envelope.ok).toBe(true);
    expect(envelope.tool).toBe('keytrends_get_ai_visibility');
    expect(envelope.data.ai.available).toBe(false);
    expect(envelope.data.ai.impressions).toBeUndefined();
    expect(envelope.data.ai.activation_requirements).toHaveLength(4);
    expect(envelope.warnings.length).toBeGreaterThan(0);
  });
});
