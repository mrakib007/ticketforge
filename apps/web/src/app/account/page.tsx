import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/auth-api';
import { signOut } from '../auth/actions';
import { fetchBookings } from '../../lib/bookings';
import { eventSchedule } from '../../lib/event-display';
import { cancelMyBooking } from './actions';
import { canCancelBooking, cancellationNotice } from './cancellation';
import type { PublicBooking } from '@ticketforge/contracts';

function BookingList({ bookings }: { bookings: PublicBooking[] }) {
  return (
    <ul className="booking-list">
      {bookings.map((booking) => (
        <li key={booking.id} className="booking-item">
          <div className="booking-info">
            <span className="section-index">
              FREE BOOKING · {booking.event.venue}
            </span>
            <h3>
              <Link href={`/events/${booking.eventId}`}>
                {booking.event.title}
              </Link>
            </h3>
            <p>
              <time dateTime={booking.event.startsAt}>
                {eventSchedule(booking.event)}
              </time>{' '}
              · {booking.quantity} {booking.quantity === 1 ? 'place' : 'places'}
            </p>
          </div>
          <div className="booking-controls">
            <span
              className={`booking-status ${booking.cancelledAt ? 'is-cancelled' : ''}`}
            >
              {booking.cancelledAt ? 'Cancelled' : 'Confirmed'}
            </span>
            {canCancelBooking(booking) && (
              <form action={cancelMyBooking.bind(null, booking.id)}>
                <button className="text-button" type="submit">
                  Cancel booking
                </button>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ cancel?: string }>;
}) {
  const token = (await cookies()).get('ticketforge_session')?.value;
  const user = token ? await currentUser(token) : null;
  if (!user) redirect('/login');
  const bookings = await fetchBookings(token!);
  const notice = cancellationNotice((await searchParams).cancel);
  const upcoming =
    bookings.status === 'ok'
      ? bookings.bookings.filter(
          (booking) =>
            !booking.cancelledAt &&
            Date.parse(booking.event.startsAt) > Date.now(),
        )
      : [];
  const history =
    bookings.status === 'ok'
      ? bookings.bookings.filter(
          (booking) =>
            booking.cancelledAt ||
            Date.parse(booking.event.startsAt) <= Date.now(),
        )
      : [];

  return (
    <main className="shell catalogue account-page">
      <nav className="catalogue-nav">
        <Link className="brand" href="/">
          ticketforge<span className="brand-dot">.</span>
        </Link>
        <div className="auth-nav">
          <Link href="/events">Browse events</Link>
          <Link href="/cinemas/my-bookings">Cinema seats</Link>
          {user.role === 'ORGANIZER' && (
            <Link href="/organizer">Manage events</Link>
          )}
          <form action={signOut}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </nav>
      <header className="catalogue-header account-header">
        <span className="section-index">YOUR SPACE</span>
        <h1>Your bookings.</h1>
        <p>
          Signed in as <strong>{user.email}</strong>. Your plans, all in one
          place.
        </p>
      </header>
      <section className="account-content" aria-labelledby="bookings-title">
        <div className="account-section-heading">
          <div>
            <span className="section-index">YOUR PLANS</span>
            <h2 id="bookings-title">Your plans, in one place.</h2>
          </div>
          <span className="booking-count">{upcoming.length} upcoming</span>
        </div>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {bookings.status === 'unavailable' ? (
          <div className="empty-state">
            <h3>We couldn’t load your bookings.</h3>
            <p>
              Your bookings are still saved. The service isn’t responding right
              now; please refresh this page in a moment.
            </p>
            <Link className="button-secondary" href="/account">
              Try again →
            </Link>
          </div>
        ) : bookings.status !== 'ok' ? (
          <div className="empty-state">
            <h3>Session expired</h3>
            <p>Sign in again to see your bookings.</p>
            <Link className="button-secondary" href="/login">
              Sign in →
            </Link>
          </div>
        ) : bookings.bookings.length === 0 ? (
          <div className="empty-state">
            <span className="empty-symbol" aria-hidden="true">
              ✳
            </span>
            <h3>No bookings yet.</h3>
            <p>
              Good plans start with a place to go. Explore what’s on and reserve
              your spot.
            </p>
            <Link className="button-primary" href="/events">
              Explore events <span aria-hidden="true">↗</span>
            </Link>
          </div>
        ) : (
          <div className="booking-groups">
            <section aria-labelledby="upcoming-bookings">
              <h3 id="upcoming-bookings">Upcoming plans</h3>
              {upcoming.length ? (
                <BookingList bookings={upcoming} />
              ) : (
                <p className="booking-empty">
                  Nothing upcoming yet.{' '}
                  <Link href="/events">Find an event →</Link>
                </p>
              )}
            </section>
            {history.length > 0 && (
              <section aria-labelledby="past-bookings">
                <h3 id="past-bookings">Past &amp; cancelled</h3>
                <BookingList bookings={history} />
              </section>
            )}
          </div>
        )}
      </section>
      <footer className="site-footer">
        <span>© TICKETFORGE</span>
        <Link href="/events">Explore more events →</Link>
      </footer>
    </main>
  );
}
