import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/auth-api';
import { listOrganizerEvents } from '../../lib/organizer';
import { signOut } from '../auth/actions';

export const dynamic = 'force-dynamic';
export default async function Organizer() {
  const token = (await cookies()).get('ticketforge_session')?.value;
  const user = token ? await currentUser(token) : null;
  if (!user) redirect('/login');
  if (user.role !== 'ORGANIZER')
    return (
      <main className="shell catalogue">
        <h1>Access denied</h1>
        <Link href="/account">Back to account</Link>
      </main>
    );
  const result = await listOrganizerEvents(token!);
  return (
    <main className="shell catalogue organizer-page">
      <nav className="catalogue-nav">
        <Link className="brand" href="/">
          ticketforge<span className="brand-dot">.</span>
        </Link>
        <div className="auth-nav">
          <Link href="/events">Browse events</Link>
          <form action={signOut}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </nav>
      <header className="catalogue-header">
        <span className="section-index">ORGANIZER STUDIO</span>
        <h1>Your events.</h1>
        <p>
          Signed in as {user.email}. Create an event, then publish it when
          ready.
        </p>
        <Link className="button-primary" href="/organizer/new">
          Create an event →
        </Link>
      </header>
      {result.status !== 'ok' ? (
        <p role="alert">
          Event management is unavailable. Please try again later.
        </p>
      ) : result.events.length === 0 ? (
        <div className="empty-state">
          <h2>No events yet.</h2>
          <p>Start with a draft and publish it when you are ready.</p>
        </div>
      ) : (
        <ul className="booking-list">
          {result.events.map((event) => (
            <li className="booking-item" key={event.id}>
              <div className="booking-info">
                <span className="section-index">
                  {event.published ? 'PUBLISHED' : 'DRAFT'}
                </span>
                <h2>
                  <Link href={`/organizer/${event.id}`}>{event.title}</Link>
                </h2>
                <p>
                  {event.venue} · {new Date(event.startsAt).toUTCString()}
                </p>
              </div>
              <p>
                {event.bookedSeats} tickets booked · {event.remainingSeats}{' '}
                remaining · {event.activeBookings} active bookings ·{' '}
                {event.cancelledBookings} cancelled
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
