import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
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
import { createOrganizerRepository } from '../src/modules/organizer/repository.js';
import { createCinemaReader } from '../src/modules/cinema/repository.js';
import { createCinemaBookingRepository } from '../src/modules/cinema-bookings/repository.js';
import { demoCinemaId, seedCinema } from '../src/db/seed-cinema.js';
import { seedDemoUsers, seedDemoOrganizer } from '../src/db/seed-users.js';
import { verifyPassword } from '../src/modules/auth/password.js';

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
    organizers: createOrganizerRepository(database),
    cinemas: createCinemaReader(database),
    cinemaBookings: createCinemaBookingRepository(database),
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
    await seedCinema(database);
    await seedCinema(database);
    expect(await database.cinema.count()).toBe(1);
    expect(await database.movie.count()).toBe(6);
    expect(await database.auditorium.count()).toBe(1);
    expect(await database.seat.count()).toBe(100);
    expect(await database.screening.count()).toBe(28);
    const cinemaList = await app.inject('/cinemas');
    expect(cinemaList.statusCode).toBe(200);
    expect(cinemaList.json().cinemas[0]).toMatchObject({
      id: demoCinemaId,
      isDemo: true,
    });
    const cinemaShows = await app.inject(`/cinemas/${demoCinemaId}/screenings`);
    expect(cinemaShows.statusCode).toBe(200);
    expect(cinemaShows.json().screenings).toHaveLength(28);
    const shows = cinemaShows.json().screenings as {
      id: string;
      startsAt: string;
      bookingClosesAt: string;
    }[];
    expect(new Set(shows.slice(0, 4).map((show) => show.id)).size).toBe(4);
    expect(
      shows.every(
        (show) => Date.parse(show.bookingClosesAt) < Date.parse(show.startsAt),
      ),
    ).toBe(true);
    const showDetail = await app.inject(
      `/cinemas/${demoCinemaId}/screenings/${shows[0]!.id}`,
    );
    expect(showDetail.statusCode).toBe(200);
    expect(showDetail.json().seats).toHaveLength(100);
    expect(showDetail.json().seats[0]).toMatchObject({ booked: false });
    const auditorium = await database.auditorium.findFirstOrThrow();
    const movie = await database.movie.findFirstOrThrow();
    const alternateStart = new Date(Date.now() + 20 * 86_400_000);
    const alternateEnd = new Date(alternateStart.getTime() + 2 * 3_600_000);
    const fields = {
      auditoriumId: auditorium.id,
      movieId: movie.id,
      startsAt: alternateStart,
      endsAt: alternateEnd,
      bookingClosesAt: new Date(alternateStart.getTime() - 900_000),
      priceMinor: 1200,
      currency: 'USD',
      status: 'PUBLISHED' as const,
    };
    const [firstClaim, overlap] = await Promise.allSettled([
      database.screening.create({ data: fields }),
      database.screening.create({
        data: {
          ...fields,
          startsAt: new Date(alternateStart.getTime() + 3_600_000),
          endsAt: new Date(alternateEnd.getTime() + 3_600_000),
        },
      }),
    ]);
    expect([firstClaim.status, overlap.status].sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    await expect(
      database.screening.create({
        data: { ...fields, bookingClosesAt: alternateEnd },
      }),
    ).rejects.toThrow();
    await expect(
      database.seat.create({
        data: { auditoriumId: auditorium.id, rowLabel: 'A', seatNumber: 1 },
      }),
    ).rejects.toThrow();
    const hidden = await database.screening.create({
      data: {
        ...fields,
        status: 'DRAFT',
        startsAt: new Date(alternateEnd.getTime() + 3_600_000),
        endsAt: new Date(alternateEnd.getTime() + 5 * 3_600_000),
        bookingClosesAt: new Date(alternateEnd.getTime() + 3_600_000 - 900_000),
      },
    });
    expect(
      (await app.inject(`/cinemas/${demoCinemaId}/screenings/${hidden.id}`))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject(`/cinemas/${demoCinemaId}/screenings`)).json()
        .screenings,
    ).toHaveLength(29);
    const soon = new Date(Date.now() + 2 * 3_600_000);
    const closed = await database.screening.create({
      data: {
        ...fields,
        startsAt: soon,
        endsAt: new Date(soon.getTime() + 7_200_000),
        bookingClosesAt: new Date(Date.now() - 3_600_000),
      },
    });
    // A future screening remains visible after its booking cutoff; no seat
    // selection exists yet and the API never claims that it is available.
    expect(
      (await app.inject(`/cinemas/${demoCinemaId}/screenings/${closed.id}`))
        .statusCode,
    ).toBe(200);
    expect(await seedDemoUsers(database, databaseUrl, 'development')).toBe(2);
    expect(await seedDemoOrganizer(database, databaseUrl, 'development')).toBe(
      1,
    );
    expect(await seedDemoOrganizer(database, databaseUrl, 'development')).toBe(
      0,
    );
    const demo = await database.user.findUniqueOrThrow({
      where: { email: 'demo.alice@example.com' },
    });
    expect(await verifyPassword('DemoPassword2026!', demo.passwordHash)).toBe(
      true,
    );
    expect(await seedDemoUsers(database, databaseUrl, 'development')).toBe(0);
    expect(
      (await database.user.findUniqueOrThrow({ where: { id: demo.id } }))
        .passwordHash,
    ).toBe(demo.passwordHash);
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
    expect(registration.json().user.role).toBe('ATTENDEE');
    const token = registration.json().token as string;
    const headers = { authorization: `Bearer ${token}` };
    const seatIds = (showDetail.json().seats as { id: string }[]).map(
      (seat) => seat.id,
    );
    const bookingUrl = `/cinemas/${demoCinemaId}/screenings/${shows[0]!.id}/bookings`;
    const keyA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
    const keyB = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
    expect(
      (
        await app.inject({
          method: 'POST',
          url: bookingUrl,
          headers: { ...headers, 'idempotency-key': keyA },
          payload: { seatIds: seatIds.slice(0, 1) },
        })
      ).statusCode,
    ).toBe(410);
    // Exercise the legacy repository directly to model already-confirmed
    // reservations during rollout; the public free-write route is disabled.
    const reserve = async (ids: string[], key: string, auth = headers) => {
      const session = await database.session.findUniqueOrThrow({
        where: {
          tokenHash: createHash('sha256')
            .update(auth.authorization.slice(7))
            .digest('hex'),
        },
      });
      const result = await createCinemaBookingRepository(database).create(
        session.userId,
        demoCinemaId,
        shows[0]!.id,
        ids,
        key,
      );
      const statusCode =
        result.status === 'ok' ? (result.replayed ? 200 : 201) : 409;
      const body = JSON.stringify(
        result.status === 'limit'
          ? { error: 'Maximum 10 tickets per person for this screening' }
          : result,
      );
      return {
        statusCode,
        body,
        json: () => JSON.parse(body) as Record<string, unknown>,
      };
    };
    const firstCinemaBooking = await reserve(seatIds.slice(0, 6), keyA);
    expect(firstCinemaBooking.statusCode, firstCinemaBooking.body).toBe(201);
    expect(
      (await reserve([...seatIds.slice(0, 6)].reverse(), keyA)).statusCode,
    ).toBe(200);
    expect((await reserve(seatIds.slice(6, 7), keyA)).statusCode).toBe(409);
    expect((await reserve(seatIds.slice(6, 10), keyB)).statusCode).toBe(201);
    expect(
      (
        await reserve(
          seatIds.slice(10, 11),
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',
        )
      ).json().error,
    ).toMatch(/Maximum 10/);
    expect(
      (await app.inject(`/cinemas/${demoCinemaId}/screenings/${shows[0]!.id}`))
        .json()
        .seats.filter((seat: { booked: boolean }) => seat.booked),
    ).toHaveLength(10);
    const second = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'cinema.bob@example.com',
        password: 'correct horse battery staple',
      },
    });
    const cinemaUserHeaders = {
      authorization: `Bearer ${second.json().token as string}`,
    };
    expect(
      (
        await reserve(
          seatIds.slice(0, 1),
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4',
          cinemaUserHeaders,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await reserve(
          seatIds.slice(10, 11),
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5',
          cinemaUserHeaders,
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await reserve(
          seatIds.slice(11, 12),
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6',
          cinemaUserHeaders,
        )
      ).statusCode,
    ).toBe(201);
    const concurrentCinemaBookings = await Promise.all([
      reserve(
        seatIds.slice(12, 20),
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee7',
        cinemaUserHeaders,
      ),
      reserve(
        seatIds.slice(20, 28),
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee8',
        cinemaUserHeaders,
      ),
    ]);
    expect(
      concurrentCinemaBookings.map((response) => response.statusCode).sort(),
    ).toEqual([201, 409]);
    expect(
      await database.cinemaBookingSeat.count({
        where: {
          userId: second.json().user.id as string,
          screeningId: shows[0]!.id,
        },
      }),
    ).toBe(10);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/logout',
          headers: cinemaUserHeaders,
        })
      ).statusCode,
    ).toBe(204);
    // An alternate SQL/Prisma client cannot bypass the per-person cap.
    await expect(
      database.cinemaBookingSeat.create({
        data: {
          bookingId: (
            await database.cinemaBooking.findFirstOrThrow({
              where: { userId: registration.json().user.id as string },
            })
          ).id,
          userId: registration.json().user.id as string,
          screeningId: shows[0]!.id,
          seatId: seatIds[12]!,
        },
      }),
    ).rejects.toThrow();
    // Legacy free reservations remain occupied; holds are temporary, priced
    // snapshots and cannot silently turn into confirmed bookings.
    const holdUrl = `/cinemas/${demoCinemaId}/screenings/${shows[0]!.id}/holds`;
    const holdRequest = (ids: string[], key: string, auth: string) =>
      app.inject({
        method: 'POST',
        url: holdUrl,
        headers: { authorization: `Bearer ${auth}`, 'idempotency-key': key },
        payload: { seatIds: ids },
      });
    const third = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'hold.third@example.com',
        password: 'correct horse battery staple',
      },
    });
    const fourth = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'hold.fourth@example.com',
        password: 'correct horse battery staple',
      },
    });
    const thirdToken = third.json().token as string;
    const fourthToken = fourth.json().token as string;
    expect(
      (
        await holdRequest(
          [seatIds[35]!],
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee40',
          token,
        )
      ).json().error,
    ).toMatch(/Maximum 10/);
    const holdKey = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee41';
    const lastSeat = seatIds[35]!;
    const racing = await Promise.all([
      holdRequest([lastSeat], holdKey, thirdToken),
      holdRequest(
        [lastSeat],
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee42',
        fourthToken,
      ),
    ]);
    expect(racing.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    const winner = racing[0]!.statusCode === 201 ? racing[0]! : racing[1]!;
    const winnerToken =
      racing[0]!.statusCode === 201 ? thirdToken : fourthToken;
    const loserToken = winnerToken === thirdToken ? fourthToken : thirdToken;
    const winnerKey =
      winnerToken === thirdToken
        ? holdKey
        : 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee42';
    const hold = winner.json() as {
      id: string;
      status: string;
      expiresAt: string;
      totalMinor: number;
    };
    expect(hold.status).toBe('HOLDING');
    expect(hold.totalMinor).toBe(1200);
    expect(Date.parse(hold.expiresAt) - Date.now()).toBeGreaterThan(590_000);
    expect(
      (await holdRequest([lastSeat], winnerKey, winnerToken)).statusCode,
    ).toBe(200);
    expect(
      (await holdRequest([seatIds[36]!], winnerKey, winnerToken)).statusCode,
    ).toBe(409);
    expect(
      (
        await holdRequest(
          [seatIds[0]!],
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee43',
          loserToken,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await holdRequest(
          [lastSeat, seatIds[37]!],
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee44',
          loserToken,
        )
      ).statusCode,
    ).toBe(409);
    const blockedLegacy = await reserve(
      [lastSeat],
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee47',
      { authorization: `Bearer ${loserToken}` },
    );
    expect(blockedLegacy.statusCode, blockedLegacy.body).toBe(409);
    expect(
      (
        await app.inject({
          url: `/cinema-holds/${hold.id}`,
          headers: { authorization: `Bearer ${loserToken}` },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject(`/cinemas/${demoCinemaId}/screenings/${shows[0]!.id}`))
        .json()
        .seats.find((seat: { id: string }) => seat.id === lastSeat).booked,
    ).toBe(true);
    await database.cinemaHold.update({
      where: { id: hold.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (
        await app.inject({
          url: `/cinema-holds/${hold.id}`,
          headers: { authorization: `Bearer ${winnerToken}` },
        })
      ).json().status,
    ).toBe('EXPIRED');
    expect(
      (
        await holdRequest(
          [lastSeat],
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee45',
          loserToken,
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (await holdRequest([lastSeat], winnerKey, winnerToken)).json().status,
    ).toBe('EXPIRED');
    expect(
      (await app.inject(`/cinemas/${demoCinemaId}/screenings/${shows[0]!.id}`))
        .json()
        .seats.find((seat: { id: string }) => seat.id === seatIds[0]).booked,
    ).toBe(true);
    const otherShowHold = await app.inject({
      method: 'POST',
      url: `/cinemas/${demoCinemaId}/screenings/${shows[1]!.id}/holds`,
      headers: {
        authorization: `Bearer ${winnerToken}`,
        'idempotency-key': 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee46',
      },
      payload: { seatIds: [lastSeat] },
    });
    expect(otherShowHold.statusCode, otherShowHold.body).toBe(201);
    await database.session.deleteMany({
      where: {
        userId: {
          in: [third.json().user.id as string, fourth.json().user.id as string],
        },
      },
    });
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
    const demoLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'demo.alice@example.com',
        password: 'DemoPassword2026!',
      },
    });
    expect(demoLogin.statusCode).toBe(200);
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
    const bookingId = attempts[0]!.json().id as string;
    const cancel = (headers: { authorization: string }) =>
      app.inject({
        method: 'POST',
        url: `/bookings/${bookingId}/cancel`,
        headers,
      });
    expect(
      (await cancel({ authorization: otherHeaders.authorization })).statusCode,
    ).toBe(404);
    expect(
      (await cancel({ authorization: 'Bearer ' + 'a'.repeat(64) })).statusCode,
    ).toBe(401);
    const cancellations = await Promise.all([
      cancel(bookingHeaders),
      cancel(bookingHeaders),
    ]);
    expect(cancellations.map((response) => response.statusCode)).toEqual([
      200, 200,
    ]);
    expect(
      cancellations.map((response) => response.json().status).sort(),
    ).toEqual(['already-cancelled', 'ok']);
    expect(
      (
        await database.event.findUniqueOrThrow({
          where: { id: bookingEvent.id },
        })
      ).bookedSeats,
    ).toBe(0);
    expect(
      (await database.booking.findUniqueOrThrow({ where: { id: bookingId } }))
        .cancelledAt,
    ).not.toBeNull();
    expect((await create()).json().cancelledAt).not.toBeNull();
    expect(
      (
        await database.event.findUniqueOrThrow({
          where: { id: bookingEvent.id },
        })
      ).bookedSeats,
    ).toBe(0);
    const replacementKey = 'fa96b266-e100-40ba-b16b-77b7d0d58b6a';
    const replacement = await app.inject({
      method: 'POST',
      url: '/bookings',
      headers: { ...bookingHeaders, 'idempotency-key': replacementKey },
      payload: { eventId: bookingEvent.id, quantity: 1 },
    });
    expect(replacement.statusCode).toBe(201);
    expect(
      (
        await database.event.findUniqueOrThrow({
          where: { id: bookingEvent.id },
        })
      ).bookedSeats,
    ).toBe(1);
    const race = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/bookings/${replacement.json().id as string}/cancel`,
        headers: bookingHeaders,
      }),
      app.inject({
        method: 'POST',
        url: '/bookings',
        headers: {
          ...bookingHeaders,
          'idempotency-key': '121c7f86-ff26-4fc9-b46b-4821f8c0e519',
        },
        payload: { eventId: bookingEvent.id, quantity: 1 },
      }),
    ]);
    expect(race[0]!.json().status).toBe('ok');
    expect([201, 409]).toContain(race[1]!.statusCode);
    // The booking either saw a full event or took the seat just released.
    expect(
      (
        await database.event.findUniqueOrThrow({
          where: { id: bookingEvent.id },
        })
      ).bookedSeats,
    ).toBe(race[1]!.statusCode === 201 ? 1 : 0);
    if (race[1]!.statusCode === 409) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/bookings',
            headers: {
              ...bookingHeaders,
              'idempotency-key': '933a72c0-7ad0-4952-a0a4-b94a1cb4d058',
            },
            payload: { eventId: bookingEvent.id, quantity: 1 },
          })
        ).statusCode,
      ).toBe(201);
    }
    expect(
      (
        await database.event.findUniqueOrThrow({
          where: { id: bookingEvent.id },
        })
      ).bookedSeats,
    ).toBe(1);
    const started = await database.event.create({
      data: {
        title: 'Started',
        description: 'Past cutoff',
        venue: 'Hall',
        startsAt: new Date('2020-01-01T10:00:00Z'),
        endsAt: new Date('2020-01-01T11:00:00Z'),
        capacity: 1,
        bookedSeats: 1,
        published: true,
      },
    });
    const owner = await database.user.findUniqueOrThrow({
      where: { email: 'reader@example.com' },
    });
    const late = await database.booking.create({
      data: { eventId: started.id, userId: owner.id, quantity: 1 },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/bookings/${late.id}/cancel`,
          headers: bookingHeaders,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await database.event.findUniqueOrThrow({ where: { id: started.id } }))
        .bookedSeats,
    ).toBe(1);
    expect(
      (await database.booking.findUniqueOrThrow({ where: { id: late.id } }))
        .cancelledAt,
    ).toBeNull();
    const organizerLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'demo.organizer@example.com',
        password: 'DemoPassword2026!',
      },
    });
    expect(organizerLogin.statusCode).toBe(200);
    expect(organizerLogin.json().user.role).toBe('ORGANIZER');
    const organizerHeaders = {
      authorization: `Bearer ${organizerLogin.json().token as string}`,
    };
    expect(
      (await app.inject({ url: '/organizer/events', headers: bookingHeaders }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: `/organizer/events/${bookingEvent.id}`,
          headers: organizerHeaders,
        })
      ).statusCode,
    ).toBe(404);
    const created = await app.inject({
      method: 'POST',
      url: '/organizer/events',
      headers: organizerHeaders,
      payload: {
        title: 'Organizer show',
        description: 'Demo',
        venue: 'Hall',
        startsAt: tomorrow.toISOString(),
        endsAt: later.toISOString(),
        capacity: 1,
      },
    });
    expect(created.statusCode).toBe(201);
    const managedId = created.json().id as string;
    const secondOrganizer = await database.user.create({
      data: {
        email: 'second.organizer@example.com',
        passwordHash: (
          await database.user.findUniqueOrThrow({
            where: { email: 'demo.organizer@example.com' },
          })
        ).passwordHash,
        role: 'ORGANIZER',
      },
    });
    const secondLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: secondOrganizer.email, password: 'DemoPassword2026!' },
    });
    const secondHeaders = {
      authorization: `Bearer ${secondLogin.json().token as string}`,
    };
    expect(
      (
        await app.inject({
          url: `/organizer/events/${managedId}`,
          headers: secondHeaders,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/organizer/events/${managedId}`,
          headers: secondHeaders,
          payload: { title: 'Stolen' },
        })
      ).statusCode,
    ).toBe(404);
    expect((await app.inject({ url: `/events/${managedId}` })).statusCode).toBe(
      404,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/bookings',
          headers: {
            ...bookingHeaders,
            'idempotency-key': '3813ebaa-1fb4-421d-8c69-e70eb0cff5a1',
          },
          payload: { eventId: managedId, quantity: 1 },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/organizer/events/${managedId}/publish`,
          headers: organizerHeaders,
        })
      ).statusCode,
    ).toBe(200);
    const managedBooking = await app.inject({
      method: 'POST',
      url: '/bookings',
      headers: {
        ...bookingHeaders,
        'idempotency-key': 'b8cf5d32-cd16-4b0d-b4da-a568c664c44b',
      },
      payload: { eventId: managedId, quantity: 1 },
    });
    expect(managedBooking.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/organizer/events/${managedId}`,
          headers: organizerHeaders,
          payload: { capacity: 0 },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/organizer/events/${managedId}/unpublish`,
          headers: organizerHeaders,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/organizer/events/${managedId}`,
          headers: organizerHeaders,
          payload: { venue: 'Elsewhere' },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          url: `/organizer/events/${managedId}`,
          headers: organizerHeaders,
        })
      ).json(),
    ).toMatchObject({ activeBookings: 1, bookedSeats: 1 });
    const [capacityEdit, secondBooking] = await Promise.all([
      app.inject({
        method: 'PATCH',
        url: `/organizer/events/${managedId}`,
        headers: organizerHeaders,
        payload: { capacity: 1 },
      }),
      app.inject({
        method: 'POST',
        url: '/bookings',
        headers: {
          ...bookingHeaders,
          'idempotency-key': '665996a8-649d-49d6-9ff7-3a978ae8579e',
        },
        payload: { eventId: managedId, quantity: 1 },
      }),
    ]);
    expect(capacityEdit.statusCode).toBe(200);
    expect(secondBooking.statusCode).toBe(409);
    expect(
      (await database.event.findUniqueOrThrow({ where: { id: managedId } }))
        .bookedSeats,
    ).toBe(1);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/bookings/${managedBooking.json().id as string}/cancel`,
          headers: bookingHeaders,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/organizer/events/${managedId}`,
          headers: organizerHeaders,
          payload: { capacity: 0 },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/organizer/events/${managedId}/unpublish`,
          headers: organizerHeaders,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          url: `/organizer/events/${managedId}`,
          headers: organizerHeaders,
        })
      ).json(),
    ).toMatchObject({
      activeBookings: 0,
      cancelledBookings: 1,
      remainingSeats: 0,
    });
    const raceEvent = await app.inject({
      method: 'POST',
      url: '/organizer/events',
      headers: organizerHeaders,
      payload: {
        title: 'Race show',
        description: 'Demo',
        venue: 'Hall',
        startsAt: tomorrow.toISOString(),
        endsAt: later.toISOString(),
        capacity: 1,
      },
    });
    const raceId = raceEvent.json().id as string;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/organizer/events/${raceId}/publish`,
          headers: organizerHeaders,
        })
      ).statusCode,
    ).toBe(200);
    const raceBooking = (key: string) =>
      app.inject({
        method: 'POST',
        url: '/bookings',
        headers: { ...bookingHeaders, 'idempotency-key': key },
        payload: { eventId: raceId, quantity: 1 },
      });
    const [decrease, claimed] = await Promise.all([
      app.inject({
        method: 'PATCH',
        url: `/organizer/events/${raceId}`,
        headers: organizerHeaders,
        payload: { capacity: 0 },
      }),
      raceBooking('58ef20b9-1ed0-479a-ab72-1139eea701eb'),
    ]);
    expect([200, 409]).toContain(decrease.statusCode);
    expect([201, 409]).toContain(claimed.statusCode);
    expect(decrease.statusCode === 200 && claimed.statusCode === 201).toBe(
      false,
    );
    const finalInventory = await database.event.findUniqueOrThrow({
      where: { id: raceId },
    });
    expect(finalInventory.bookedSeats).toBeLessThanOrEqual(
      finalInventory.capacity,
    );
    if (claimed.statusCode === 201) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/organizer/events/${raceId}/unpublish`,
            headers: organizerHeaders,
          })
        ).statusCode,
      ).toBe(409);
      const [cancelled, shrunk] = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/bookings/${claimed.json().id as string}/cancel`,
          headers: bookingHeaders,
        }),
        app.inject({
          method: 'PATCH',
          url: `/organizer/events/${raceId}`,
          headers: organizerHeaders,
          payload: { capacity: 0 },
        }),
      ]);
      expect(cancelled.statusCode).toBe(200);
      expect([200, 409]).toContain(shrunk.statusCode);
      expect(
        (await database.event.findUniqueOrThrow({ where: { id: raceId } }))
          .bookedSeats,
      ).toBe(0);
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/organizer/events/${raceId}`,
            headers: organizerHeaders,
            payload: { capacity: 0 },
          })
        ).statusCode,
      ).toBe(200);
    } else {
      const [unpublish, attempt] = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/organizer/events/${raceId}/unpublish`,
          headers: organizerHeaders,
        }),
        raceBooking('702ac2fd-12dc-49e5-9b7c-709074e3c084'),
      ]);
      expect(unpublish.statusCode).toBe(200);
      expect(attempt.statusCode).not.toBe(201);
    }
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
