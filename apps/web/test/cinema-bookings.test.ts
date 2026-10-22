import { afterEach, expect, it, vi } from 'vitest';
import {
  fetchCinemaBookings,
  reserveCinemaSeats,
} from '../src/lib/cinema-bookings';

const token = 'a'.repeat(64);
const cinemaId = 'a00af03a-4e20-44a9-8782-c0f671415199';
const screeningId = '43bccd6a-340a-42f0-8473-e90a06501370';
const seatId = '7f0d0a96-8957-4c57-8e02-824549b18467';
const key = 'ab11d9f0-ff84-40e7-bcad-e3182046c921';
afterEach(() => vi.unstubAllGlobals());

it('posts an authenticated, idempotent seat selection and validates its confirmation', async () => {
  const fetch = vi.fn().mockResolvedValue({
    status: 201,
    json: async () => ({
      id: key,
      screeningId,
      seatIds: [seatId],
      createdAt: '2028-07-10T12:00:00.000Z',
    }),
  });
  vi.stubGlobal('fetch', fetch);
  expect(
    (await reserveCinemaSeats(token, cinemaId, screeningId, [seatId], key))
      .status,
  ).toBe('ok');
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'POST',
    body: JSON.stringify({ seatIds: [seatId] }),
    headers: { 'idempotency-key': key, authorization: `Bearer ${token}` },
  });
  expect(
    await reserveCinemaSeats(
      token,
      cinemaId,
      screeningId,
      [seatId, seatId],
      key,
    ),
  ).toEqual({ status: 'invalid' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('distinguishes a per-showtime limit from unavailable seats and uncertain responses', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      status: 409,
      json: async () => ({
        error: 'Maximum 10 tickets per person for this screening',
      }),
    })
    .mockResolvedValueOnce({
      status: 409,
      json: async () => ({ error: 'Selected seats are unavailable' }),
    })
    .mockRejectedValueOnce(new Error('network timeout'));
  vi.stubGlobal('fetch', fetch);
  expect(
    (await reserveCinemaSeats(token, cinemaId, screeningId, [seatId], key))
      .status,
  ).toBe('limit');
  expect(
    (await reserveCinemaSeats(token, cinemaId, screeningId, [seatId], key))
      .status,
  ).toBe('taken');
  expect(
    (await reserveCinemaSeats(token, cinemaId, screeningId, [seatId], key))
      .status,
  ).toBe('unavailable');
});

it('rejects malformed receipt data rather than displaying untrusted API values', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookings: [{ id: 'bad-id' }] }),
    }),
  );
  expect(await fetchCinemaBookings(token)).toEqual({ status: 'unavailable' });
});

it('shows only validated cinema booking receipts returned for the session', async () => {
  const receipt = {
    id: key,
    screeningId,
    seatIds: [seatId],
    createdAt: '2028-07-10T12:00:00.000Z',
    cinemaId,
    cinemaName: 'Demo Picture House',
    movieTitle: 'Paper Kingdom',
    startsAt: '2028-07-12T12:00:00.000Z',
    seats: [{ rowLabel: 'A', seatNumber: 1 }],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bookings: [receipt] }),
    }),
  );
  expect(await fetchCinemaBookings(token)).toEqual({
    status: 'ok',
    bookings: [receipt],
  });
});
