import { z } from 'zod';
import { runHealthcheck } from '../../health.js';
import { DERIVED } from '../../models/provenance.js';
import { registerJsonTool } from '../wrap.js';
export function registerHealthcheckTool(server, ctx) {
    registerJsonTool(server, ctx, {
        name: 'keytrends_healthcheck',
        title: 'Healthcheck de configuración y servicios',
        description: 'Comprueba el estado de las credenciales de Google Search Console, conectividad con la API y providers de IA.',
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
    }, async (args, currentCtx) => {
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
    });
}
//# sourceMappingURL=healthcheck.js.map