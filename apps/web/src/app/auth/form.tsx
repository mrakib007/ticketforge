import Link from 'next/link';
import { signIn, signUp } from './actions';

export function AuthForm({
  mode,
  error,
}: {
  mode: 'login' | 'register';
  error?: string;
}) {
  const register = mode === 'register';
  const message =
    error === 'duplicate'
      ? 'An account with this email already exists.'
      : error === 'limited'
        ? 'Too many attempts. Please wait and try again.'
        : error === 'unavailable'
          ? 'Authentication is temporarily unavailable. Try again later.'
          : error === 'invalid'
            ? 'Check your email and password and try again.'
            : null;
  return (
    <main className="shell auth-page">
      <Link className="brand" href="/">
        ticketforge<span className="brand-dot">.</span>
      </Link>
      <section className="auth-card">
        <span className="section-index">YOUR ACCOUNT</span>
        <h1>{register ? 'Create account' : 'Sign in'}</h1>
        {message && (
          <p className="auth-error" role="alert">
            {message}
          </p>
        )}
        <form action={register ? signUp : signIn}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={register ? 'new-password' : 'current-password'}
            minLength={12}
            maxLength={1024}
            required
          />
          {register && <p className="auth-hint">Use at least 12 characters.</p>}
          <button type="submit">
            {register ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p>
          {register ? 'Already have an account?' : 'New here?'}{' '}
          <Link className="event-link" href={register ? '/login' : '/register'}>
            {register ? 'Sign in' : 'Create account'}
          </Link>
        </p>
      </section>
    </main>
  );
}
