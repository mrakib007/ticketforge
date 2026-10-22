import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';

const cinemaId = 'a00af03a-4e20-44a9-8782-c0f671415199';
const screeningId = '43bccd6a-340a-42f0-8473-e90a06501370';
const seatId = '7f0d0a96-8957-4c57-8e02-824549b18467';
const key = 'ab11d9f0-ff84-40e7-bcad-e3182046c921';
const bookings = { create: vi.fn(), list: vi.fn() };
const findSession = vi.fn().mockResolvedValue({ id: cinemaId });
const app = buildApp({
  checkDatabase: async () => true,
  cinemaBookings: bookings,
  sessionReader: { findSession },
});
beforeEach(() => findSession.mockResolvedValue({ id: cinemaId }));
afterEach(() => vi.resetAllMocks());

it('requires authentication and validates cinema seat booking input', async () => {
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/cinemas/${cinemaId}/screenings/${screeningId}/bookings`,
        payload: { seatIds: [seatId] },
      })
    ).statusCode,
  ).toBe(400);
  const unauthenticated = await app.inject({
    method: 'POST',
    url: `/cinemas/${cinemaId}/screenings/${screeningId}/bookings`,
    headers: { 'idempotency-key': key },
    payload: { seatIds: [seatId] },
  });
  expect(unauthenticated.statusCode, unauthenticated.body).toBe(401);
  const headers = {
    authorization: `Bearer ${'a'.repeat(64)}`,
    'idempotency-key': key,
  };
  for (const seatIds of [
    [],
    Array(11).fill(seatId),
    [seatId, seatId],
    ['bad-id'],
  ]) {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/cinemas/${cinemaId}/screenings/${screeningId}/bookings`,
          headers,
          payload: { seatIds },
        })
      ).statusCode,
    ).toBe(400);
  }
  expect(bookings.create).not.toHaveBeenCalled();
});

it('reports success, replay, conflicts, limit, and closed showtimes', async () => {
  const headers = {
    authorization: `Bearer ${'a'.repeat(64)}`,
    'idempotency-key': key,
  };
  const send = () =>
    app.inject({
      method: 'POST',
      url: `/cinemas/${cinemaId}/screenings/${screeningId}/bookings`,
      headers,
      payload: { seatIds: [seatId] },
    });
  for (const [result, code] of [
    [{ status: 'ok', booking: { id: key }, replayed: false }, 201],
    [{ status: 'ok', booking: { id: key }, replayed: true }, 200],
    [{ status: 'taken' }, 409],
    [{ status: 'limit' }, 409],
    [{ status: 'conflict' }, 409],
    [{ status: 'not-found' }, 404],
  ] as const) {
    bookings.create.mockResolvedValueOnce(result);
    const response = await send();
    expect(response.statusCode, response.body).toBe(code);
  }
  expect(bookings.create).toHaveBeenCalledWith(
    cinemaId,
    cinemaId,
    screeningId,
    [seatId],
    key,
  );
});

it('only returns the authenticated user’s cinema bookings', async () => {
  expect((await app.inject('/cinema-bookings')).statusCode).toBe(401);
  bookings.list.mockResolvedValue([{ id: key }]);
  const response = await app.inject({
    url: '/cinema-bookings',
    headers: { authorization: `Bearer ${'a'.repeat(64)}` },
  });
  expect(response.json()).toEqual({ bookings: [{ id: key }] });
  expect(bookings.list).toHaveBeenCalledWith(cinemaId);
});
