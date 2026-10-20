import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/auth-api';
import { signOut } from '../auth/actions';

export default async function Account() {
  const token = (await cookies()).get('ticketforge_session')?.value;
  const user = token ? await currentUser(token) : null;
  if (!user) redirect('/login');
  return (
    <main className="shell auth-page">
      <Link className="brand" href="/">
        ticketforge<span className="brand-dot">.</span>
      </Link>
      <section className="auth-card">
        <span className="section-index">YOUR ACCOUNT</span>
        <h1>Welcome back.</h1>
        <p>Signed in as {user.email}</p>
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
