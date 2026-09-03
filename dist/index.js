#!/usr/bin/env node
import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildContext, PACKAGE_VERSION } from './context.js';
import { runHealthcheck } from './health.js';
import { buildServer } from './server.js';
import { createLogger } from './utils/logger.js';
function getVersion() {
    try {
        const require = createRequire(import.meta.url);
        const pkg = require('../package.json');
        return pkg.version ?? PACKAGE_VERSION;
    }
    catch {
        return PACKAGE_VERSION;
    }
}
const version = getVersion();
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`Keytrends SEO MCP Server (@keytrends/seo-mcp) v${version}

Uso:
  npx -y @keytrends/seo-mcp [opciones]

Opciones:
  --healthcheck    Ejecuta el diagnóstico de configuración y conectividad; sale con código 0 (éxito/warn) o 1 (fallo).
  --version, -v    Muestra la versión instalada.
  --help, -h       Muestra esta ayuda.

Modo por defecto:
  Inicia el servidor MCP en transporte stdio para su uso como herramienta personalizada en Cognitiv u otros clientes MCP.
`);
    process.exit(0);
}
if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(`${version}\n`);
    process.exit(0);
}
if (args.includes('--healthcheck')) {
    (async () => {
        const ctx = buildContext(process.env, { version });
        const report = await runHealthcheck(ctx, { deep: true });
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        process.exit(report.overall === 'fail' ? 1 : 0);
    })().catch((err) => {
        process.stderr.write(`Error fatal al ejecutar healthcheck: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    });
}
else if (args.length > 0) {
    process.stderr.write(`Argumento desconocido: ${args[0]}\nUsa --help para ver las opciones disponibles.\n`);
    process.exit(2);
}
else {
    // Stdio server mode
    const initialLogger = createLogger('info');
    // Protect stdout: redirect all console.log/info/debug to logger (stderr)
    console.log = (...a) => initialLogger.warn('console.log suprimido para proteger stdout del protocolo MCP', {
        args: a.map(String),
    });
    console.info = (...a) => initialLogger.info('console.info suprimido', {
        args: a.map(String),
    });
    console.debug = (...a) => initialLogger.debug('console.debug suprimido', {
        args: a.map(String),
    });
    const ctx = buildContext(process.env, { version });
    const server = buildServer(ctx);
    const transport = new StdioServerTransport();
    (async () => {
        await server.connect(transport);
        ctx.logger.info('Servidor MCP Keytrends iniciado en transporte stdio', {
            version,
            property_configured: Boolean(ctx.config.property),
            ai_provider: ctx.ai.id,
        });
    })().catch((err) => {
        ctx.logger.error('Fallo al conectar el servidor MCP en stdio', {
            error: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
    });
    const shutdown = async () => {
        try {
            await server.close();
        }
        catch {
            // ignore
        }
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.stdin.on('close', shutdown);
    process.on('uncaughtException', (err) => {
        ctx.logger.error('Excepción no capturada en el servidor', {
            error: err.message,
            stack: err.stack,
        });
        process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
        ctx.logger.error('Rechazo de promesa no capturado en el servidor', {
            reason: String(reason),
        });
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map