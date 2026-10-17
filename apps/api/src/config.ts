export interface Config {
  databaseUrl: string;
  dbSsl: boolean;
  dbPoolMax: number;
  host: string;
  port: number;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} must be a positive integer (up to 65535)`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl || !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  if (
    env.DB_SSL !== undefined &&
    env.DB_SSL !== 'true' &&
    env.DB_SSL !== 'false'
  ) {
    throw new Error('DB_SSL must be true or false');
  }
  return {
    databaseUrl,
    dbSsl: env.DB_SSL === 'true',
    dbPoolMax: positiveInteger(env.DB_POOL_MAX, 10, 'DB_POOL_MAX'),
    host: env.API_HOST ?? '127.0.0.1',
    port: positiveInteger(env.API_PORT, 3001, 'API_PORT'),
  };
}
