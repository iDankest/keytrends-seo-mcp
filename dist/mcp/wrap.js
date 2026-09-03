import { KeytrendsError } from '../models/errors.js';
export function registerJsonTool(server, ctx, spec, handler) {
    // We use server.registerTool with explicit callback typing matching MCP CallToolResult.
    // The SDK's registerTool overload has a loose OutputArgs generic when outputSchema is omitted.
    const registerFn = server.registerTool.bind(server);
    registerFn(spec.name, {
        title: spec.title,
        description: spec.description,
        inputSchema: spec.inputSchema,
        annotations: spec.annotations,
    }, async (rawArgs, _extra) => {
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
            const envelope = {
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
                        type: 'text',
                        text: JSON.stringify(envelope, null, 2),
                    },
                ],
                structuredContent: envelope,
            };
        }
        catch (err) {
            const durationMs = Date.now() - startMs;
            let code = 'UPSTREAM_ERROR';
            let message = 'Error desconocido al ejecutar la herramienta';
            let hint;
            let httpStatus;
            let googleStatus;
            if (err instanceof KeytrendsError) {
                code = err.code;
                message = err.message;
                hint = err.hint;
                httpStatus = err.httpStatus;
                googleStatus = err.googleStatus;
            }
            else if (err instanceof Error) {
                message = err.message;
            }
            ctx.logger.error('Tool call failed', {
                tool: spec.name,
                duration_ms: durationMs,
                ok: false,
                code,
                message,
            });
            const errorEnvelope = {
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
                        type: 'text',
                        text: JSON.stringify(errorEnvelope, null, 2),
                    },
                ],
                structuredContent: errorEnvelope,
            };
        }
    });
}
//# sourceMappingURL=wrap.js.map