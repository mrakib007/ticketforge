import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  cinemaPrice,
  cinemaTime,
  fetchCinema,
  fetchScreening,
} from '../../../../../lib/cinema';

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
        <Link href={`/cinemas/${id}`}>← All showtimes</Link>
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
        <p role="status">
          Layout preview only. These are physical seats,{' '}
          <strong>not live availability</strong>. Seat selection and checkout
          are not available yet.
        </p>
        <div className="cinema-screen">SCREEN</div>
        <div className="cinema-seat-map">
          {show.seats.map((seat) => (
            <span
              className="cinema-seat"
              key={`${seat.rowLabel}-${seat.seatNumber}`}
              title={seat.category}
            >
              {seat.rowLabel}
              {seat.seatNumber}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
