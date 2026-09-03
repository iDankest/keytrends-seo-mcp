import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { EXPORT_GSC_UI, measured } from '../../models/provenance.js';
import { findColumn, normalizeHeader, parseCsv, parseIntLoose } from '../../utils/csv.js';
import { createHttpClient } from '../../utils/http.js';
const ALIASES = {
    date: ['date', 'fecha', 'dia'],
    page: ['page', 'pages', 'top pages', 'pagina', 'paginas', 'paginas principales', 'url'],
    country: ['country', 'countries', 'pais', 'paises'],
    device: ['device', 'devices', 'dispositivo', 'dispositivos'],
    impressions: ['impressions', 'impresiones'],
};
const MAX_EXPORT_CSV_CHARS = 10 * 1024 * 1024; // tope de 10 MB por CSV remoto
const STALE_EXPORT_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
/** Clasifica un nombre de fichero (o el último segmento de una URL) en (surface, dimension). */
export function classifyCsvName(pathOrName) {
    const lower = pathOrName.toLowerCase();
    const base = lower.split(/[\\/]/).pop() ?? lower;
    const surface = lower.includes('discover') ? 'DISCOVER' : 'SEARCH';
    const baseNorm = normalizeHeader(base.replace(/\.csv$/i, ''));
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
    return { surface, dimension };
}
function parseHttpDate(value) {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
}
/** Último segmento del path de la URL, decodificado; fallback seguro. */
function csvNameFromUrl(url) {
    let pathname = url;
    try {
        pathname = new URL(url).pathname;
    }
    catch {
        // URL relativa o malformada: usar el string tal cual
    }
    const segment = pathname.split('/').filter(Boolean).pop();
    if (!segment)
        return 'export.csv';
    try {
        return decodeURIComponent(segment);
    }
    catch {
        return segment;
    }
}
function formatFileNote(rec) {
    return rec.mtime
        ? `${rec.name} (${rec.mtime.toISOString()})`
        : `${rec.name} (fecha de export desconocida)`;
}
function stalenessNote(records) {
    const known = records.map((r) => r.mtime).filter((m) => m !== null);
    if (known.length === 0)
        return null;
    const newest = known.reduce((a, b) => (b.getTime() > a.getTime() ? b : a));
    if (Date.now() - newest.getTime() > STALE_EXPORT_MS) {
        return `Export con antigüedad ≥30 días (${newest.toISOString()}); refresca con scripts/publish-ai-export.mjs`;
    }
    return null;
}
export class GscExportAiVisibilityProvider {
    id = 'gsc_export';
    exportDir;
    urls = null;
    token = null;
    httpClient = null;
    logger;
    urlErrors = [];
    loadFailed = false;
    constructor(exportDir, logger) {
        this.exportDir = exportDir;
        this.logger = logger;
    }
    /**
     * Factoría para el modo URL: descarga cada CSV remoto (GET con
     * `Authorization: Bearer <token>` si hay token). `httpClient` es inyectable
     * para tests.
     */
    static fromUrls(urls, opts) {
        const provider = new GscExportAiVisibilityProvider(null, opts.logger);
        provider.urls = [...urls];
        provider.token = opts.token;
        provider.httpClient =
            opts.httpClient ??
                createHttpClient({
                    timeoutMs: opts.timeoutMs,
                    userAgent: '@keytrends/seo-mcp',
                    logger: opts.logger,
                });
        return provider;
    }
    get sourceLabel() {
        return this.urls ? 'KEYTRENDS_AI_EXPORT_URL' : String(this.exportDir);
    }
    /** Carga unificada: descarga remota por URL o descubrimiento en directorio local. */
    async loadCsvs() {
        if (this.urls) {
            return this.fetchCsvsFromUrls();
        }
        return this.discoverCsvFiles();
    }
    async fetchCsvsFromUrls() {
        this.urlErrors = [];
        const records = [];
        const headers = {};
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        for (const url of this.urls) {
            try {
                const resp = await this.httpClient.request(url, { method: 'GET', headers });
                if (!resp.ok) {
                    this.urlErrors.push(`${url} → HTTP ${resp.status}`);
                    continue;
                }
                if (resp.text.length > MAX_EXPORT_CSV_CHARS) {
                    this.urlErrors.push(`${url} → contenido demasiado grande (>10 MB)`);
                    continue;
                }
                const lastModified = resp.headers.get('last-modified');
                const mtime = lastModified ? parseHttpDate(lastModified) : null;
                const name = csvNameFromUrl(url);
                const classified = classifyCsvName(name);
                records.push({
                    name,
                    surface: classified.surface,
                    dimension: classified.dimension,
                    mtime,
                    content: resp.text,
                });
            }
            catch (err) {
                this.urlErrors.push(`${url} → ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        this.loadFailed = records.length === 0;
        return records;
    }
    /** Nota de provenance: fichero primario + fallos parciales de URL + antigüedad. */
    composeNotes(primary, records) {
        const parts = [];
        if (primary)
            parts.push(formatFileNote(primary));
        if (this.urlErrors.length > 0)
            parts.push(`URLs fallidas: ${this.urlErrors.join('; ')}`);
        const stale = stalenessNote(records);
        if (stale)
            parts.push(stale);
        return parts.length > 0 ? parts.join('; ') : undefined;
    }
    /** Modo directorio: escanea el árbol (profundidad 1) leyendo cada CSV. */
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
                    const classified = classifyCsvName(fullPath);
                    files.push({
                        name: entry.name,
                        surface: classified.surface,
                        dimension: classified.dimension,
                        mtime: stats.mtime,
                        content: await readFile(fullPath, 'utf8'),
                    });
                }
            }
        }
        await scanDir(this.exportDir, 0);
        return files;
    }
    async getSummary(args) {
        const files = await this.loadCsvs();
        if (this.loadFailed) {
            return {
                available: false,
                surface: args.surface,
                reason: `No se pudieron descargar los CSV de KEYTRENDS_AI_EXPORT_URL: ${this.urlErrors.join('; ')}`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                },
            };
        }
        const surfaceFiles = files.filter((f) => f.surface === args.surface);
        if (surfaceFiles.length === 0) {
            return {
                available: false,
                surface: args.surface,
                reason: `No se encontraron ficheros CSV para la superficie ${args.surface} en ${this.sourceLabel}`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                    notes: this.urls ? `URLs configuradas: ${this.urls.join(', ')}` : `Directorio de exportación: ${this.exportDir}`,
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
            const rows = parseCsv(dateFile.content);
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
            const rows = parseCsv(pageFile.content);
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
            const rows = parseCsv(countryFile.content);
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
            const rows = parseCsv(deviceFile.content);
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
        const notes = this.composeNotes(primaryFile, files);
        if (!impressionsCounted) {
            return {
                available: false,
                surface: args.surface,
                reason: `No se pudo extraer métrica de impresiones de los CSVs de ${args.surface}`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                    notes,
                },
            };
        }
        const provenanceBase = {
            ...EXPORT_GSC_UI,
            notes,
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
                notes,
            },
        };
    }
    async getPages(args) {
        const files = await this.loadCsvs();
        if (this.loadFailed) {
            return {
                available: false,
                surface: args.surface,
                rows: [],
                truncated: false,
                total_rows_in_source: null,
                reason: `No se pudieron descargar los CSV de KEYTRENDS_AI_EXPORT_URL: ${this.urlErrors.join('; ')}`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                },
            };
        }
        const pageFile = files.find((f) => f.surface === args.surface && f.dimension === 'page');
        if (!pageFile) {
            return {
                available: false,
                surface: args.surface,
                rows: [],
                truncated: false,
                total_rows_in_source: null,
                reason: `No se encontró fichero de páginas CSV para la superficie ${args.surface} en ${this.sourceLabel}`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                    notes: this.urls ? `URLs configuradas: ${this.urls.join(', ')}` : `Directorio: ${this.exportDir}`,
                },
            };
        }
        const rows = parseCsv(pageFile.content);
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
                notes: this.composeNotes(pageFile, files),
            },
        };
    }
    async getTimeseries(args) {
        const files = await this.loadCsvs();
        if (this.loadFailed) {
            return {
                available: false,
                surface: args.surface,
                granularity: args.granularity,
                points: [],
                reason: `No se pudieron descargar los CSV de KEYTRENDS_AI_EXPORT_URL: ${this.urlErrors.join('; ')}`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                },
            };
        }
        const dateFile = files.find((f) => f.surface === args.surface && f.dimension === 'date');
        if (!dateFile) {
            return {
                available: false,
                surface: args.surface,
                granularity: args.granularity,
                points: [],
                reason: `No se encontró fichero de fechas CSV para la superficie ${args.surface} en ${this.sourceLabel}`,
                provenance: {
                    ...EXPORT_GSC_UI,
                    retrieved_at: new Date().toISOString(),
                    notes: this.urls ? `URLs configuradas: ${this.urls.join(', ')}` : `Directorio: ${this.exportDir}`,
                },
            };
        }
        const rows = parseCsv(dateFile.content);
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
                notes: this.composeNotes(dateFile, files),
            },
        };
    }
}
//# sourceMappingURL=gsc-export.js.map