import { execFile } from 'node:child_process';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { test, expect } from '@playwright/test';
import { buildApp } from '../apps/api/src/app.js';
import { createDatabase } from '../apps/api/src/db/client.js';
import { loadConfig } from '../apps/api/src/config.js';
import { seedCinema, demoCinemaId } from '../apps/api/src/db/seed-cinema.js';
import { createAuthRepository } from '../apps/api/src/modules/auth/repository.js';
import { createCinemaReader } from '../apps/api/src/modules/cinema/repository.js';
import { createCinemaBookingRepository } from '../apps/api/src/modules/cinema-bookings/repository.js';
import type { PrismaClient } from '../apps/api/src/generated/prisma/client.js';
import type { FastifyInstance } from 'fastify';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const apiDirectory = fileURLToPath(new URL('../apps/api/', import.meta.url));
const webDirectory = fileURLToPath(new URL('../apps/web/', import.meta.url));
const nextEnvPath = fileURLToPath(
  new URL('../apps/web/next-env.d.ts', import.meta.url),
);
const run = promisify(execFile);
let container: StartedPostgreSqlContainer;
let database: PrismaClient;
let app: FastifyInstance;
let web: ChildProcess;
let webUrl: string;
let screeningId: string;
let seatId: string;
let logs = '';
let nextEnvBefore: string | undefined;

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function waitForWeb(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (web.exitCode !== null) throw new Error(`Next.js exited: ${logs}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      /* server is still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next.js did not start: ${logs}`);
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  container = await new PostgreSqlContainer('postgres:16.10-alpine').start();
  const databaseUrl = container.getConnectionUri();
  await run(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: apiDirectory,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: '',
        DB_SSL: 'false',
      },
      timeout: 60_000,
    },
  );
  database = createDatabase(loadConfig({ DATABASE_URL: databaseUrl }));
  await seedCinema(database);
  const screening = await database.screening.findFirstOrThrow({
    where: { auditorium: { cinemaId: demoCinemaId }, status: 'PUBLISHED' },
    orderBy: { startsAt: 'asc' },
  });
  screeningId = screening.id;
  seatId = (
    await database.seat.findFirstOrThrow({
      where: {
        auditoriumId: screening.auditoriumId,
        rowLabel: 'A',
        seatNumber: 1,
      },
    })
  ).id;
  const auth = createAuthRepository(database);
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  app = buildApp({
    checkDatabase: async () => true,
    auth,
    cinemas: createCinemaReader(database),
    cinemaBookings: createCinemaBookingRepository(database),
  });
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  const apiUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  webUrl = `http://127.0.0.1:${await availablePort()}`;
  nextEnvBefore = await readFile(nextEnvPath, 'utf8');
  web = spawn(
    process.execPath,
    [
      require.resolve('next/dist/bin/next'),
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      new URL(webUrl).port,
    ],
    {
      cwd: webDirectory,
      env: {
        ...process.env,
        API_INTERNAL_URL: apiUrl,
        NEXT_TELEMETRY_DISABLED: '1',
        TICKETFORGE_E2E_DIST_DIR: '.next-e2e',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  web.stdout?.on('data', (chunk: Buffer) => {
    logs = (logs + chunk.toString()).slice(-4000);
  });
  web.stderr?.on('data', (chunk: Buffer) => {
    logs = (logs + chunk.toString()).slice(-4000);
  });
  await waitForWeb(webUrl);
});

test.afterAll(async () => {
  if (web && web.exitCode === null) {
    const stopped = new Promise<void>((resolve) =>
      web.once('exit', () => resolve()),
    );
    web.kill('SIGTERM');
    await Promise.race([
      stopped,
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
  }
  // Next.js type generation updates this tracked file even with a separate
  // distDir. Only undo that exact generated reference; keep any user edits.
  if (nextEnvBefore) {
    const current = await readFile(nextEnvPath, 'utf8');
    const generated = nextEnvBefore.replace(
      /\.\/\.next(?:-dev|-e2e)?\/types\/routes\.d\.ts/,
      './.next-e2e/types/routes.d.ts',
    );
    if (current === generated) await writeFile(nextEnvPath, nextEnvBefore);
  }
  await app?.close();
  await database?.$disconnect();
  await container?.stop();
});

const selectionUrl = () =>
  `${webUrl}/cinemas/${demoCinemaId}/screenings/${screeningId}`;

async function register(
  browser: import('@playwright/test').Browser,
  suffix: string,
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${webUrl}/register`);
  await page.getByLabel('Email').fill(`cinema-e2e-${suffix}@example.com`);
  await page.getByLabel('Password').fill('Correct Horse Battery Staple!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account/);
  return { context, page };
}

test('a hold survives refresh, blocks another attendee and releases on expiry', async ({
  browser,
}) => {
  const alice = await register(browser, 'alice');
  const bob = await register(browser, 'bob');
  try {
    await alice.page.goto(selectionUrl());
    await alice.page.getByRole('button', { name: 'A1', exact: true }).click();
    await alice.page.getByRole('button', { name: 'Hold seats →' }).click();
    await expect(alice.page.getByText(/Seats held for/)).toBeVisible();
    await expect(
      alice.page.getByText(/this hold is not a purchase/),
    ).toBeVisible();
    const pending = await alice.page.evaluate(
      (id) => sessionStorage.getItem(`cinema-hold-attempt:${id}`),
      screeningId,
    );
    expect(pending).toContain('holdId');
    expect((JSON.parse(pending!) as { seatIds: string[] }).seatIds).toContain(
      seatId,
    );
    await alice.page.reload();
    await expect(alice.page.getByText(/Seats held for/)).toBeVisible();
    await bob.page.goto(selectionUrl());
    await expect(
      bob.page.getByRole('button', { name: 'A1', exact: true }),
    ).toBeDisabled();
    const holdId = JSON.parse(pending!) as { holdId: string };
    await database.cinemaHold.update({
      where: { id: holdId.holdId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await bob.page.reload();
    await bob.page.getByRole('button', { name: 'A1', exact: true }).click();
    await bob.page.getByRole('button', { name: 'Hold seats →' }).click();
    await expect(bob.page.getByText(/Seats held for/)).toBeVisible();
    await alice.page.reload();
    await expect(alice.page.getByText(/This hold has expired/)).toBeVisible();
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});

test('a lost hold response retries the same selection without allocating twice', async ({
  browser,
}) => {
  const attendee = await register(browser, 'retry');
  try {
    const page = attendee.page;
    await page.goto(selectionUrl());
    await page.getByRole('button', { name: 'B1', exact: true }).click();
    let interrupted = false;
    await page.route('**/cinemas/**/screenings/**', async (route) => {
      if (
        route.request().method() !== 'POST' ||
        !route.request().headers()['next-action'] ||
        interrupted
      ) {
        await route.continue();
        return;
      }
      interrupted = true;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort('failed');
    });
    await page.getByRole('button', { name: 'Hold seats →' }).click();
    await expect(page.getByText(/hold outcome is uncertain/i)).toBeVisible();
    expect(interrupted).toBe(true);
    const attempt = await page.evaluate(
      (id) => sessionStorage.getItem(`cinema-hold-attempt:${id}`),
      screeningId,
    );
    expect(
      (JSON.parse(attempt!) as { seatIds: string[] }).seatIds,
    ).toHaveLength(1);
    await page.reload();
    await page.getByRole('button', { name: 'Retry hold' }).click();
    await expect(page.getByText(/Seats held for/)).toBeVisible();
    const recovered = await page.evaluate(
      (id) => sessionStorage.getItem(`cinema-hold-attempt:${id}`),
      screeningId,
    );
    expect(JSON.parse(recovered!)?.key).toBe(JSON.parse(attempt!)?.key);
    expect(
      await database.cinemaHold.count({
        where: { screeningId, idempotencyKey: JSON.parse(attempt!)?.key },
      }),
    ).toBe(1);
  } finally {
    await attendee.context.close();
  }
});

test('a stale seat selection fails without creating a partial hold', async ({
  browser,
}) => {
  const alice = await register(browser, 'stale-alice');
  const bob = await register(browser, 'stale-bob');
  try {
    await Promise.all([
      alice.page.goto(selectionUrl()),
      bob.page.goto(selectionUrl()),
    ]);
    await bob.page.getByRole('button', { name: 'C1', exact: true }).click();
    await alice.page.getByRole('button', { name: 'C1', exact: true }).click();
    await alice.page.getByRole('button', { name: 'Hold seats →' }).click();
    await expect(alice.page.getByText(/Seats held for/)).toBeVisible();
    await bob.page.getByRole('button', { name: 'Hold seats →' }).click();
    await expect(
      bob.page.getByText(/selected seat is no longer available/i),
    ).toBeVisible();
    await bob.page
      .getByRole('button', { name: 'Forget selection / refresh availability' })
      .click();
    await expect(
      bob.page.getByRole('button', { name: 'C1', exact: true }),
    ).toBeDisabled();
    const seat = await database.seat.findFirstOrThrow({
      where: { rowLabel: 'C', seatNumber: 1 },
    });
    expect(
      await database.cinemaHoldSeat.count({
        where: { screeningId, seatId: seat.id },
      }),
    ).toBe(1);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});
