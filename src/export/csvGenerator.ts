import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { createLogger } from '../logger';
import type { LeadRow } from '../db/models';

const log = createLogger('export:csv');

const HEADERS = ['email', 'first_name', 'company', 'job_title', 'country'] as const;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsvContent(rows: LeadRow[]): string {
  const lines = [HEADERS.join(',')];
  for (const row of rows) {
    lines.push(HEADERS.map((h) => csvEscape(row[h] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

/** Writes leads to exports/YYYY-MM-DD.csv. Returns the absolute file path. */
export function generateCsv(rows: LeadRow[], date = new Date()): string {
  fs.mkdirSync(config.exportsDir, { recursive: true });
  const filename = `${date.toISOString().slice(0, 10)}.csv`;
  const filePath = path.join(config.exportsDir, filename);
  fs.writeFileSync(filePath, buildCsvContent(rows), 'utf8');
  log.info(`wrote ${rows.length} leads to ${filePath}`);
  return filePath;
}
