const LEVEL_SEVERITY = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
};
export function createLogger(level = 'info', baseFields = {}) {
    const currentSeverity = LEVEL_SEVERITY[level] ?? LEVEL_SEVERITY.info;
    function writeLog(lvl, msg, fields) {
        if (LEVEL_SEVERITY[lvl] > currentSeverity || currentSeverity === 0) {
            return;
        }
        const record = {
            ts: new Date().toISOString(),
            level: lvl,
            msg,
            ...baseFields,
            ...(fields !== undefined ? fields : {}),
        };
        try {
            process.stderr.write(JSON.stringify(record) + '\n');
        }
        catch {
            // Avoid failing process if stderr write fails
        }
    }
    return {
        error(msg, fields) {
            writeLog('error', msg, fields);
        },
        warn(msg, fields) {
            writeLog('warn', msg, fields);
        },
        info(msg, fields) {
            writeLog('info', msg, fields);
        },
        debug(msg, fields) {
            writeLog('debug', msg, fields);
        },
        child(fields) {
            return createLogger(level, { ...baseFields, ...fields });
        },
    };
}
//# sourceMappingURL=logger.js.map