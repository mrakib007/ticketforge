import React from 'react';
import Link from 'next/link';
import { fetchCinemas } from '../../lib/cinema';

export const dynamic = 'force-dynamic';
export default async function CinemasPage() {
  const result = await fetchCinemas();
  return (
    <main className="shell catalogue cinema-page">
      <nav className="catalogue-nav">
        <Link className="brand" href="/">
          ticketforge<span className="brand-dot">.</span>
        </Link>
        <Link href="/events">Events</Link>
      </nav>
      <header className="catalogue-header">
        <span className="section-index">CINEMA PREVIEW</span>
        <h1>At the movies.</h1>
        <p>
          Explore fictional demo screenings and prices. Seat booking and payment
          are not available yet.
        </p>
      </header>
      {result.status !== 'ok' ? (
        <p role="status">Cinemas are temporarily unavailable.</p>
      ) : result.value.length === 0 ? (
        <p>No cinemas listed yet.</p>
      ) : (
        <ul className="event-grid">
          {result.value.map((cinema) => (
            <li className="event-card" key={cinema.id}>
              <span className="section-index">
                {cinema.isDemo ? 'FICTIONAL DEMO CINEMA' : 'CINEMA'}
              </span>
              <h2>
                <Link href={`/cinemas/${cinema.id}`}>{cinema.name}</Link>
              </h2>
              <p>{cinema.description}</p>
              <div className="event-meta">{cinema.address}</div>
              <Link className="event-link" href={`/cinemas/${cinema.id}`}>
                View showtimes →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
