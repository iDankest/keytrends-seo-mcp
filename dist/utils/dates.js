import { KeytrendsError } from '../models/errors.js';
export function todayInPacific(now) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}
export function parseDateUtc(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) {
        throw new KeytrendsError({
            code: 'INVALID_ARGUMENT',
            message: `Formato de fecha inválido: ${dateStr}. Usa YYYY-MM-DD.`,
        });
    }
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
        throw new KeytrendsError({
            code: 'INVALID_ARGUMENT',
            message: `Formato de fecha inválido: ${dateStr}. Usa YYYY-MM-DD.`,
        });
    }
    return Date.UTC(year, month - 1, day);
}
export function daysBetween(a, b) {
    const utcA = parseDateUtc(a);
    const utcB = parseDateUtc(b);
    return Math.round((utcB - utcA) / (24 * 60 * 60 * 1000));
}
export function addDays(dateStr, days) {
    const ms = parseDateUtc(dateStr) + days * 24 * 60 * 60 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
}
export function resolveWindow(args) {
    const { range, start_date, end_date, now } = args;
    if (range === 'custom' || (!range && start_date && end_date)) {
        if (!start_date || !end_date) {
            throw new KeytrendsError({
                code: 'INVALID_ARGUMENT',
                message: 'El rango custom exige tanto start_date como end_date (formato YYYY-MM-DD)',
            });
        }
        if (start_date > end_date) {
            throw new KeytrendsError({
                code: 'INVALID_ARGUMENT',
                message: `start_date (${start_date}) no puede ser posterior a end_date (${end_date})`,
            });
        }
        const days = daysBetween(start_date, end_date) + 1;
        return { start_date, end_date, days };
    }
    const effectiveRange = range ?? '28d';
    let days;
    switch (effectiveRange) {
        case '7d':
            days = 7;
            break;
        case '28d':
            days = 28;
            break;
        case '90d':
            days = 90;
            break;
        case '12mo':
            days = 365;
            break;
        default:
            days = 28;
            break;
    }
    const resolvedEnd = end_date ?? addDays(todayInPacific(now), -2);
    const resolvedStart = start_date ?? addDays(resolvedEnd, -(days - 1));
    if (resolvedStart > resolvedEnd) {
        throw new KeytrendsError({
            code: 'INVALID_ARGUMENT',
            message: `start_date (${resolvedStart}) no puede ser posterior a end_date (${resolvedEnd})`,
        });
    }
    const calculatedDays = daysBetween(resolvedStart, resolvedEnd) + 1;
    return { start_date: resolvedStart, end_date: resolvedEnd, days: calculatedDays };
}
export function shiftWindowBack(w) {
    const newEnd = addDays(w.start_date, -1);
    const newStart = addDays(newEnd, -(w.days - 1));
    return { start_date: newStart, end_date: newEnd, days: w.days };
}
//# sourceMappingURL=dates.js.map