import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../src/app/auth/navigation', () => ({ AuthNavigation: () => null }));
vi.mock('../src/lib/api-health', () => ({ fetchApiHealth: async () => 'ok' }));
vi.mock('../src/lib/events', () => ({
  fetchEvents: async () => ({
    status: 'ok',
    events: [
      {
        id: '8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5',
        title: 'Night at the Observatory',
        description: 'Look up.',
        venue: 'City Observatory',
        startsAt: '2028-07-12T19:00:00Z',
        endsAt: '2028-07-12T22:00:00Z',
        remainingSeats: 100,
      },
    ],
  }),
}));

it('puts bookable events and an account path on the home page', async () => {
  const { default: Home } = await import('../src/app/page');
  const html = renderToStaticMarkup(await Home());
  expect(html).toContain('Night at the Observatory');
  expect(html).toContain('/events/8dd0b3a5-7371-46a0-82be-1ee52a9dc8b5');
  expect(html).toContain('/account');
});
