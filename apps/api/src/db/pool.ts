import pg from 'pg';
import type { Config } from '../config.js';

export function createPool(config: Config): pg.Pool {
  return new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: config.dbSsl ? { rejectUnauthorized: true } : false,
    max: config.dbPoolMax,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    idleTimeoutMillis: 30000,
    allowExitOnIdle: true,
  });
}

export async function checkDatabase(pool: pg.Pool): Promise<boolean> {
  await pool.query('SELECT 1');
  return true;
}
