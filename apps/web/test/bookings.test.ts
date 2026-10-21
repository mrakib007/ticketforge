import { afterEach, expect, it, vi } from 'vitest';
import { createBooking, fetchBookings } from '../src/lib/bookings';

afterEach(() => vi.unstubAllGlobals());

const token = 'a'.repeat(64);
const eventId = '8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5';
const key = 'a9947927-4062-45d6-a647-0e2c9b41e886';

it('books using a server-side bearer token and validates the response', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({
    status: 201,
    json: async () => ({
      id: eventId,
      eventId,
      quantity: 2,
      createdAt: '2026-10-20T00:00:00Z',
      event: {
        title: 'Concert',
        venue: 'Hall',
        startsAt: '2028-07-12T19:00:00Z',
        endsAt: '2028-07-12T22:00:00Z',
      },
    }),
  });
  fetch.mockResolvedValueOnce({
    status: 200,
    json: async () => ({
      id: eventId,
      eventId,
      quantity: 2,
      createdAt: '2026-10-20T00:00:00Z',
      event: {
        title: 'Concert',
        venue: 'Hall',
        startsAt: '2028-07-12T19:00:00Z',
        endsAt: '2028-07-12T22:00:00Z',
      },
    }),
  });
  vi.stubGlobal('fetch', fetch);
  expect((await createBooking(token, eventId, 2, key)).status).toBe('ok');
  expect((await createBooking(token, eventId, 2, key)).status).toBe('ok');
  expect(fetch).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify({ eventId, quantity: 2 }),
      cache: 'no-store',
    }),
  );
});

it('rejects invalid booking input without contacting the API', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(await createBooking(token, eventId, 0, key)).toEqual({
    status: 'invalid',
  });
  expect(await createBooking(token, eventId, 1.5, key)).toEqual({
    status: 'invalid',
  });
  expect(await createBooking(token, 'bad', 1, key)).toEqual({
    status: 'invalid',
  });
  expect(await createBooking(token, eventId, 1, 'invalid')).toEqual({
    status: 'invalid',
  });
  expect(fetch).not.toHaveBeenCalled();
});

it('handles sold-out, expired sessions and unavailable API', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      status: 409,
      json: async () => ({ error: 'Not enough seats available' }),
    })
    .mockResolvedValueOnce({
      status: 409,
      json: async () => ({ error: 'Idempotency key used for another booking' }),
    })
    .mockResolvedValueOnce({ status: 401 })
    .mockRejectedValueOnce(new Error('secret'));
  vi.stubGlobal('fetch', fetch);
  expect(await createBooking(token, eventId, 1, key)).toEqual({
    status: 'sold-out',
  });
  expect(await createBooking(token, eventId, 1, key)).toEqual({
    status: 'conflict',
  });
  expect(await createBooking(token, eventId, 1, key)).toEqual({
    status: 'unauthorized',
  });
  expect(await createBooking(token, eventId, 1, key)).toEqual({
    status: 'unavailable',
  });
});

it('rejects forged booking lists and does not contact API for invalid tokens', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ bookings: [{ id: 'x' }] }),
  });
  vi.stubGlobal('fetch', fetch);
  expect(await fetchBookings(token)).toEqual({ status: 'unavailable' });
  expect(await fetchBookings('invalid')).toEqual({ status: 'unauthorized' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
