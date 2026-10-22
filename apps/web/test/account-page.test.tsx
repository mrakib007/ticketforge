import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({ bookings: [] as object[] }));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'a'.repeat(64) }) }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('../src/lib/auth-api', () => ({
  currentUser: async () => ({ id: '1', email: 'demo.alice@example.com' }),
}));
vi.mock('../src/lib/bookings', () => ({
  fetchBookings: async () => ({ status: 'ok', bookings: state.bookings }),
}));

it('shows useful actions and a real empty state when there are no bookings', async () => {
  const { default: Account } = await import('../src/app/account/page');
  const html = renderToStaticMarkup(
    await Account({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain('demo.alice@example.com');
  expect(html).toContain('Explore events');
  expect(html).toContain('No bookings yet');
  expect(html).toContain('Sign out');
});

it('separates upcoming bookings from cancelled and past plans', async () => {
  const { default: Account } = await import('../src/app/account/page');
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  state.bookings = [
    {
      id: '1',
      eventId: 'a',
      quantity: 2,
      cancelledAt: null,
      event: {
        title: 'Upcoming Show',
        venue: 'Hall',
        startsAt: tomorrow,
        endsAt: tomorrow,
      },
    },
    {
      id: '2',
      eventId: 'b',
      quantity: 1,
      cancelledAt: yesterday,
      event: {
        title: 'Cancelled Show',
        venue: 'Hall',
        startsAt: tomorrow,
        endsAt: tomorrow,
      },
    },
    {
      id: '3',
      eventId: 'c',
      quantity: 1,
      cancelledAt: null,
      event: {
        title: 'Past Show',
        venue: 'Hall',
        startsAt: yesterday,
        endsAt: yesterday,
      },
    },
  ];
  const html = renderToStaticMarkup(
    await Account({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain('Upcoming plans');
  expect(html).toContain('Past &amp; cancelled');
  expect(html.indexOf('Upcoming Show')).toBeLessThan(
    html.indexOf('Cancelled Show'),
  );
  expect(html).toContain('1 upcoming');
  state.bookings = [];
});
