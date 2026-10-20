'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authenticate, revokeSession } from '../../lib/auth-api';

const cookieName = 'ticketforge_session';

export async function signIn(form: FormData): Promise<void> {
  await submit('login', form);
}

export async function signUp(form: FormData): Promise<void> {
  await submit('register', form);
}

async function submit(
  mode: 'login' | 'register',
  form: FormData,
): Promise<void> {
  const email = form.get('email');
  const password = form.get('password');
  const path = mode === 'login' ? '/login' : '/register';
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    email.length > 254 ||
    password.length < 12 ||
    password.length > 1024
  ) {
    redirect(`${path}?error=invalid`);
  }
  const result = await authenticate(mode, email, password);
  if (result.status !== 'ok') redirect(`${path}?error=${result.status}`);
  (await cookies()).set(cookieName, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  redirect('/account');
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await revokeSession(token);
  jar.delete(cookieName);
  redirect('/login');
}
