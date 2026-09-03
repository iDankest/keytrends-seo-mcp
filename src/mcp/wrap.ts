import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { z, ZodRawShape } from 'zod';
import type { ToolContext } from '../context.js';
import type { ToolEnvelope, ToolErrorEnvelope, ToolWindow } from '../models/envelope.js';
import { KeytrendsError, type ErrorCode } from '../models/errors.js';
import type { Provenance } from '../models/provenance.js';

export interface ToolResult<D> {
  data: D;
  provenance: Provenance[];
  warnings?: string[];
  window?: ToolWindow | null;
}

export type ShapeOutput<S extends ZodRawShape> = z.infer<z.ZodObject<S>>;

export function registerJsonTool<S extends ZodRawShape, D>(
  server: McpServer,
  ctx: ToolContext,
  spec: {
    name: string;
    title: string;
    description: string;
    inputSchema: S;
    annotations?: ToolAnnotations;
  },
  handler: (args: ShapeOutput<S>, ctx: ToolContext) => Promise<ToolResult<D>>
): void {
  // We use server.registerTool with explicit callback typing matching MCP CallToolResult.
  // The SDK's registerTool overload has a loose OutputArgs generic when outputSchema is omitted.
  const registerFn = server.registerTool.bind(server) as (
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: S;
      annotations?: ToolAnnotations;
    },
    cb: (args: ShapeOutput<S>, extra: unknown) => Promise<CallToolResult>
  ) => unknown;

  registerFn(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.inputSchema,
      annotations: spec.annotations,
    },
    async (rawArgs: ShapeOutput<S>, _extra: unknown): Promise<CallToolResult> => {
      const startMs = Date.now();
      try {
        const typedArgs = rawArgs;
        const result = await handler(typedArgs, ctx);
        const durationMs = Date.now() - startMs;

        ctx.logger.info('Tool call completed', {
          tool: spec.name,
          duration_ms: durationMs,
          ok: true,
        });

        const envelope: ToolEnvelope<D> = {
          ok: true,
          tool: spec.name,
          property: ctx.config.property,
          window: result.window ?? null,
          data: result.data,
          provenance: result.provenance,
          warnings: result.warnings ?? [],
          generated_at: new Date().toISOString(),
          server: {
            name: '@keytrends/seo-mcp',
            version: ctx.version,
          },
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(envelope, null, 2),
            },
          ],
          structuredContent: envelope as unknown as Record<string, unknown>,
        };
      } catch (err: unknown) {
        const durationMs = Date.now() - startMs;
        let code: ErrorCode = 'UPSTREAM_ERROR';
        let message = 'Error desconocido al ejecutar la herramienta';
        let hint: string | undefined;
        let httpStatus: number | undefined;
        let googleStatus: string | undefined;

        if (err instanceof KeytrendsError) {
          code = err.code;
          message = err.message;
          hint = err.hint;
          httpStatus = err.httpStatus;
          googleStatus = err.googleStatus;
        } else if (err instanceof Error) {
          message = err.message;
        }

        ctx.logger.error('Tool call failed', {
          tool: spec.name,
          duration_ms: durationMs,
          ok: false,
          code,
          message,
        });

        const errorEnvelope: ToolErrorEnvelope = {
          ok: false,
          tool: spec.name,
          error: {
            code,
            message,
            ...(hint !== undefined ? { hint } : {}),
            ...(httpStatus !== undefined ? { http_status: httpStatus } : {}),
            ...(googleStatus !== undefined ? { google_status: googleStatus } : {}),
          },
          warnings: [],
          generated_at: new Date().toISOString(),
          server: {
            name: '@keytrends/seo-mcp',
            version: ctx.version,
          },
        };

        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(errorEnvelope, null, 2),
            },
          ],
          structuredContent: errorEnvelope as unknown as Record<string, unknown>,
        };
      }
    }
  );
}
