import { Pool } from 'pg';
import { config } from '../config';
import { createLogger } from '../logger';

const log = createLogger('db:pool');

export const pool = new Pool({ connectionString: config.databaseUrl });

pool.on('error', (err) => {
  log.error('unexpected idle client error', err);
});

export async function pingDb(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    log.error('db ping failed', err);
    return false;
  }
}
