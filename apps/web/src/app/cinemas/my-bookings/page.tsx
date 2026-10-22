import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { fetchCinemaBookings } from '../../../lib/cinema-bookings';
import { cinemaTime } from '../../../lib/cinema';

export const dynamic = 'force-dynamic';
export default async function CinemaBookingsPage() {
  const token = (await cookies()).get('ticketforge_session')?.value;
  if (!token) redirect('/login');
  const result = await fetchCinemaBookings(token);
  if (result.status === 'unauthorized') redirect('/login');
  return (
    <main className="shell catalogue cinema-page">
      <nav className="catalogue-nav">
        <Link href="/cinemas">← Cinemas</Link>
      </nav>
      <header className="catalogue-header">
        <span className="section-index">YOUR CINEMA PLANS</span>
        <h1>Your seats.</h1>
        <p>
          Confirmed demo reservations. No payment was taken and no paid tickets
          were issued.
        </p>
      </header>
      {result.status !== 'ok' ? (
        <p role="status">Your cinema bookings are temporarily unavailable.</p>
      ) : result.bookings.length === 0 ? (
        <p>No cinema seats booked yet.</p>
      ) : (
        <ul className="booking-list">
          {result.bookings.map((booking) => (
            <li className="booking-item" key={booking.id}>
              <div className="booking-info">
                <span className="section-index">{booking.cinemaName}</span>
                <h2>
                  <Link
                    href={`/cinemas/${booking.cinemaId}/screenings/${booking.screeningId}`}
                  >
                    {booking.movieTitle}
                  </Link>
                </h2>
                <p>
                  <time dateTime={booking.startsAt}>
                    {cinemaTime(booking.startsAt, 'UTC')} UTC
                  </time>
                </p>
                <p>
                  Seats:{' '}
                  {booking.seats
                    .map((seat) => `${seat.rowLabel}${seat.seatNumber}`)
                    .join(', ')}
                </p>
              </div>
              <span className="booking-status">Confirmed</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
