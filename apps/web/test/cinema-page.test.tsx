import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const cinema = {
  id: 'a00af03a-4e20-44a9-8782-c0f671415199',
  name: 'TicketForge Demo Picture House',
  description: 'Fictional',
  address: 'Imaginary Lane',
  timeZone: 'UTC',
  isDemo: true,
  imageUrl: null,
};
const screening = {
  id: '43bccd6a-340a-42f0-8473-e90a06501370',
  movie: {
    id: cinema.id,
    title: 'Paper Kingdom',
    synopsis: 'An adventure',
    durationMinutes: 100,
    posterUrl: null,
    releaseDate: null,
  },
  auditorium: { id: cinema.id, name: 'Screen One' },
  startsAt: '2028-07-12T12:00:00.000Z',
  endsAt: '2028-07-12T14:00:00.000Z',
  bookingClosesAt: '2028-07-12T11:45:00.000Z',
  priceMinor: 1200,
  currency: 'USD',
  seats: [{ rowLabel: 'A', seatNumber: 1, category: 'STANDARD' }],
};
vi.mock('next/navigation', () => ({ notFound: vi.fn() }));
vi.mock('../src/lib/cinema', async () => ({
  fetchCinemas: async () => ({ status: 'ok', value: [cinema] }),
  fetchCinema: async () => ({ status: 'ok', value: cinema }),
  fetchScreenings: async () => ({ status: 'ok', value: [screening] }),
  fetchScreening: async () => ({ status: 'ok', value: screening }),
  cinemaTime: () => 'July 12, 2028 at 12:00 PM',
  cinemaPrice: () => '$12.00',
}));

it('clearly identifies fictional cinema and shows separate showtimes with demo prices', async () => {
  const { default: Cinemas } = await import('../src/app/cinemas/page');
  const { default: Cinema } = await import('../src/app/cinemas/[id]/page');
  const listing = renderToStaticMarkup(await Cinemas());
  const showtimes = renderToStaticMarkup(
    await Cinema({ params: Promise.resolve({ id: cinema.id }) }),
  );
  expect(listing).toContain('FICTIONAL DEMO CINEMA');
  expect(showtimes).toContain('Paper Kingdom');
  expect(showtimes).toContain('$12.00');
  expect(showtimes).toContain('Booking closes');
});

it('shows a physical layout without offering booking or claiming live availability', async () => {
  const { default: Screening } = await import(
    '../src/app/cinemas/[id]/screenings/[screeningId]/page'
  );
  const html = renderToStaticMarkup(
    await Screening({
      params: Promise.resolve({ id: cinema.id, screeningId: screening.id }),
    }),
  );
  expect(html).toContain('A1');
  expect(html).toContain('not live availability');
  expect(html).not.toContain('Reserve seat');
});
