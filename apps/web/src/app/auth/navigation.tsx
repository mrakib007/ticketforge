import Link from 'next/link';
import { cookies } from 'next/headers';
import { currentUser } from '../../lib/auth-api';
import { signOut } from './actions';

export async function AuthNavigation() {
  const token = (await cookies()).get('ticketforge_session')?.value;
  const user = token ? await currentUser(token) : null;
  return (
    <nav className="auth-nav" aria-label="Account">
      {user ? (
        <>
          <Link href="/account">My account</Link>
          <form action={signOut}>
            <button type="submit">Sign out</button>
          </form>
        </>
      ) : (
        <>
          <Link href="/login">Sign in</Link>
          <Link href="/register">Create account</Link>
        </>
      )}
    </nav>
  );
}
