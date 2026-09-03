export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export interface Logger {
  error(msg: string, fields?: object): void;
  warn(msg: string, fields?: object): void;
  info(msg: string, fields?: object): void;
  debug(msg: string, fields?: object): void;
  child(fields: object): Logger;
}

export function createLogger(level: LogLevel = 'info', baseFields: object = {}): Logger {
  const currentSeverity = LEVEL_SEVERITY[level] ?? LEVEL_SEVERITY.info;

  function writeLog(lvl: LogLevel, msg: string, fields?: object) {
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
    } catch {
      // Avoid failing process if stderr write fails
    }
  }

  return {
    error(msg: string, fields?: object) {
      writeLog('error', msg, fields);
    },
    warn(msg: string, fields?: object) {
      writeLog('warn', msg, fields);
    },
    info(msg: string, fields?: object) {
      writeLog('info', msg, fields);
    },
    debug(msg: string, fields?: object) {
      writeLog('debug', msg, fields);
    },
    child(fields: object) {
      return createLogger(level, { ...baseFields, ...fields });
    },
  };
}
