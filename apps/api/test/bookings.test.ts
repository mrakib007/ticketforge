import { afterEach, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';

const eventId = '8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5';
const key = 'a9947927-4062-45d6-a647-0e2c9b41e886';
const user = {
  id: '4cbaea02-4660-4f11-9e3f-207d5fe34609',
  email: 'reader@example.com',
};
const auth = { findSession: vi.fn() };
const bookings = { create: vi.fn(), list: vi.fn(), cancel: vi.fn() };
const app = buildApp({
  checkDatabase: async () => true,
  bookings,
  sessionReader: auth,
});
const headers = {
  authorization: `Bearer ${'a'.repeat(64)}`,
  'idempotency-key': key,
};

afterEach(() => {
  vi.resetAllMocks();
});

it('requires a valid, unexpired session for bookings', async () => {
  auth.findSession.mockResolvedValue(null);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/bookings',
        headers,
        payload: { eventId, quantity: 1 },
      })
    ).statusCode,
  ).toBe(401);
  expect((await app.inject({ url: '/bookings' })).statusCode).toBe(401);
  expect(bookings.create).not.toHaveBeenCalled();
});

it('validates booking input and returns created booking', async () => {
  auth.findSession.mockResolvedValue(user);
  for (const payload of [
    { eventId, quantity: 0 },
    { eventId, quantity: 11 },
    { eventId, quantity: 1.5 },
    { eventId: 'bad', quantity: 1 },
  ]) {
    expect(
      (await app.inject({ method: 'POST', url: '/bookings', headers, payload }))
        .statusCode,
    ).toBe(400);
  }
  expect(bookings.create).not.toHaveBeenCalled();
  const booking = {
    id: eventId,
    eventId,
    quantity: 2,
    createdAt: '2026-10-20T00:00:00.000Z',
    event: {
      title: 'Concert',
      startsAt: '2028-07-12T19:00:00.000Z',
      venue: 'Hall',
    },
  };
  bookings.create.mockResolvedValue({ status: 'ok', booking });
  const result = await app.inject({
    method: 'POST',
    url: '/bookings',
    headers,
    payload: { eventId, quantity: 2 },
  });
  expect(result.statusCode).toBe(201);
  expect(result.json()).toEqual(booking);
  expect(bookings.create).toHaveBeenCalledWith(user.id, eventId, 2, key);
});

it('requires a valid idempotency key and distinguishes replays from conflicting reuse', async () => {
  auth.findSession.mockResolvedValue(user);
  for (const badHeaders of [
    { authorization: headers.authorization },
    { ...headers, 'idempotency-key': 'invalid' },
  ]) {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/bookings',
          headers: badHeaders,
          payload: { eventId, quantity: 1 },
        })
      ).statusCode,
    ).toBe(400);
  }
  expect(bookings.create).not.toHaveBeenCalled();
  const booking = { id: eventId, eventId, quantity: 1 };
  bookings.create
    .mockResolvedValueOnce({ status: 'ok', booking, replayed: false })
    .mockResolvedValueOnce({ status: 'ok', booking, replayed: true })
    .mockResolvedValueOnce({ status: 'conflict' });
  const send = () =>
    app.inject({
      method: 'POST',
      url: '/bookings',
      headers,
      payload: { eventId, quantity: 1 },
    });
  expect((await send()).statusCode).toBe(201);
  const replay = await send();
  expect(replay.statusCode).toBe(200);
  expect(replay.json()).toEqual(booking);
  expect((await send()).statusCode).toBe(409);
  expect(bookings.create).toHaveBeenCalledWith(user.id, eventId, 1, key);
});

it('reports unavailable events, sold-out capacity and safe infrastructure errors', async () => {
  auth.findSession.mockResolvedValue(user);
  for (const [status, expected] of [
    ['not-found', 404],
    ['sold-out', 409],
  ] as const) {
    bookings.create.mockResolvedValue({ status });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/bookings',
          headers,
          payload: { eventId, quantity: 1 },
        })
      ).statusCode,
    ).toBe(expected);
  }
  bookings.create.mockRejectedValue(new Error('private_password'));
  const result = await app.inject({
    method: 'POST',
    url: '/bookings',
    headers,
    payload: { eventId, quantity: 1 },
  });
  expect(result.statusCode).toBe(503);
  expect(result.body).not.toContain('private_password');
});

it('lists only the authenticated user’s bookings', async () => {
  auth.findSession.mockResolvedValue(user);
  bookings.list.mockResolvedValue([]);
  const result = await app.inject({ url: '/bookings', headers });
  expect(result.json()).toEqual({ bookings: [] });
  expect(bookings.list).toHaveBeenCalledWith(user.id);
});

it('does not expose session or listing failures to clients', async () => {
  auth.findSession.mockRejectedValueOnce(new Error('private_password'));
  const sessionFailure = await app.inject({ url: '/bookings', headers });
  expect(sessionFailure.statusCode).toBe(503);
  expect(sessionFailure.body).not.toContain('private_password');
  auth.findSession.mockResolvedValue(user);
  bookings.list.mockRejectedValue(new Error('private_password'));
  const listFailure = await app.inject({ url: '/bookings', headers });
  expect(listFailure.statusCode).toBe(503);
  expect(listFailure.body).not.toContain('private_password');
});

it('cancels only authenticated, owned bookings and validates ids', async () => {
  auth.findSession.mockResolvedValue(user);
  expect(
    (await app.inject({ method: 'POST', url: '/bookings/bad/cancel', headers }))
      .statusCode,
  ).toBe(400);
  expect(bookings.cancel).not.toHaveBeenCalled();
  auth.findSession.mockResolvedValueOnce(null);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/bookings/${eventId}/cancel`,
        headers,
      })
    ).statusCode,
  ).toBe(401);
  bookings.cancel
    .mockResolvedValueOnce({ status: 'not-found' })
    .mockResolvedValueOnce({ status: 'ok' });
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/bookings/${eventId}/cancel`,
        headers,
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/bookings/${eventId}/cancel`,
        headers,
      })
    ).statusCode,
  ).toBe(200);
  expect(bookings.cancel).toHaveBeenCalledWith(user.id, eventId);
});

it('distinguishes cutoff and repeat cancellation, and hides infrastructure errors', async () => {
  auth.findSession.mockResolvedValue(user);
  bookings.cancel
    .mockResolvedValueOnce({ status: 'too-late' })
    .mockResolvedValueOnce({ status: 'already-cancelled' });
  const send = () =>
    app.inject({ method: 'POST', url: `/bookings/${eventId}/cancel`, headers });
  expect((await send()).statusCode).toBe(409);
  expect((await send()).statusCode).toBe(200);
  bookings.cancel.mockRejectedValue(new Error('private_password'));
  const failed = await send();
  expect(failed.statusCode).toBe(503);
  expect(failed.body).not.toContain('private_password');
});
