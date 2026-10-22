import React from 'react';
import Link from 'next/link';
import { fetchEvents } from '../../lib/events';
import { EventCard } from './event-card';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const result = await fetchEvents();
  return (
    <main className="shell catalogue experiences-page">
      <nav className="catalogue-nav">
        <Link className="brand" href="/">
          ticketforge<span className="brand-dot">.</span>
        </Link>
        <div className="auth-nav">
          <Link href="/cinemas">Cinema preview</Link>
          <Link href="/account">My bookings</Link>
        </div>
      </nav>
      <header className="catalogue-header">
        <span className="section-index">01 / DISCOVER</span>
        <h1>
          Upcoming events<span className="brand-dot">.</span>
        </h1>
        <p>
          From nights under the stars to the unexpected. Find a date that works,
          then reserve your place for free. Times shown in UTC.
        </p>
      </header>
      {result.status === 'unavailable' ? (
        <p role="status" className="catalogue-message">
          Events are temporarily unavailable. Please try again later.
        </p>
      ) : result.events.length === 0 ? (
        <p className="catalogue-message">
          No upcoming events yet. Check back soon.
        </p>
      ) : (
        <ul className="experience-grid">
          {result.events.map((event, index) => (
            <EventCard
              key={event.id}
              event={event}
              index={index}
              headingLevel="h2"
            />
          ))}
        </ul>
      )}
    </main>
  );
}
