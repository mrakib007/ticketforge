import React from 'react';
import Link from 'next/link';
import { fetchApiHealth } from '../lib/api-health';
import { fetchEvents } from '../lib/events';
import { eventSchedule } from '../lib/event-display';
import { AuthNavigation } from './auth/navigation';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [health, catalogue] = await Promise.all([
    fetchApiHealth(),
    fetchEvents(),
  ]);

  return (
    <main className="shell home-page">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="TicketForge home">
          ticketforge<span className="brand-dot">.</span>
        </Link>
        <AuthNavigation />
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="eyebrow">GOOD NIGHTS BEGIN HERE</div>
        <h1 id="hero-title">
          Make room for <em>the memorable.</em>
        </h1>
        <p className="hero-description">
          Discover what’s coming up, save your place, and keep every booking in
          one place.
        </p>
        <div className="hero-actions">
          <Link className="button-primary" href="/events">
            Explore events <span aria-hidden="true">↗</span>
          </Link>
          <Link className="button-secondary" href="/account">
            My bookings →
          </Link>
          <Link className="button-secondary" href="/cinemas">
            Cinema preview →
          </Link>
        </div>
        <div className="hero-meta">
          <span>CURATED EXPERIENCES</span>
          <span>REAL-TIME AVAILABILITY</span>
          <span>YOUR NIGHT, YOUR WAY</span>
        </div>
      </section>

      <section className="featured" aria-labelledby="featured-title">
        <div className="section-heading featured-heading">
          <div>
            <span className="section-index">UP NEXT</span>
            <h2 id="featured-title">Find your next night out.</h2>
          </div>
          <Link className="event-link" href="/events">
            All events →
          </Link>
        </div>
        {catalogue.status === 'unavailable' ? (
          <p role="status" className="catalogue-message">
            Events aren’t loading right now. Check the connection and try again.
          </p>
        ) : catalogue.events.length === 0 ? (
          <p className="catalogue-message">
            Nothing on the calendar yet. Check back soon for upcoming events.
          </p>
        ) : (
          <ul className="event-grid">
            {catalogue.events.slice(0, 4).map((event) => (
              <li className="event-card" key={event.id}>
                <span className="section-index">
                  {event.remainingSeats > 0
                    ? `${event.remainingSeats} PLACES LEFT`
                    : 'SOLD OUT'}
                </span>
                <h3>
                  <Link href={`/events/${event.id}`}>{event.title}</Link>
                </h3>
                <p>{event.description}</p>
                <div className="event-meta">
                  <span>{event.venue}</span>
                  <time dateTime={event.startsAt}>{eventSchedule(event)}</time>
                </div>
                <Link className="event-link" href={`/events/${event.id}`}>
                  See event <span aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <footer className="site-footer">
        <span>© TICKETFORGE</span>
        <span>Events worth showing up for.</span>
        <span className={health === 'ok' ? 'service-ok' : 'service-down'}>
          {health === 'ok'
            ? '● Booking service online'
            : '● Booking service unavailable — please try later'}
        </span>
      </footer>
    </main>
  );
}
