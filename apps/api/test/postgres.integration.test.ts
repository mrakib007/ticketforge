import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabase, checkDatabase } from '../src/db/client.js';
import { loadConfig } from '../src/config.js';

const execFileAsync = promisify(execFile);
const prismaCli = createRequire(import.meta.url).resolve(
  'prisma/build/index.js',
);

it('runs Prisma migrations repeatedly and reports ready against PostgreSQL', async () => {
  const container = await new PostgreSqlContainer(
    'postgres:16.10-alpine',
  ).start();
  const databaseUrl = container.getConnectionUri();
  const database = createDatabase(loadConfig({ DATABASE_URL: databaseUrl }));
  const app = buildApp({ checkDatabase: () => checkDatabase(database) });
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      await execFileAsync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          DIRECT_URL: '',
          DB_SSL: 'false',
        },
        timeout: 60_000,
      });
    }
    const response = await app.inject('/health/ready');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  } finally {
    await app.close();
    await database.$disconnect();
    await container.stop();
  }
}, 120_000);

it('reports unavailable without exposing database credentials', async () => {
  const database = createDatabase(
    loadConfig({
      DATABASE_URL:
        'postgresql://test:private_password@127.0.0.1:1/unavailable',
    }),
  );
  const app = buildApp({ checkDatabase: () => checkDatabase(database) });
  try {
    const response = await app.inject('/health/ready');
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private_password');
  } finally {
    await app.close();
    await database.$disconnect();
  }
}, 15_000);
