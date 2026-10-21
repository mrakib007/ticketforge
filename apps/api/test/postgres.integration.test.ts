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
import { createBookingRepository } from '../src/modules/bookings/repository.js';

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
    bookings: createBookingRepository(database),
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
        remainingSeats: 0,
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
    const cutoff = new Date('2026-10-20T00:00:00Z');
    const userId = storedSession.userId;
    await database.session.createMany({
      data: [
        { userId, tokenHash: 'a'.repeat(64), expiresAt: cutoff },
        {
          userId,
          tokenHash: 'b'.repeat(64),
          expiresAt: new Date(cutoff.getTime() + 1),
        },
      ],
    });
    expect(
      await createAuthRepository(database).deleteExpiredSessions(cutoff),
    ).toBe(3);
    expect(await database.session.findMany()).toMatchObject([
      { tokenHash: 'b'.repeat(64) },
    ]);
    const bookingEvent = await database.event.create({
      data: {
        title: 'One seat',
        description: 'Limited',
        venue: 'Hall',
        startsAt: tomorrow,
        endsAt: later,
        published: true,
        capacity: 1,
      },
    });
    const bookingLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'reader@example.com',
        password: 'correct horse battery staple',
      },
    });
    const bookingHeaders = {
      authorization: `Bearer ${bookingLogin.json().token as string}`,
    };
    const idempotencyKey = '42057c9b-3d84-4866-a07e-d88c93eb345c';
    const create = () =>
      app.inject({
        method: 'POST',
        url: '/bookings',
        headers: { ...bookingHeaders, 'idempotency-key': idempotencyKey },
        payload: { eventId: bookingEvent.id, quantity: 1 },
      });
    const attempts = await Promise.all([create(), create()]);
    expect(attempts.map((response) => response.statusCode).sort()).toEqual([
      200, 201,
    ]);
    expect(attempts[0]!.json().id).toBe(attempts[1]!.json().id);
    const replay = await create();
    expect(replay.statusCode).toBe(200);
    expect(replay.json().id).toBe(attempts[0]!.json().id);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/bookings',
          headers: { ...bookingHeaders, 'idempotency-key': idempotencyKey },
          payload: { eventId: bookingEvent.id, quantity: 2 },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/bookings',
          headers: {
            ...bookingHeaders,
            'idempotency-key': '88113660-79bf-4919-981b-3120dc467e72',
          },
          payload: { eventId: bookingEvent.id, quantity: 1 },
        })
      ).statusCode,
    ).toBe(409);
    expect(await database.booking.count()).toBe(1);
    expect(
      (
        await database.event.findUniqueOrThrow({
          where: { id: bookingEvent.id },
        })
      ).bookedSeats,
    ).toBe(1);
    const mine = await app.inject({
      url: '/bookings',
      headers: bookingHeaders,
    });
    expect(mine.json().bookings).toHaveLength(1);
    expect(mine.json().bookings[0].event.title).toBe('One seat');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/bookings',
          headers: {
            ...bookingHeaders,
            'idempotency-key': '10d14a30-c45c-480a-873a-4f7e09bda5a1',
          },
          payload: { eventId: draft.id, quantity: 1 },
        })
      ).statusCode,
    ).toBe(404);
    const other = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'other@example.com',
        password: 'correct horse battery staple',
      },
    });
    expect(
      (
        await app.inject({
          url: '/bookings',
          headers: { authorization: `Bearer ${other.json().token as string}` },
        })
      ).json(),
    ).toEqual({ bookings: [] });
    const rollbackEvent = await database.event.create({
      data: {
        title: 'Rollback',
        description: 'Limited',
        venue: 'Hall',
        startsAt: tomorrow,
        endsAt: later,
        published: true,
        capacity: 1,
      },
    });
    await expect(
      createBookingRepository(database).create(
        '00000000-0000-0000-0000-000000000000',
        rollbackEvent.id,
        1,
        'e1f6121c-5ff4-47c8-bfc1-fc12350411cc',
      ),
    ).rejects.toThrow();
    expect(
      (
        await database.event.findUniqueOrThrow({
          where: { id: rollbackEvent.id },
        })
      ).bookedSeats,
    ).toBe(0);
    const otherEvent = await database.event.create({
      data: {
        title: 'Other event',
        description: 'Open',
        venue: 'Hall',
        startsAt: tomorrow,
        endsAt: later,
        published: true,
        capacity: 2,
      },
    });
    const sameKey = '78356b85-7907-46c4-a83e-06c80307761b';
    const concurrent = await Promise.all(
      [rollbackEvent.id, otherEvent.id].map((id) =>
        app.inject({
          method: 'POST',
          url: '/bookings',
          headers: { ...bookingHeaders, 'idempotency-key': sameKey },
          payload: { eventId: id, quantity: 1 },
        }),
      ),
    );
    expect(concurrent.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    const inventories = await database.event.findMany({
      where: { id: { in: [rollbackEvent.id, otherEvent.id] } },
      select: { bookedSeats: true },
    });
    expect(inventories.reduce((sum, event) => sum + event.bookedSeats, 0)).toBe(
      1,
    );
    const otherHeaders = {
      authorization: `Bearer ${other.json().token as string}`,
      'idempotency-key': idempotencyKey,
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/bookings',
          headers: otherHeaders,
          payload: { eventId: otherEvent.id, quantity: 1 },
        })
      ).statusCode,
    ).toBe(201);
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
