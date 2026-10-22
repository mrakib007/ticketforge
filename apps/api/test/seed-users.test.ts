import { expect, it, vi } from 'vitest';
import { verifyPassword } from '../src/modules/auth/password.js';
import {
  seedDemoUsers,
  seedDemoOrganizer,
  isLocalDemoSeed,
} from '../src/db/seed-users.js';

const local = 'postgresql://user:pass@127.0.0.1:5432/ticketforge';

it('only permits demo credentials against a local database outside production', () => {
  expect(isLocalDemoSeed(local, 'development')).toBe(true);
  expect(
    isLocalDemoSeed('postgresql://user:pass@localhost:5432/test', undefined),
  ).toBe(true);
  expect(isLocalDemoSeed(local, 'production')).toBe(false);
  expect(
    isLocalDemoSeed(
      'postgresql://user:pass@db.example.com/test',
      'development',
    ),
  ).toBe(false);
  expect(
    isLocalDemoSeed('postgresql://user:pass@127.0.0.2/test', 'development'),
  ).toBe(false);
});

it('creates only missing users with hashed passwords and never resets existing accounts', async () => {
  const createMany = vi
    .fn()
    .mockResolvedValueOnce({ count: 2 })
    .mockResolvedValueOnce({ count: 0 });
  const database = { user: { createMany } };
  expect(await seedDemoUsers(database, local, 'development')).toBe(2);
  const rows = createMany.mock.calls[0]![0].data as {
    email: string;
    passwordHash: string;
  }[];
  expect(rows.map((row) => row.email)).toEqual([
    'demo.alice@example.com',
    'demo.bob@example.com',
  ]);
  expect(
    rows.every((row) => !row.passwordHash.includes('DemoPassword2026!')),
  ).toBe(true);
  for (const row of rows)
    expect(await verifyPassword('DemoPassword2026!', row.passwordHash)).toBe(
      true,
    );
  expect(createMany.mock.calls[0]![0].skipDuplicates).toBe(true);
  expect(await seedDemoUsers(database, local, 'development')).toBe(0);
});

it('does not touch the database on unsafe targets', async () => {
  const createMany = vi.fn();
  const database = { user: { createMany } };
  await expect(
    seedDemoUsers(
      database,
      'postgresql://user:pass@db.example.com/test',
      'development',
    ),
  ).rejects.toThrow();
  await expect(seedDemoUsers(database, local, 'production')).rejects.toThrow();
  expect(createMany).not.toHaveBeenCalled();
});

it('seeds a local-only organizer without changing existing accounts', async () => {
  const createMany = vi
    .fn()
    .mockResolvedValueOnce({ count: 1 })
    .mockResolvedValueOnce({ count: 0 });
  const database = { user: { createMany } };
  expect(await seedDemoOrganizer(database, local, 'development')).toBe(1);
  expect(createMany.mock.calls[0]![0].data[0]).toMatchObject({
    email: 'demo.organizer@example.com',
    role: 'ORGANIZER',
  });
  expect(createMany.mock.calls[0]![0].skipDuplicates).toBe(true);
  expect(await seedDemoOrganizer(database, local, 'development')).toBe(0);
  await expect(
    seedDemoOrganizer(database, local, 'production'),
  ).rejects.toThrow();
  expect(createMany).toHaveBeenCalledTimes(2);
});
