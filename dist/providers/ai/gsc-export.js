import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { EXPORT_GSC_UI, measured } from '../../models/provenance.js';
import { findColumn, normalizeHeader, parseCsv, parseIntLoose } from '../../utils/csv.js';
const ALIASES = {
    date: ['date', 'fecha', 'dia'],
    page: ['page', 'pages', 'top pages', 'pagina', 'paginas', 'paginas principales', 'url'],
    country: ['country', 'countries', 'pais', 'paises'],
    device: ['device', 'devices', 'dispositivo', 'dispositivos'],
    impressions: ['impressions', 'impresiones'],
};
export class GscExportAiVisibilityProvider {
    id = 'gsc_export';
    exportDir;
    logger;
    constructor(exportDir, logger) {
        this.exportDir = exportDir;
        this.logger = logger;
    }
    async discoverCsvFiles() {
        const files = [];
        async function scanDir(dir, depth) {
            if (depth > 1)
                return;
            let entries;
            try {
                entries = await readdir(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const entry of entries) {
                const fullPath = join(dir, entry.name);
                if (entry.isDirectory() && depth === 0) {
                    await scanDir(fullPath, depth + 1);
                }
                else if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
                    const stats = await stat(fullPath);
                    const lowerName = entry.name.toLowerCase();
                    const lowerPath = fullPath.toLowerCase();
                    const surface = lowerName.includes('discover') || lowerPath.includes('discover')
                        ? 'DISCOVER'
                        : 'SEARCH';
                    const baseNorm = normalizeHeader(entry.name.replace(/\.csv$/i, ''));
                    let dimension = 'unknown';
                    if (baseNorm.includes('date') || baseNorm.includes('fecha') || baseNorm.includes('dia')) {
                        dimension = 'date';
                    }
                    else if (baseNorm.includes('page') ||
                        baseNorm.includes('pagina') ||
                        baseNorm.includes('url')) {
                        dimension = 'page';
                    }
                    else if (baseNorm.includes('countr') || baseNorm.includes('pais')) {
                        dimension = 'country';
                    }
                    else if (baseNorm.includes('device') || baseNorm.includes('dispositivo')) {
                        dimension = 'device';
                    }
                    files.push({
                        path: fullPath,
                        name: entry.name,
                        surface,
                        dimension,
                        mtime: stats.mtime,
                    });
                }
            }
        }
        await scanDir(this.exportDir, 0);
        return files;
    }
    async getSummary(args) {
        const files = await this.discoverCsvFiles();
        const surfaceFiles = files.filter((f) => f.surface === args.surface);
        if (surfaceFiles.length === 0) {
            return {
                available: false,
                surface: args.surface,
                reason: `No se encontraron ficheros CSV para la superficie ${args.surface} en ${this.exportDir}`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                    notes: `Directorio de exportación: ${this.exportDir}`,
                },
            };
        }
        const dateFile = surfaceFiles.find((f) => f.dimension === 'date');
        const pageFile = surfaceFiles.find((f) => f.dimension === 'page');
        const countryFile = surfaceFiles.find((f) => f.dimension === 'country');
        const deviceFile = surfaceFiles.find((f) => f.dimension === 'device');
        let totalImpressions = 0;
        let impressionsCounted = false;
        let firstDate = null;
        let lastDate = null;
        let primaryFile;
        if (dateFile) {
            primaryFile = dateFile;
            const content = await readFile(dateFile.path, 'utf8');
            const rows = parseCsv(content);
            if (rows.length < 2) {
                return {
                    available: false,
                    surface: args.surface,
                    reason: `El fichero de fechas ${dateFile.name} está vacío o no contiene filas de datos`,
                    provenance: {
                        ...EXPORT_GSC_UI,
                        retrieved_at: new Date().toISOString(),
                        notes: dateFile.name,
                    },
                };
            }
            const header = rows[0];
            const dateIdx = findColumn(header, ALIASES.date);
            const impIdx = findColumn(header, ALIASES.impressions);
            if (dateIdx === -1 || impIdx === -1) {
                return {
                    available: false,
                    surface: args.surface,
                    reason: `Cabeceras no reconocidas en ${dateFile.name}. Cabeceras observadas: [${header.join(', ')}]. Esperadas para fecha: [${ALIASES.date.join(', ')}], impresiones: [${ALIASES.impressions.join(', ')}]`,
                    provenance: {
                        ...EXPORT_GSC_UI,
                        retrieved_at: new Date().toISOString(),
                        notes: dateFile.name,
                    },
                };
            }
            for (let r = 1; r < rows.length; r++) {
                const row = rows[r];
                if (row.length <= Math.max(dateIdx, impIdx))
                    continue;
                const d = row[dateIdx].trim();
                if (d >= args.window.start_date && d <= args.window.end_date) {
                    const imp = parseIntLoose(row[impIdx]);
                    totalImpressions += imp;
                    impressionsCounted = true;
                    if (!firstDate || d < firstDate)
                        firstDate = d;
                    if (!lastDate || d > lastDate)
                        lastDate = d;
                }
            }
        }
        let pagesCount = 0;
        let pagesCounted = false;
        if (pageFile) {
            if (!primaryFile)
                primaryFile = pageFile;
            const content = await readFile(pageFile.path, 'utf8');
            const rows = parseCsv(content);
            if (rows.length >= 2) {
                const header = rows[0];
                const pageIdx = findColumn(header, ALIASES.page);
                const impIdx = findColumn(header, ALIASES.impressions);
                if (pageIdx !== -1 && impIdx !== -1) {
                    const uniquePages = new Set();
                    let sumPagesImp = 0;
                    for (let r = 1; r < rows.length; r++) {
                        const row = rows[r];
                        if (row.length <= Math.max(pageIdx, impIdx))
                            continue;
                        const p = row[pageIdx].trim();
                        if (p) {
                            uniquePages.add(p);
                            sumPagesImp += parseIntLoose(row[impIdx]);
                        }
                    }
                    pagesCount = uniquePages.size;
                    pagesCounted = true;
                    if (!impressionsCounted) {
                        totalImpressions = sumPagesImp;
                        impressionsCounted = true;
                    }
                }
            }
        }
        let countriesList;
        if (countryFile) {
            if (!primaryFile)
                primaryFile = countryFile;
            const content = await readFile(countryFile.path, 'utf8');
            const rows = parseCsv(content);
            if (rows.length >= 2) {
                const header = rows[0];
                const countryIdx = findColumn(header, ALIASES.country);
                const impIdx = findColumn(header, ALIASES.impressions);
                if (countryIdx !== -1 && impIdx !== -1) {
                    countriesList = [];
                    for (let r = 1; r < rows.length; r++) {
                        const row = rows[r];
                        if (row.length <= Math.max(countryIdx, impIdx))
                            continue;
                        const c = row[countryIdx].trim();
                        if (c) {
                            countriesList.push({
                                country: c,
                                impressions: parseIntLoose(row[impIdx]),
                            });
                        }
                    }
                }
            }
        }
        let devicesList;
        if (deviceFile) {
            if (!primaryFile)
                primaryFile = deviceFile;
            const content = await readFile(deviceFile.path, 'utf8');
            const rows = parseCsv(content);
            if (rows.length >= 2) {
                const header = rows[0];
                const deviceIdx = findColumn(header, ALIASES.device);
                const impIdx = findColumn(header, ALIASES.impressions);
                if (deviceIdx !== -1 && impIdx !== -1) {
                    devicesList = [];
                    for (let r = 1; r < rows.length; r++) {
                        const row = rows[r];
                        if (row.length <= Math.max(deviceIdx, impIdx))
                            continue;
                        const dev = row[deviceIdx].trim();
                        if (dev) {
                            devicesList.push({
                                device: dev,
                                impressions: parseIntLoose(row[impIdx]),
                            });
                        }
                    }
                }
            }
        }
        if (!impressionsCounted) {
            return {
                available: false,
                surface: args.surface,
                reason: `No se pudo extraer métrica de impresiones de los CSVs de ${args.surface}`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                    notes: primaryFile ? `${primaryFile.name} (${primaryFile.mtime.toISOString()})` : undefined,
                },
            };
        }
        const provenanceBase = {
            ...EXPORT_GSC_UI,
            notes: primaryFile ? `${primaryFile.name} (${primaryFile.mtime.toISOString()})` : undefined,
        };
        return {
            available: true,
            surface: args.surface,
            impressions: measured(totalImpressions, provenanceBase),
            ...(pagesCounted ? { pages_count: measured(pagesCount, provenanceBase) } : {}),
            ...(countriesList ? { countries: measured(countriesList, provenanceBase) } : {}),
            ...(devicesList ? { devices: measured(devicesList, provenanceBase) } : {}),
            coverage: { first_date: firstDate, last_date: lastDate },
            provenance: {
                ...EXPORT_GSC_UI,
                retrieved_at: new Date().toISOString(),
                notes: primaryFile ? `${primaryFile.name} (${primaryFile.mtime.toISOString()})` : undefined,
            },
        };
    }
    async getPages(args) {
        const files = await this.discoverCsvFiles();
        const pageFile = files.find((f) => f.surface === args.surface && f.dimension === 'page');
        if (!pageFile) {
            return {
                available: false,
                surface: args.surface,
                rows: [],
                truncated: false,
                total_rows_in_source: null,
                reason: `No se encontró fichero de páginas CSV para la superficie ${args.surface} en ${this.exportDir}`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                    notes: `Directorio: ${this.exportDir}`,
                },
            };
        }
        const content = await readFile(pageFile.path, 'utf8');
        const rows = parseCsv(content);
        if (rows.length < 2) {
            return {
                available: false,
                surface: args.surface,
                rows: [],
                truncated: false,
                total_rows_in_source: 0,
                reason: `El fichero ${pageFile.name} está vacío o no contiene filas`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                    notes: pageFile.name,
                },
            };
        }
        const header = rows[0];
        const pageIdx = findColumn(header, ALIASES.page);
        const impIdx = findColumn(header, ALIASES.impressions);
        if (pageIdx === -1 || impIdx === -1) {
            return {
                available: false,
                surface: args.surface,
                rows: [],
                truncated: false,
                total_rows_in_source: null,
                reason: `Cabeceras no reconocidas en ${pageFile.name}. Observadas: [${header.join(', ')}]. Esperadas para página: [${ALIASES.page.join(', ')}], impresiones: [${ALIASES.impressions.join(', ')}]`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                    notes: pageFile.name,
                },
            };
        }
        const pageMap = new Map();
        for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            if (row.length <= Math.max(pageIdx, impIdx))
                continue;
            const page = row[pageIdx].trim();
            if (!page)
                continue;
            const imp = parseIntLoose(row[impIdx]);
            pageMap.set(page, (pageMap.get(page) ?? 0) + imp);
        }
        const allPages = Array.from(pageMap.entries()).map(([page, impressions]) => ({
            page,
            impressions,
        }));
        allPages.sort((a, b) => b.impressions - a.impressions);
        const totalCount = allPages.length;
        const truncated = totalCount > args.limit;
        const sliced = allPages.slice(0, args.limit);
        return {
            available: true,
            surface: args.surface,
            rows: sliced,
            truncated,
            total_rows_in_source: totalCount,
            provenance: {
                ...EXPORT_GSC_UI,
                retrieved_at: new Date().toISOString(),
                notes: `${pageFile.name} (${pageFile.mtime.toISOString()})`,
            },
        };
    }
    async getTimeseries(args) {
        const files = await this.discoverCsvFiles();
        const dateFile = files.find((f) => f.surface === args.surface && f.dimension === 'date');
        if (!dateFile) {
            return {
                available: false,
                surface: args.surface,
                granularity: args.granularity,
                points: [],
                reason: `No se encontró fichero de fechas CSV para la superficie ${args.surface} en ${this.exportDir}`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                    notes: `Directorio: ${this.exportDir}`,
                },
            };
        }
        const content = await readFile(dateFile.path, 'utf8');
        const rows = parseCsv(content);
        if (rows.length < 2) {
            return {
                available: false,
                surface: args.surface,
                granularity: args.granularity,
                points: [],
                reason: `El fichero ${dateFile.name} está vacío o no contiene filas`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                    notes: dateFile.name,
                },
            };
        }
        const header = rows[0];
        const dateIdx = findColumn(header, ALIASES.date);
        const impIdx = findColumn(header, ALIASES.impressions);
        if (dateIdx === -1 || impIdx === -1) {
            return {
                available: false,
                surface: args.surface,
                granularity: args.granularity,
                points: [],
                reason: `Cabeceras no reconocidas en ${dateFile.name}. Observadas: [${header.join(', ')}]. Esperadas para fecha: [${ALIASES.date.join(', ')}], impresiones: [${ALIASES.impressions.join(', ')}]`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                    notes: dateFile.name,
                },
            };
        }
        const dailyPoints = [];
        for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            if (row.length <= Math.max(dateIdx, impIdx))
                continue;
            const d = row[dateIdx].trim();
            if (d >= args.window.start_date && d <= args.window.end_date) {
                dailyPoints.push({
                    date: d,
                    impressions: parseIntLoose(row[impIdx]),
                });
            }
        }
        dailyPoints.sort((a, b) => a.date.localeCompare(b.date));
        let finalPoints;
        if (args.granularity === 'MONTH') {
            const monthMap = new Map();
            for (const p of dailyPoints) {
                const monthKey = p.date.slice(0, 7); // YYYY-MM
                monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + p.impressions);
            }
            finalPoints = Array.from(monthMap.entries())
                .map(([date, impressions]) => ({ date, impressions }))
                .sort((a, b) => a.date.localeCompare(b.date));
        }
        else if (args.granularity === 'WEEK') {
            const weekMap = new Map();
            for (const p of dailyPoints) {
                const d = new Date(p.date + 'T00:00:00Z');
                const dayOfWeek = d.getUTCDay(); // 0 is Sunday
                const mondayOffset = (dayOfWeek + 6) % 7;
                const monday = new Date(d.getTime() - mondayOffset * 24 * 60 * 60 * 1000);
                const weekKey = monday.toISOString().slice(0, 10);
                weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + p.impressions);
            }
            finalPoints = Array.from(weekMap.entries())
                .map(([date, impressions]) => ({ date, impressions }))
                .sort((a, b) => a.date.localeCompare(b.date));
        }
        else {
            finalPoints = dailyPoints;
        }
        return {
            available: true,
            surface: args.surface,
            granularity: args.granularity,
            points: finalPoints,
            provenance: {
                ...EXPORT_GSC_UI,
                retrieved_at: new Date().toISOString(),
                notes: `${dateFile.name} (${dateFile.mtime.toISOString()})`,
            },
        };
    }
}
//# sourceMappingURL=gsc-export.js.map