import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchEvent } from '../../../lib/events';
import { eventSchedule } from '../../../lib/event-display';
import { BookingForm } from '../../bookings/booking-form';

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
        <div className="event-detail-layout">
          <article className="catalogue-header event-detail">
            <span className="section-index">AN EVENING TO REMEMBER</span>
            <h1>{result.event.title}</h1>
            <p className="event-description">{result.event.description}</p>
            <div className="event-facts">
              <div>
                <span className="section-index">WHEN</span>
                <time dateTime={result.event.startsAt}>
                  {eventSchedule(result.event)}
                </time>
              </div>
              <div>
                <span className="section-index">WHERE</span>
                <span>{result.event.venue}</span>
              </div>
            </div>
          </article>
          <aside className="booking-panel" aria-label="Reserve tickets">
            <span className="section-index">YOUR PLACE IS WAITING</span>
            <h2>Join us.</h2>
            <p>
              {result.event.remainingSeats}{' '}
              {result.event.remainingSeats === 1 ? 'place' : 'places'} available
            </p>
            <BookingForm
              eventId={result.event.id}
              remainingSeats={result.event.remainingSeats}
            />
            <p className="booking-fineprint">
              Bookings are free in this demo. Manage or cancel them from your
              account before the event starts.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
