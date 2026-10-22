import { afterEach, expect, it, vi } from 'vitest';
import {
  fetchCinemas,
  fetchCinema,
  fetchScreenings,
  fetchScreening,
} from '../src/lib/cinema';

afterEach(() => vi.unstubAllGlobals());
const id = 'a00af03a-4e20-44a9-8782-c0f671415199';
const cinema = {
  id,
  name: 'Demo Picture House',
  description: 'Fictional',
  address: 'Imaginary Lane',
  timeZone: 'UTC',
  imageUrl: null,
  isDemo: true,
};
const screening = {
  id: '43bccd6a-340a-42f0-8473-e90a06501370',
  movie: {
    id,
    title: 'Paper Kingdom',
    synopsis: 'Demo',
    durationMinutes: 100,
    releaseDate: null,
    posterUrl: null,
  },
  auditorium: { id, name: 'Screen One' },
  startsAt: '2028-07-12T12:00:00.000Z',
  endsAt: '2028-07-12T14:00:00.000Z',
  bookingClosesAt: '2028-07-12T11:45:00.000Z',
  priceMinor: 1200,
  currency: 'USD',
};

it('reads cinema listings, schedules and layouts through the server API', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cinemas: [cinema] }),
    })
    .mockResolvedValueOnce({ ok: true, json: async () => cinema })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ screenings: [screening] }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...screening,
        seats: [{ rowLabel: 'A', seatNumber: 1, category: 'STANDARD' }],
      }),
    });
  vi.stubGlobal('fetch', fetch);
  expect((await fetchCinemas()).status).toBe('ok');
  expect((await fetchCinema(id)).status).toBe('ok');
  expect((await fetchScreenings(id)).status).toBe('ok');
  expect((await fetchScreening(id, screening.id)).status).toBe('ok');
  expect(fetch).toHaveBeenCalledTimes(4);
});

it('rejects malformed external responses and unsafe IDs', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cinemas: [{ ...cinema, timeZone: 'Bad/Zone' }] }),
    }),
  );
  expect(await fetchCinemas()).toEqual({ status: 'unavailable' });
  expect(await fetchScreenings('../events')).toEqual({ status: 'not-found' });
  expect(await fetchCinema('bad-id')).toEqual({ status: 'not-found' });
});
