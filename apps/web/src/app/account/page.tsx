import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/auth-api';
import { signOut } from '../auth/actions';
import { fetchBookings } from '../../lib/bookings';
import { eventSchedule } from '../../lib/event-display';

export default async function Account() {
  const token = (await cookies()).get('ticketforge_session')?.value;
  const user = token ? await currentUser(token) : null;
  if (!user) redirect('/login');
  const bookings = await fetchBookings(token!);
  return (
    <main className="shell auth-page">
      <Link className="brand" href="/">
        ticketforge<span className="brand-dot">.</span>
      </Link>
      <section className="auth-card">
        <span className="section-index">YOUR ACCOUNT</span>
        <h1>Welcome back.</h1>
        <p>Signed in as {user.email}</p>
        <h2>Your bookings</h2>
        {bookings.status === 'unavailable' ? (
          <p>Bookings are temporarily unavailable.</p>
        ) : bookings.status !== 'ok' || bookings.bookings.length === 0 ? (
          <p>No bookings yet.</p>
        ) : (
          <ul>
            {bookings.bookings.map((booking) => (
              <li key={booking.id}>
                <Link href={`/events/${booking.eventId}`}>
                  {booking.event.title}
                </Link>
                {' · '}
                {booking.quantity} ticket{booking.quantity === 1 ? '' : 's'}
                {' · '}
                {eventSchedule(booking.event)}
              </li>
            ))}
          </ul>
        )}
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
        <Link className="event-link" href="/events">
          Explore events →
        </Link>
      </section>
    </main>
  );
}
