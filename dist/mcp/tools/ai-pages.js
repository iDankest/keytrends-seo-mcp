import { z } from 'zod';
import { resolveWindow } from '../../utils/dates.js';
import { registerJsonTool } from '../wrap.js';
import { windowShape } from './gsc-summary.js';
export function registerAiPagesTool(server, ctx) {
    registerJsonTool(server, ctx, {
        name: 'keytrends_get_ai_pages',
        title: 'Páginas citadas en IA generativa',
        description: 'Lista las URLs citadas o visibles en AI Overviews / AI Mode ordenadas por impresiones.',
        inputSchema: {
            ...windowShape,
            surface: z
                .enum(['SEARCH', 'DISCOVER'])
                .default('SEARCH')
                .describe('Superficie de búsqueda en IA: SEARCH o DISCOVER.'),
            limit: z
                .number()
                .int()
                .min(1)
                .max(1000)
                .default(25)
                .describe('Número máximo de páginas a devolver (máx. 1.000).'),
        },
        annotations: {
            readOnlyHint: true,
            openWorldHint: true,
        },
    }, async (args, currentCtx) => {
        const w = resolveWindow({
            range: args.range,
            start_date: args.start_date,
            end_date: args.end_date,
            now: currentCtx.now(),
        });
        const warnings = [];
        const aiPages = await currentCtx.ai.getPages({
            window: {
                start_date: w.start_date,
                end_date: w.end_date,
            },
            surface: args.surface,
            limit: args.limit,
        });
        if (aiPages.available) {
            warnings.push('El informe de IA de la UI de GSC limita la tabla a 1.000 filas (https://support.google.com/webmasters/answer/16984139): el listado es cota inferior.');
        }
        const provenance = [aiPages.provenance];
        return {
            data: {
                ai_pages: aiPages,
                provider: {
                    id: currentCtx.ai.id,
                    mode: currentCtx.config.aiProviderMode,
                },
            },
            provenance,
            warnings,
            window: {
                start_date: w.start_date,
                end_date: w.end_date,
                days: w.days,
                data_state: args.data_state,
            },
        };
    });
}
//# sourceMappingURL=ai-pages.js.map