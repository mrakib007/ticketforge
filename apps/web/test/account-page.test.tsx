import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'a'.repeat(64) }) }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('../src/lib/auth-api', () => ({
  currentUser: async () => ({ id: '1', email: 'demo.alice@example.com' }),
}));
vi.mock('../src/lib/bookings', () => ({
  fetchBookings: async () => ({ status: 'ok', bookings: [] }),
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
