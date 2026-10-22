import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  cinemaPrice,
  cinemaTime,
  fetchCinema,
  fetchScreenings,
} from '../../../../../lib/cinema';

export const dynamic = 'force-dynamic';
export default async function MoviePage({
  params,
}: {
  params: Promise<{ id: string; movieId: string }>;
}) {
  const { id, movieId } = await params;
  const [cinema, screenings] = await Promise.all([
    fetchCinema(id),
    fetchScreenings(id),
  ]);
  if (cinema.status === 'not-found' || screenings.status === 'not-found')
    notFound();
  if (cinema.status !== 'ok' || screenings.status !== 'ok')
    return (
      <main className="shell catalogue">
        <p role="status">Movie showtimes are temporarily unavailable.</p>
        <Link href={`/cinemas/${id}`}>Back to movies</Link>
      </main>
    );
  const shows = screenings.value.filter((show) => show.movie.id === movieId);
  const movie = shows[0]?.movie;
  if (!movie) notFound();
  return (
    <main className="shell catalogue cinema-page">
      <nav className="catalogue-nav">
        <Link href={`/cinemas/${id}`}>← Movies at {cinema.value.name}</Link>
      </nav>
      <header className="catalogue-header">
        <span className="section-index">
          {cinema.value.isDemo ? 'FICTIONAL DEMO MOVIE' : 'MOVIE'}
        </span>
        <h1>{movie.title}</h1>
        <p>{movie.synopsis}</p>
        <p>
          {movie.durationMinutes} min · {cinema.value.name} · Times in{' '}
          {cinema.value.timeZone}
        </p>
      </header>
      <h2>Upcoming screenings</h2>
      <ul className="event-grid">
        {shows.map((show) => (
          <li className="event-card" key={show.id}>
            <span className="section-index">
              {cinema.value.isDemo ? 'DEMO SHOWTIME' : 'SHOWTIME'}
            </span>
            <h3>
              <time dateTime={show.startsAt}>
                {cinemaTime(show.startsAt, cinema.value.timeZone)}
              </time>
            </h3>
            <div className="event-meta">
              <span>{show.auditorium.name}</span>
              <span>
                Demo price {cinemaPrice(show.priceMinor, show.currency)}
              </span>
            </div>
            <p>
              Booking closes{' '}
              {cinemaTime(show.bookingClosesAt, cinema.value.timeZone)}.
            </p>
            <Link
              className="event-link"
              href={`/cinemas/${id}/screenings/${show.id}`}
            >
              View layout →
            </Link>
          </li>
        ))}
      </ul>
      <p>
        Select a showtime to choose seats. Reservations are free in this demo;
        no payment is taken.
      </p>
    </main>
  );
}
