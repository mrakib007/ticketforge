import React from 'react';
import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const event = {
  id: '8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5',
  title: 'Night at the Observatory',
  description: 'Look up and discover the night sky.',
  venue: 'City Observatory',
  startsAt: '2028-07-12T19:00:00.000Z',
  endsAt: '2028-07-12T22:00:00.000Z',
  remainingSeats: 48,
};
vi.mock('next/navigation', () => ({ notFound: vi.fn() }));
vi.mock('../src/lib/events', () => ({
  fetchEvents: async () => ({ status: 'ok', events: [event] }),
  fetchEvent: async () => ({ status: 'ok', event }),
}));
vi.mock('../src/app/bookings/booking-form', () => ({
  BookingForm: () => <div>Booking form</div>,
}));

it('lists events with meaningful date, availability and free-booking context', async () => {
  const { default: EventsPage } = await import('../src/app/events/page');
  const html = renderToStaticMarkup(await EventsPage());
  expect(html).toContain('Night at the Observatory');
  expect(html).toContain('JUL');
  expect(html).toContain('48 places left');
  expect(html).toContain('Free booking');
  expect(html).toContain('<h2><a href="/events/');
  expect(html).toContain('/events/8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5');
});

it('explains what the attendee is booking before submitting', async () => {
  const { default: EventPage } = await import('../src/app/events/[id]/page');
  const html = renderToStaticMarkup(
    await EventPage({ params: Promise.resolve({ id: event.id }) }),
  );
  expect(html).toContain('City Observatory');
  expect(html).toContain('48 places left');
  expect(html).toContain('Free booking');
  expect(html).toContain('No payment or seat assignment');
  expect(html).toContain('Booking form');
});

it('does not offer a booking form after an event has started', async () => {
  const { default: EventPage } = await import('../src/app/events/[id]/page');
  const original = event.startsAt;
  event.startsAt = new Date(Date.now() - 60_000).toISOString();
  try {
    const html = renderToStaticMarkup(
      await EventPage({ params: Promise.resolve({ id: event.id }) }),
    );
    expect(html).toContain('New bookings are closed');
    expect(html).not.toContain('Booking form');
  } finally {
    event.startsAt = original;
  }
});
