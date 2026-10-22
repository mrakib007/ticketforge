import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({
  role: 'ORGANIZER',
  result: { status: 'ok' as string, events: [] as object[] },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'a'.repeat(64) }) }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('../src/lib/auth-api', () => ({
  currentUser: async () => ({
    id: '1',
    email: 'host@example.com',
    role: state.role,
  }),
}));
vi.mock('../src/lib/organizer', () => ({
  listOrganizerEvents: async () => state.result,
}));

it('shows an empty organizer dashboard and create action', async () => {
  const { default: Organizer } = await import('../src/app/organizer/page');
  const html = renderToStaticMarkup(await Organizer());
  expect(html).toContain('No events yet');
  expect(html).toContain('Create an event');
  expect(html).toContain('host@example.com');
});

it('does not expose the dashboard to an attendee and reports API downtime', async () => {
  const { default: Organizer } = await import('../src/app/organizer/page');
  state.role = 'ATTENDEE';
  expect(renderToStaticMarkup(await Organizer())).toContain('Access denied');
  state.role = 'ORGANIZER';
  state.result = { status: 'unavailable', events: [] };
  expect(renderToStaticMarkup(await Organizer())).toContain(
    'Event management is unavailable',
  );
});
