import { expect, it } from 'vitest';
import type { PublicBooking } from '@ticketforge/contracts';
import {
  canCancelBooking,
  cancellationNotice,
} from '../src/app/account/cancellation';

const booking: PublicBooking = {
  id: '8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5',
  eventId: '8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5',
  quantity: 1,
  createdAt: '2026-01-01T00:00:00Z',
  cancelledAt: null,
  event: {
    title: 'Show',
    venue: 'Hall',
    startsAt: '2028-01-01T00:00:00Z',
    endsAt: '2028-01-01T02:00:00Z',
  },
};

it('offers cancellation only for active bookings strictly before start', () => {
  const start = Date.parse(booking.event.startsAt);
  expect(canCancelBooking(booking, start - 1)).toBe(true);
  expect(canCancelBooking(booking, start)).toBe(false);
  expect(canCancelBooking(booking, start + 1)).toBe(false);
  expect(
    canCancelBooking(
      { ...booking, cancelledAt: '2027-01-01T00:00:00Z' },
      start - 1,
    ),
  ).toBe(false);
});

it('shows success and failure messages without echoing unknown inputs', () => {
  expect(cancellationNotice('ok')).toMatch(/cancelled/);
  expect(cancellationNotice('too-late')).toMatch(/started/);
  expect(cancellationNotice('unavailable')).toMatch(/try again/);
  expect(cancellationNotice('secret')).toBeNull();
});
