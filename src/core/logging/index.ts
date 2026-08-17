import type { LogLevel } from '@/core/domain/types';
import { logEvent } from '@/core/native/api';

type LogFields = Record<string, unknown>;

function write(level: LogLevel, event: string, fields?: LogFields): void {
  const payload = fields ?? {};
  void logEvent(level, event, payload).catch(() => undefined);
  const line = `[${level}] ${event}${Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logInfo = (event: string, fields?: LogFields) => write('info', event, fields);
export const logWarn = (event: string, fields?: LogFields) => write('warn', event, fields);
export const logError = (event: string, fields?: LogFields) => write('error', event, fields);
export const logDebug = (event: string, fields?: LogFields) => write('debug', event, fields);
