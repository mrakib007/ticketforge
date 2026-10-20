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
import { createAuthRepository } from '../src/modules/auth/repository.js';

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
    auth: createAuthRepository(database),
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
    const registration = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'Reader@Example.com',
        password: 'correct horse battery staple',
      },
    });
    expect(registration.statusCode).toBe(201);
    const token = registration.json().token as string;
    const headers = { authorization: `Bearer ${token}` };
    const storedSession = await database.session.findFirstOrThrow();
    expect(storedSession.tokenHash).not.toBe(token);
    expect(storedSession.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (await app.inject({ url: '/auth/me', headers })).json().user.email,
    ).toBe('reader@example.com');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: 'reader@example.com',
            password: 'correct horse battery staple',
          },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'reader@example.com',
            password: 'incorrect password',
          },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'reader@example.com',
            password: 'correct horse battery staple',
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/auth/logout', headers }))
        .statusCode,
    ).toBe(204);
    expect((await app.inject({ url: '/auth/me', headers })).statusCode).toBe(
      401,
    );
    const freshLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'reader@example.com',
        password: 'correct horse battery staple',
      },
    });
    const loginToken = freshLogin.json().token as string;
    await database.session.updateMany({ data: { expiresAt: new Date(0) } });
    expect(
      (
        await app.inject({
          url: '/auth/me',
          headers: { authorization: `Bearer ${loginToken}` },
        })
      ).statusCode,
    ).toBe(401);
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
