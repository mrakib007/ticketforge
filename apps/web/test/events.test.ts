import { afterEach, expect, it, vi } from 'vitest';
import { fetchEvent, fetchEvents } from '../src/lib/events';

afterEach(() => vi.unstubAllGlobals());

const event = {
  id: '8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5',
  title: 'Night at the Observatory',
  description: 'An evening under the stars.',
  venue: 'City Observatory',
  startsAt: '2027-07-12T19:00:00.000Z',
  endsAt: '2027-07-12T22:00:00.000Z',
};

it('reads and validates the event list', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ events: [event] }) }),
  );
  expect(await fetchEvents()).toEqual({ status: 'ok', events: [event] });
});

it('treats malformed API data as unavailable', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [{ ...event, endsAt: null }] }),
    }),
  );
  expect(await fetchEvents()).toEqual({ status: 'unavailable' });
});

it('returns unavailable on connection failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('connection refused')),
  );
  expect(await fetchEvents()).toEqual({ status: 'unavailable' });
});

it('distinguishes missing events from API failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  expect(await fetchEvent(event.id)).toEqual({ status: 'not-found' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  expect(await fetchEvent(event.id)).toEqual({ status: 'unavailable' });
});

it('validates the event detail response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => event }),
  );
  expect(await fetchEvent(event.id)).toEqual({ status: 'ok', event });
});
