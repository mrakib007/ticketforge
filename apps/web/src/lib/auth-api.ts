import type { AuthResponse, PublicUser } from '@ticketforge/contracts';

const tokenPattern = /^[a-f0-9]{64}$/;

function isUser(value: unknown): value is PublicUser {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.email === 'string';
}

function apiUrl(path: string): URL {
  return new URL(path, process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001');
}

export async function authenticate(
  mode: 'login' | 'register',
  email: string,
  password: string,
): Promise<
  | { status: 'ok'; user: PublicUser; token: string }
  | { status: 'invalid' | 'duplicate' | 'unavailable' }
> {
  try {
    const response = await fetch(apiUrl(`/auth/${mode}`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 400 || response.status === 401)
      return { status: 'invalid' };
    if (response.status === 409) return { status: 'duplicate' };
    if (!response.ok) return { status: 'unavailable' };
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') return { status: 'unavailable' };
    const { user, token } = data as Partial<AuthResponse>;
    return isUser(user) && typeof token === 'string' && tokenPattern.test(token)
      ? { status: 'ok', user, token }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function currentUser(token: string): Promise<PublicUser | null> {
  if (!tokenPattern.test(token)) return null;
  try {
    const response = await fetch(apiUrl('/auth/me'), {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('user' in body)) return null;
    return isUser(body.user) ? body.user : null;
  } catch {
    return null;
  }
}

export async function revokeSession(token: string): Promise<void> {
  if (!tokenPattern.test(token)) return;
  try {
    await fetch(apiUrl('/auth/logout'), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // The local cookie is removed regardless of API availability.
  }
}
