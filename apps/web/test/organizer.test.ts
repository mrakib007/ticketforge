import { afterEach, expect, it, vi } from 'vitest';
import { listOrganizerEvents, saveOrganizerEvent } from '../src/lib/organizer';

afterEach(() => vi.unstubAllGlobals());
const token = 'a'.repeat(64);
const event = {
  id: '8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5',
  title: 'Concert',
  description: 'Live show',
  venue: 'Hall',
  startsAt: '2028-07-12T19:00:00.000Z',
  endsAt: '2028-07-12T22:00:00.000Z',
  capacity: 100,
  bookedSeats: 0,
  remainingSeats: 100,
  published: false,
  activeBookings: 0,
  cancelledBookings: 0,
};

it('validates organizer API responses and uses only a server-side token', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ events: [event] }) });
  vi.stubGlobal('fetch', fetch);
  expect(await listOrganizerEvents(token)).toEqual({
    status: 'ok',
    events: [event],
  });
  expect(fetch.mock.calls[0]![1].headers.authorization).toBe(`Bearer ${token}`);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [{ ...event, bookedSeats: 101 }] }),
    }),
  );
  expect(await listOrganizerEvents(token)).toEqual({ status: 'unavailable' });
});

it('surfaces form errors and backend conflicts without trusting user-supplied ownership', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 409 }));
  expect(
    (
      await saveOrganizerEvent(token, {
        title: 'Concert',
        description: 'Show',
        venue: 'Hall',
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        capacity: 100,
      })
    ).status,
  ).toBe('conflict');
  expect(
    (
      await saveOrganizerEvent(token, {
        title: '',
        description: 'Show',
        venue: 'Hall',
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        capacity: 100,
      })
    ).status,
  ).toBe('invalid');
});
