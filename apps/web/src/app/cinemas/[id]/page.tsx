import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  cinemaPrice,
  cinemaTime,
  fetchCinema,
  fetchScreenings,
} from '../../../lib/cinema';

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
      <h2>Upcoming screenings</h2>
      {screenings.value.length === 0 ? (
        <p>No upcoming screenings yet.</p>
      ) : (
        <ul className="event-grid">
          {screenings.value.map((show) => (
            <li className="event-card" key={show.id}>
              <span className="section-index">DEMO SHOWTIME</span>
              <h3>
                <Link href={`/cinemas/${id}/screenings/${show.id}`}>
                  {show.movie.title}
                </Link>
              </h3>
              <p>{show.movie.synopsis}</p>
              <div className="event-meta">
                <time dateTime={show.startsAt}>
                  {cinemaTime(show.startsAt, cinema.value.timeZone)}
                </time>
                <span>
                  {show.auditorium.name} ·{' '}
                  {cinemaPrice(show.priceMinor, show.currency)}
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
      )}
    </main>
  );
}
