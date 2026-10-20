import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabase, checkDatabase } from '../src/db/client.js';
import { loadConfig } from '../src/config.js';
import { createEventReader } from '../src/modules/events/repository.js';

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
  const app = buildApp({
    checkDatabase: () => checkDatabase(database),
    events: createEventReader(database),
  });
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
    const tomorrow = new Date(Date.now() + 86_400_000);
    const later = new Date(Date.now() + 90_000_000);
    const published = await database.event.create({
      data: {
        title: 'Public',
        description: 'Open to all',
        venue: 'Hall',
        startsAt: tomorrow,
        endsAt: later,
        published: true,
      },
    });
    const draft = await database.event.create({
      data: {
        title: 'Draft',
        description: 'Private',
        venue: 'Hall',
        startsAt: tomorrow,
        endsAt: later,
      },
    });
    const past = await database.event.create({
      data: {
        title: 'Past',
        description: 'Finished',
        venue: 'Hall',
        startsAt: new Date('2020-01-01T10:00:00Z'),
        endsAt: new Date('2020-01-01T11:00:00Z'),
        published: true,
      },
    });
    const events = await app.inject('/events');
    expect(events.statusCode).toBe(200);
    expect(events.json().events).toEqual([
      {
        id: published.id,
        title: 'Public',
        description: 'Open to all',
        venue: 'Hall',
        startsAt: tomorrow.toISOString(),
        endsAt: later.toISOString(),
      },
    ]);
    expect((await app.inject(`/events/${draft.id}`)).statusCode).toBe(404);
    expect((await app.inject(`/events/${published.id}`)).statusCode).toBe(200);
    expect((await app.inject(`/events/${past.id}`)).statusCode).toBe(200);
    await expect(
      database.event.create({
        data: {
          title: 'Invalid',
          description: 'Invalid',
          venue: 'Hall',
          startsAt: later,
          endsAt: tomorrow,
        },
      }),
    ).rejects.toThrow();
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
