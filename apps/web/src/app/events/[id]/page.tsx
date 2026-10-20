import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchEvent } from '../../../lib/events';
import { eventSchedule } from '../../../lib/event-display';

export const dynamic = 'force-dynamic';

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchEvent(id);
  if (result.status === 'not-found') notFound();
  return (
    <main className="shell catalogue">
      <nav className="catalogue-nav">
        <Link className="brand" href="/">
          ticketforge<span className="brand-dot">.</span>
        </Link>
        <Link href="/events">← All events</Link>
      </nav>
      {result.status === 'unavailable' ? (
        <p role="status" className="catalogue-message">
          This event is temporarily unavailable. Please try again later.
        </p>
      ) : (
        <article className="catalogue-header event-detail">
          <span className="section-index">EVENT DETAILS</span>
          <h1>
            {result.event.title}
            <span className="brand-dot">.</span>
          </h1>
          <div className="event-meta">
            <span>{result.event.venue}</span>
            <time dateTime={result.event.startsAt}>
              {eventSchedule(result.event)}
            </time>
          </div>
          <p>{result.event.description}</p>
          <Link className="event-link" href="/events">
            ← Back to events
          </Link>
        </article>
      )}
    </main>
  );
}
