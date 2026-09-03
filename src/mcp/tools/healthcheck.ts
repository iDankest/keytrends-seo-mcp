import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from '../../context.js';
import type { HealthReport } from '../../health.js';
import { runHealthcheck } from '../../health.js';
import { DERIVED } from '../../models/provenance.js';
import { registerJsonTool, type ToolResult } from '../wrap.js';

export function registerHealthcheckTool(server: McpServer, ctx: ToolContext): void {
  registerJsonTool(
    server,
    ctx,
    {
      name: 'keytrends_healthcheck',
      title: 'Healthcheck de configuración y servicios',
      description:
        'Comprueba el estado de las credenciales de Google Search Console, conectividad con la API y providers de IA.',
      inputSchema: {
        deep: z
          .boolean()
          .default(true)
          .describe('Si es true, ejecuta pruebas de conectividad y llamadas de prueba reales.'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (args: { deep: boolean }, currentCtx: ToolContext): Promise<ToolResult<HealthReport>> => {
      const report = await runHealthcheck(currentCtx, { deep: args.deep });
      return {
        data: report,
        provenance: [
          {
            ...DERIVED,
            retrieved_at: new Date().toISOString(),
            notes: 'Diagnóstico de salud generado por el servidor',
          },
        ],
      };
    }
  );
}
