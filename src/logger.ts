import fs from 'fs';
import path from 'path';
import { config } from './config';

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function ensureLogsDir(): void {
  try {
    fs.mkdirSync(config.logsDir, { recursive: true });
  } catch {
    // ignore: logging must never crash the app
  }
}

function todayFile(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(config.logsDir, `${date}.log`);
}

function fmt(level: Level, scope: string, msg: string, meta?: unknown): string {
  const base = `${new Date().toISOString()} [${level}] [${scope}] ${msg}`;
  if (meta === undefined) return base;
  let extra: string;
  if (meta instanceof Error) {
    extra = `${meta.name}: ${meta.message}`;
  } else {
    try {
      extra = JSON.stringify(meta);
    } catch {
      extra = String(meta);
    }
  }
  return `${base} ${extra}`;
}

function write(level: Level, scope: string, msg: string, meta?: unknown): void {
  const line = fmt(level, scope, msg, meta);
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
  try {
    ensureLogsDir();
    fs.appendFileSync(todayFile(), line + '\n');
  } catch {
    // ignore file errors
  }
}

export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, meta) => write('DEBUG', scope, m, meta),
    info: (m, meta) => write('INFO', scope, m, meta),
    warn: (m, meta) => write('WARN', scope, m, meta),
    error: (m, meta) => write('ERROR', scope, m, meta),
  };
}
