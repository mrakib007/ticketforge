import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchCinema, fetchScreenings } from '../../../lib/cinema';

export const dynamic = 'force-dynamic';
export default async function CinemaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [cinema, screenings] = await Promise.all([
    fetchCinema(id),
    fetchScreenings(id),
  ]);
  if (cinema.status === 'not-found' || screenings.status === 'not-found')
    notFound();
  if (cinema.status !== 'ok' || screenings.status !== 'ok')
    return (
      <main className="shell catalogue">
        <p role="status">Cinema listings are temporarily unavailable.</p>
        <Link href="/cinemas">Back to cinemas</Link>
      </main>
    );
  const movies = new Map<
    string,
    { movie: (typeof screenings.value)[number]['movie']; count: number }
  >();
  for (const show of screenings.value) {
    const entry = movies.get(show.movie.id);
    if (entry) entry.count += 1;
    else movies.set(show.movie.id, { movie: show.movie, count: 1 });
  }
  return (
    <main className="shell catalogue cinema-page">
      <nav className="catalogue-nav">
        <Link href="/cinemas">← Cinemas</Link>
        <Link href="/events">Events</Link>
      </nav>
      <header className="catalogue-header">
        <span className="section-index">
          {cinema.value.isDemo ? 'FICTIONAL DEMO CINEMA' : 'CINEMA'}
        </span>
        <h1>{cinema.value.name}</h1>
        <p>
          {cinema.value.description} · {cinema.value.address}
        </p>
        <p>
          Times in {cinema.value.timeZone}. Listed prices are demo prices, not
          tickets for a real cinema.
        </p>
      </header>
      <h2>Now showing</h2>
      {movies.size === 0 ? (
        <p>No upcoming movies yet.</p>
      ) : (
        <ul className="event-grid">
          {Array.from(movies.values()).map(({ movie, count }) => (
            <li className="event-card" key={movie.id}>
              <span className="section-index">
                {cinema.value.isDemo ? 'FICTIONAL DEMO MOVIE' : 'MOVIE'}
              </span>
              <h3>
                <Link href={`/cinemas/${id}/movies/${movie.id}`}>
                  {movie.title}
                </Link>
              </h3>
              <p>{movie.synopsis}</p>
              <div className="event-meta">
                {movie.durationMinutes} min · {count} upcoming{' '}
                {count === 1 ? 'screening' : 'screenings'}
              </div>
              <Link
                className="event-link"
                href={`/cinemas/${id}/movies/${movie.id}`}
              >
                View showtimes →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
