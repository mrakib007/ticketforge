import { afterEach, expect, it, vi } from 'vitest';
import {
  fetchCinemaBookings,
  holdCinemaSeats,
  fetchCinemaHold,
} from '../src/lib/cinema-bookings';

const token = 'a'.repeat(64);
const cinemaId = 'a00af03a-4e20-44a9-8782-c0f671415199';
const screeningId = '43bccd6a-340a-42f0-8473-e90a06501370';
const seatId = '7f0d0a96-8957-4c57-8e02-824549b18467';
const key = 'ab11d9f0-ff84-40e7-bcad-e3182046c921';
afterEach(() => vi.unstubAllGlobals());

it('holds seats without treating them as paid or confirmed, and validates the server response', async () => {
  const hold = {
    id: key,
    screeningId,
    seatIds: [seatId],
    status: 'HOLDING',
    expiresAt: '2028-07-10T12:10:00.000Z',
    totalMinor: 1200,
    currency: 'USD',
  };
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 201, json: async () => hold });
  vi.stubGlobal('fetch', fetch);
  expect(
    await holdCinemaSeats(token, cinemaId, screeningId, [seatId], key),
  ).toEqual({ status: 'ok', hold });
  expect(String(fetch.mock.calls[0]?.[0])).toContain(
    `/screenings/${screeningId}/holds`,
  );
  expect(await fetchCinemaHold(token, key)).toEqual({ status: 'ok', hold });
  expect(String(fetch.mock.calls[1]?.[0])).toContain(`/cinema-holds/${key}`);
});

it('does not accept malformed or mismatched hold responses and distinguishes expired holds', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({
        status: 201,
        json: async () => ({ id: key, screeningId: cinemaId }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: key,
          screeningId,
          seatIds: [seatId],
          status: 'EXPIRED',
          expiresAt: '2028-07-10T12:10:00.000Z',
          totalMinor: 1200,
          currency: 'USD',
        }),
      }),
  );
  expect(
    (await holdCinemaSeats(token, cinemaId, screeningId, [seatId], key)).status,
  ).toBe('unavailable');
  expect((await fetchCinemaHold(token, key)).status).toBe('ok');
});

it('validates hold selections and never calls the old free booking endpoint', async () => {
  const fetch = vi.fn().mockResolvedValue({
    status: 201,
    json: async () => ({
      id: key,
      screeningId,
      seatIds: [seatId],
      expiresAt: '2028-07-10T12:10:00.000Z',
      totalMinor: 1200,
      currency: 'USD',
      status: 'HOLDING',
    }),
  });
  vi.stubGlobal('fetch', fetch);
  expect(
    (await holdCinemaSeats(token, cinemaId, screeningId, [seatId], key)).status,
  ).toBe('ok');
  expect(String(fetch.mock.calls[0]?.[0])).toContain('/holds');
  expect(String(fetch.mock.calls[0]?.[0])).not.toContain('/bookings');
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'POST',
    body: JSON.stringify({ seatIds: [seatId] }),
    headers: { 'idempotency-key': key, authorization: `Bearer ${token}` },
  });
  expect(
    await holdCinemaSeats(token, cinemaId, screeningId, [seatId, seatId], key),
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
    (await holdCinemaSeats(token, cinemaId, screeningId, [seatId], key)).status,
  ).toBe('limit');
  expect(
    (await holdCinemaSeats(token, cinemaId, screeningId, [seatId], key)).status,
  ).toBe('taken');
  expect(
    (await holdCinemaSeats(token, cinemaId, screeningId, [seatId], key)).status,
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
