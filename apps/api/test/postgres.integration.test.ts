import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createPool, checkDatabase } from '../src/db/pool.js';
import { loadConfig } from '../src/config.js';

it('reports ready against an actual PostgreSQL container', async () => {
  const container = await new PostgreSqlContainer(
    'postgres:16.10-alpine',
  ).start();
  const pool = createPool(
    loadConfig({ DATABASE_URL: container.getConnectionUri() }),
  );
  const app = buildApp({ checkDatabase: () => checkDatabase(pool) });
  try {
    const response = await app.inject('/health/ready');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  } finally {
    await app.close();
    await pool.end();
    await container.stop();
  }
}, 120_000);
