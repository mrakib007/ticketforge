import Link from 'next/link';
import { fetchEvents } from '../../lib/events';
import { eventSchedule } from '../../lib/event-display';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const result = await fetchEvents();
  return (
    <main className="shell catalogue">
      <nav className="catalogue-nav">
        <Link className="brand" href="/">
          ticketforge<span className="brand-dot">.</span>
        </Link>
        <Link href="/">← Home</Link>
      </nav>
      <header className="catalogue-header">
        <span className="section-index">THE CATALOGUE</span>
        <h1>
          Upcoming events<span className="brand-dot">.</span>
        </h1>
        <p>
          Make plans worth keeping. Browse what’s coming up and reserve your
          place. Times shown in UTC.
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
        <ul className="event-grid">
          {result.events.map((event) => (
            <li key={event.id} className="event-card">
              <span className="section-index">
                {event.remainingSeats > 0
                  ? `${event.remainingSeats} PLACES LEFT`
                  : 'SOLD OUT'}
              </span>
              <h2>
                <Link href={`/events/${event.id}`}>{event.title}</Link>
              </h2>
              <p>{event.description}</p>
              <div className="event-meta">
                <span>{event.venue}</span>
                <time dateTime={event.startsAt}>{eventSchedule(event)}</time>
              </div>
              <Link className="event-link" href={`/events/${event.id}`}>
                View event →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
