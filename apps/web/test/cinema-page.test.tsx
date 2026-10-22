import { readFileSync } from 'node:fs';
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
const otherScreening = {
  ...screening,
  id: '78df7272-1c81-4e5c-ad7b-47dc6bbaf4af',
  startsAt: '2028-07-13T12:00:00.000Z',
};
const otherMovieScreening = {
  ...screening,
  id: '20cd9046-0809-4a89-866d-f42c60459468',
  movie: { ...screening.movie, id: otherScreening.id, title: 'Another Film' },
};
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('404');
  },
}));
vi.mock('../src/lib/cinema', async () => ({
  fetchCinemas: async () => ({ status: 'ok', value: [cinema] }),
  fetchCinema: async () => ({ status: 'ok', value: cinema }),
  fetchScreenings: async () => ({
    status: 'ok',
    value: [screening, otherScreening, otherMovieScreening],
  }),
  fetchScreening: async () => ({ status: 'ok', value: screening }),
  cinemaTime: () => 'July 12, 2028 at 12:00 PM',
  cinemaPrice: () => '$12.00',
}));

it('lists each movie once and links to its showtimes', async () => {
  const { default: Cinemas } = await import('../src/app/cinemas/page');
  const { default: Cinema } = await import('../src/app/cinemas/[id]/page');
  const listing = renderToStaticMarkup(await Cinemas());
  const showtimes = renderToStaticMarkup(
    await Cinema({ params: Promise.resolve({ id: cinema.id }) }),
  );
  expect(listing).toContain('FICTIONAL DEMO CINEMA');
  expect(showtimes.match(/<h3>/g)).toHaveLength(2);
  expect(showtimes).toContain('Paper Kingdom');
  expect(showtimes).toContain('Another Film');
  expect(showtimes).toContain(
    `/cinemas/${cinema.id}/movies/${screening.movie.id}`,
  );
  expect(showtimes).not.toContain(`/screenings/${screening.id}`);
});

it('shows only the chosen movie’s screenings with links to their layouts', async () => {
  const { default: Movie } = await import(
    '../src/app/cinemas/[id]/movies/[movieId]/page'
  );
  const html = renderToStaticMarkup(
    await Movie({
      params: Promise.resolve({ id: cinema.id, movieId: screening.movie.id }),
    }),
  );
  expect(html).toContain('Paper Kingdom');
  expect(html).not.toContain('Another Film');
  expect(html).toContain('$12.00');
  expect(html).toContain('Booking closes');
  expect(html).toContain(`/screenings/${screening.id}`);
  expect(html).toContain(`/screenings/${otherScreening.id}`);
  await expect(
    Movie({
      params: Promise.resolve({
        id: cinema.id,
        movieId: '20cd9046-0809-4a89-866d-f42c60459469',
      }),
    }),
  ).rejects.toThrow('404');
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
  expect(html).toContain(`/cinemas/${cinema.id}/movies/${screening.movie.id}`);
  expect(html).toContain('cinema-seat-scroll');
  expect(html).toContain('not live availability');
  expect(html).not.toContain('Reserve seat');
  const css = readFileSync(
    new URL('../src/app/globals.css', import.meta.url),
    'utf8',
  );
  expect(css).toMatch(/\.cinema-seat-scroll\s*\{[^}]*overflow-x:\s*auto/s);
  expect(css).toMatch(/\.cinema-seat-layout\s*\{[^}]*width:\s*max-content/s);
});
