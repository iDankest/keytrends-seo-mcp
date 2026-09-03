import { registerAiPagesTool } from './ai-pages.js';
import { registerAiVisibilityTool } from './ai-visibility.js';
import { registerGscSummaryTool } from './gsc-summary.js';
import { registerHealthcheckTool } from './healthcheck.js';
import { registerIndexationTool } from './indexation.js';
import { registerSearchPerformanceTool } from './search-performance.js';
import { registerSitemapHealthTool } from './sitemap-health.js';
export * from './healthcheck.js';
export * from './gsc-summary.js';
export * from './search-performance.js';
export * from './ai-visibility.js';
export * from './ai-pages.js';
export * from './indexation.js';
export * from './sitemap-health.js';
export function registerAllTools(server, ctx) {
    // Canonical registration order:
    // 1. keytrends_healthcheck
    registerHealthcheckTool(server, ctx);
    // 2. keytrends_get_gsc_summary
    registerGscSummaryTool(server, ctx);
    // 3. keytrends_get_search_performance
    registerSearchPerformanceTool(server, ctx);
    // 4. keytrends_get_ai_visibility
    registerAiVisibilityTool(server, ctx);
    // 5. keytrends_get_ai_pages
    registerAiPagesTool(server, ctx);
    // 6. keytrends_get_indexation
    registerIndexationTool(server, ctx);
    // 7. keytrends_get_sitemap_health
    registerSitemapHealthTool(server, ctx);
}
//# sourceMappingURL=index.js.map