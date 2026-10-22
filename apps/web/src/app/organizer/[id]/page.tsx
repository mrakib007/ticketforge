import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../lib/auth-api';
import { getOrganizerEvent } from '../../../lib/organizer';
import { changePublication } from '../actions';
import { EventForm } from '../event-form';

export const dynamic = 'force-dynamic';
export default async function OrganizerEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const token = (await cookies()).get('ticketforge_session')?.value;
  const user = token ? await currentUser(token) : null;
  if (!user) redirect('/login');
  if (user.role !== 'ORGANIZER') redirect('/account');
  const result = await getOrganizerEvent(token!, (await params).id);
  if (result.status === 'not-found') notFound();
  if (result.status !== 'ok')
    return (
      <main className="shell catalogue">
        <h1>Event unavailable</h1>
        <Link href="/organizer">Try again →</Link>
      </main>
    );
  const event = result.value;
  const { error, notice } = await searchParams;
  return (
    <main className="shell catalogue organizer-page">
      <nav className="catalogue-nav">
        <Link href="/organizer">← Your events</Link>
        <Link href="/events">Browse events</Link>
      </nav>
      <header className="catalogue-header">
        <span className="section-index">
          {event.published ? 'PUBLISHED EVENT' : 'DRAFT EVENT'}
        </span>
        <h1>{event.title}</h1>
        <p>
          {event.bookedSeats} tickets booked · {event.remainingSeats} remaining
          · {event.activeBookings} active bookings · {event.cancelledBookings}{' '}
          cancelled
        </p>
      </header>
      {notice && (
        <p className="notice" role="status">
          Event {notice}.
        </p>
      )}
      {error && (
        <p role="alert">
          {error === 'conflict'
            ? 'This change conflicts with existing bookings or the event start time.'
            : error === 'invalid'
              ? 'Check all fields, dates and capacity.'
              : 'Could not update this event. Please try again.'}
        </p>
      )}
      <section>
        <h2>Edit event</h2>
        <EventForm event={event} />
      </section>
      <section className="organizer-publish">
        <h2>{event.published ? 'Unpublish' : 'Publish'} event</h2>
        <p>
          {event.published
            ? 'Only events without active bookings can be unpublished.'
            : 'Publishing makes this event visible and bookable to attendees.'}
        </p>
        <form action={changePublication.bind(null, event.id, !event.published)}>
          <button className="button-secondary" type="submit">
            Confirm {event.published ? 'unpublish' : 'publish'}
          </button>
        </form>
      </section>
    </main>
  );
}
