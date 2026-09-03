import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './context.js';
import { registerAllTools } from './mcp/tools/index.js';

export const SERVER_INSTRUCTIONS =
  'Keytrends SEO/AEO MCP Server. Proporciona 7 herramientas de análisis SEO y visibilidad en IA respaldadas por la API oficial de Google Search Console y análisis first-party del sitio web. Todas las herramientas devuelven un sobre JSON estructurado con metadatos de procedencia por métrica, nivel de confianza y fecha de recuperación. Las impresiones y clics de AI Overviews y AI Mode están incluidos dentro del tipo de búsqueda WEB; Search Console no los desglosa en su API oficial.';

export function buildServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    {
      name: '@keytrends/seo-mcp',
      version: ctx.version,
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  registerAllTools(server, ctx);

  return server;
}
