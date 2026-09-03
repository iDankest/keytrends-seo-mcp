import { KeytrendsError } from '../models/errors.js';
export function parseCsv(text) {
    const cleanText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;
    while (i < cleanText.length) {
        const char = cleanText[i];
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < cleanText.length && cleanText[i + 1] === '"') {
                    currentField += '"';
                    i += 2;
                    continue;
                }
                else {
                    inQuotes = false;
                    i++;
                    continue;
                }
            }
            else {
                currentField += char;
                i++;
                continue;
            }
        }
        else {
            if (char === '"') {
                inQuotes = true;
                i++;
                continue;
            }
            else if (char === ',') {
                currentRow.push(currentField);
                currentField = '';
                i++;
                continue;
            }
            else if (char === '\r') {
                if (i + 1 < cleanText.length && cleanText[i + 1] === '\n') {
                    i++;
                }
                currentRow.push(currentField);
                currentField = '';
                rows.push(currentRow);
                currentRow = [];
                i++;
                continue;
            }
            else if (char === '\n') {
                currentRow.push(currentField);
                currentField = '';
                rows.push(currentRow);
                currentRow = [];
                i++;
                continue;
            }
            else {
                currentField += char;
                i++;
                continue;
            }
        }
    }
    // Push last field & row if not empty or if trailing row exists
    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    // Filter out any trailing empty row
    if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        if (lastRow.length === 1 && lastRow[0].trim() === '') {
            rows.pop();
        }
    }
    return rows;
}
export function normalizeHeader(s) {
    return s
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}
export function findColumn(header, aliases) {
    const normalizedAliases = aliases.map(normalizeHeader);
    for (let i = 0; i < header.length; i++) {
        const norm = normalizeHeader(header[i]);
        if (normalizedAliases.includes(norm)) {
            return i;
        }
    }
    return -1;
}
export function parseIntLoose(raw) {
    const stripped = raw.replace(/[^\d-]/g, '');
    if (stripped.length === 0 || stripped === '-') {
        throw new KeytrendsError({
            code: 'INVALID_ARGUMENT',
            message: `No se pudo parsear como entero el valor: '${raw}'`,
        });
    }
    const parsed = parseInt(stripped, 10);
    if (isNaN(parsed)) {
        throw new KeytrendsError({
            code: 'INVALID_ARGUMENT',
            message: `No se pudo parsear como entero el valor: '${raw}'`,
        });
    }
    return parsed;
}
//# sourceMappingURL=csv.js.map