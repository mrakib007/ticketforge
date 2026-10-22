import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  cinemaPrice,
  cinemaTime,
  fetchCinema,
  fetchScreening,
} from '../../../../../lib/cinema';
import { SeatPicker } from './seat-picker';

export const dynamic = 'force-dynamic';
export default async function ScreeningPage({
  params,
}: {
  params: Promise<{ id: string; screeningId: string }>;
}) {
  const { id, screeningId } = await params;
  const [cinema, screening] = await Promise.all([
    fetchCinema(id),
    fetchScreening(id, screeningId),
  ]);
  if (cinema.status === 'not-found' || screening.status === 'not-found')
    notFound();
  if (cinema.status !== 'ok' || screening.status !== 'ok')
    return (
      <main className="shell catalogue">
        <p role="status">Screening is temporarily unavailable.</p>
        <Link href="/cinemas">Back to cinemas</Link>
      </main>
    );
  const show = screening.value;
  return (
    <main className="shell catalogue cinema-page">
      <nav className="catalogue-nav">
        <Link href={`/cinemas/${id}/movies/${show.movie.id}`}>
          ← All showtimes
        </Link>
      </nav>
      <header className="catalogue-header">
        <span className="section-index">FICTIONAL DEMO SCREENING</span>
        <h1>{show.movie.title}</h1>
        <p>{show.movie.synopsis}</p>
        <p>
          {cinema.value.name} · {show.auditorium.name} ·{' '}
          {cinemaTime(show.startsAt, cinema.value.timeZone)} (
          {cinema.value.timeZone})
        </p>
        <p>
          Demo price {cinemaPrice(show.priceMinor, show.currency)} · Booking
          cutoff {cinemaTime(show.bookingClosesAt, cinema.value.timeZone)}
        </p>
      </header>
      <section aria-labelledby="seat-heading">
        <h2 id="seat-heading">Auditorium layout</h2>
        <SeatPicker cinemaId={id} screening={show} />
      </section>
    </main>
  );
}
