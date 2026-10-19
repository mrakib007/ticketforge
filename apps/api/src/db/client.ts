import { PrismaPg } from '@prisma/adapter-pg';
import type { Config } from '../config.js';
import { PrismaClient } from '../generated/prisma/client.js';

export function databaseOptions(config: Config) {
  return {
    connectionString: config.databaseUrl,
    ssl: config.dbSsl ? { rejectUnauthorized: true } : false,
    max: config.dbPoolMax,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    idleTimeoutMillis: 30000,
    allowExitOnIdle: true,
  };
}

export function createDatabase(
  config: Config,
  onConnectionError: () => void = () =>
    console.error('PostgreSQL connection error'),
): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(databaseOptions(config), {
      onPoolError: onConnectionError,
      onConnectionError,
    }),
    log: [],
    errorFormat: 'minimal',
  });
}

export async function checkDatabase(database: PrismaClient): Promise<boolean> {
  await database.$queryRaw`SELECT 1`;
  return true;
}
