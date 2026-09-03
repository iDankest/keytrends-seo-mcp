import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GscExportAiVisibilityProvider } from './gsc-export.js';
import { NoAiVisibilityProvider } from './none.js';
export * from './provider.js';
export * from './none.js';
export * from './gsc-export.js';
function directoryHasCsv(dirPath) {
    try {
        if (!existsSync(dirPath))
            return false;
        const stat = statSync(dirPath);
        if (!stat.isDirectory())
            return false;
        const entries = readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
                return true;
            }
            if (entry.isDirectory()) {
                try {
                    const subEntries = readdirSync(join(dirPath, entry.name), { withFileTypes: true });
                    if (subEntries.some((s) => s.isFile() && s.name.toLowerCase().endsWith('.csv'))) {
                        return true;
                    }
                }
                catch {
                    // ignore subfolder read error
                }
            }
        }
        return false;
    }
    catch {
        return false;
    }
}
export function resolveAiProvider(cfg, deps) {
    if (cfg.aiProviderMode === 'none') {
        return new NoAiVisibilityProvider();
    }
    if (cfg.aiProviderMode === 'gsc_export') {
        if (!cfg.aiExportDir || !existsSync(cfg.aiExportDir)) {
            deps.logger.warn('KEYTRENDS_AI_PROVIDER=gsc_export fijado pero KEYTRENDS_AI_EXPORT_DIR no está configurado o no existe; usando NoAiVisibilityProvider');
            return new NoAiVisibilityProvider();
        }
        return new GscExportAiVisibilityProvider(cfg.aiExportDir, deps.logger);
    }
    // mode === 'auto'
    if (cfg.aiExportDir && directoryHasCsv(cfg.aiExportDir)) {
        deps.logger.info(`AI provider auto-detectado: gsc_export con directorio ${cfg.aiExportDir}`);
        return new GscExportAiVisibilityProvider(cfg.aiExportDir, deps.logger);
    }
    return new NoAiVisibilityProvider();
}
//# sourceMappingURL=index.js.map