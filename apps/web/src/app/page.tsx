import React from 'react';
import Link from 'next/link';
import { fetchApiHealth } from '../lib/api-health';
import { fetchEvents } from '../lib/events';
import { AuthNavigation } from './auth/navigation';
import { EventCard } from './events/event-card';

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
        <div className="eyebrow">
          <span className="eyebrow-line" /> THE GOOD PART STARTS HERE
        </div>
        <h1 id="hero-title">
          Your next <em>good story</em> starts here.
        </h1>
        <p className="hero-description">
          A home for the nights you’ll talk about later. Find an event, save
          your spot for free, and keep your plans together.
        </p>
        <div className="hero-actions">
          <Link className="button-primary" href="/events">
            Explore events <span aria-hidden="true">↗</span>
          </Link>
          <Link className="button-secondary" href="/account">
            My bookings →
          </Link>
        </div>
        <div className="hero-meta">
          <span>01 · PICK YOUR NIGHT</span>
          <span>02 · RESERVE YOUR SPOT</span>
          <span>03 · KEEP YOUR PLANS</span>
        </div>
      </section>

      <section className="featured" aria-labelledby="featured-title">
        <div className="section-heading featured-heading">
          <div>
            <span className="section-index">THE LINEUP / UPCOMING</span>
            <h2 id="featured-title">Something worth leaving home for.</h2>
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
          <ul className="experience-grid">
            {catalogue.events.slice(0, 4).map((event, index) => (
              <EventCard key={event.id} event={event} index={index} />
            ))}
          </ul>
        )}
      </section>
      <section className="journey" aria-labelledby="journey-title">
        <div className="journey-lead">
          <span className="section-index">A BETTER WAY TO MAKE PLANS</span>
          <h2 id="journey-title">How booking works.</h2>
          <p>
            Three small steps between finding something good and being there.
          </p>
        </div>
        <ol className="journey-steps">
          <li>
            <span>01 / DISCOVER</span>
            <h3>Find your thing.</h3>
            <p>
              Browse upcoming events with a clear date, venue and live capacity.
            </p>
          </li>
          <li>
            <span>02 / RESERVE</span>
            <h3>Free to reserve.</h3>
            <p>
              Choose how many places you need. No payment or assigned seats.
            </p>
          </li>
          <li>
            <span>03 / RELAX</span>
            <h3>It’s in your account.</h3>
            <p>
              See your booking and cancel it before the event starts if plans
              change.
            </p>
          </li>
        </ol>
      </section>
      <section className="cinema-teaser">
        <div>
          <span className="section-index">ALSO AT TICKETFORGE</span>
          <h2>Lights down. A new chapter.</h2>
          <p>
            Explore our fictional cinema and upcoming showtimes. Seat booking is
            coming later.
          </p>
        </div>
        <Link className="button-secondary" href="/cinemas">
          Explore the cinema preview <span aria-hidden="true">↗</span>
        </Link>
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
